import re
from typing import List, Dict, Any, Optional, Tuple
import pandas as pd
import numpy as np
from app.core.errors import AppError


class TypeDetectorService:
    """
    Analyzes DataFrame columns to suggest optimal data types with confidence scores,
    and executes type conversions.
    """

    BOOLEAN_TRUE = {"true", "1", "yes", "y", "t"}
    BOOLEAN_FALSE = {"false", "0", "no", "n", "f"}
    BOOLEAN_ALL = BOOLEAN_TRUE | BOOLEAN_FALSE

    @classmethod
    def suggest_types(cls, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """
        Inspects all columns and returns suggestions for columns that can be converted
        to a more specific/optimal data type with a confidence score.
        """
        suggestions = []

        for col in df.columns:
            s = df[col]
            non_null = s.dropna()
            total_non_null = len(non_null)

            if total_non_null == 0:
                continue

            current_dtype = str(s.dtype)
            suggestion = None

            # Case 1: Float column that contains strictly whole numbers -> Integer
            if pd.api.types.is_float_dtype(s):
                try:
                    is_all_int = (non_null % 1 == 0).all()
                    if is_all_int:
                        sample_orig = [float(x) for x in non_null.head(3).tolist()]
                        sample_conv = [int(x) for x in sample_orig]
                        suggestion = {
                            "column": col,
                            "current_type": current_dtype,
                            "suggested_type": "integer",
                            "confidence": 1.0,
                            "reason": "All floating-point values are exact whole numbers",
                            "sample_from": sample_orig,
                            "sample_to": sample_conv,
                        }
                except Exception:
                    pass

            # Case 2: Object / String column
            elif pd.api.types.is_object_dtype(s) or pd.api.types.is_string_dtype(s):
                str_vals = non_null.astype(str).str.strip()

                # Test 2a: Boolean
                lowered = str_vals.str.lower()
                bool_matches = lowered.isin(cls.BOOLEAN_ALL).sum()
                if bool_matches / total_non_null >= 0.9:
                    confidence = round(bool_matches / total_non_null, 2)
                    sample_orig = str_vals.head(3).tolist()
                    sample_conv = [x.lower() in cls.BOOLEAN_TRUE for x in sample_orig]
                    suggestion = {
                        "column": col,
                        "current_type": current_dtype,
                        "suggested_type": "boolean",
                        "confidence": confidence,
                        "reason": f"{int(confidence * 100)}% of values match standard boolean tokens",
                        "sample_from": sample_orig,
                        "sample_to": sample_conv,
                    }

                # Test 2b: Integer
                if not suggestion:
                    clean_int_pattern = re.compile(r"^-?\d+$")
                    int_matches = str_vals.apply(lambda x: bool(clean_int_pattern.match(x))).sum()
                    if int_matches / total_non_null >= 0.85:
                        confidence = round(int_matches / total_non_null, 2)
                        sample_orig = str_vals.head(3).tolist()
                        sample_conv = [int(x) if clean_int_pattern.match(x) else None for x in sample_orig]
                        suggestion = {
                            "column": col,
                            "current_type": current_dtype,
                            "suggested_type": "integer",
                            "confidence": confidence,
                            "reason": f"{int(confidence * 100)}% of text values contain only numeric digits",
                            "sample_from": sample_orig,
                            "sample_to": sample_conv,
                        }

                # Test 2c: Float (e.g. "12.34" or "1,234.56")
                if not suggestion:
                    cleaned_nums = str_vals.str.replace(",", "", regex=False)
                    try:
                        parsed_floats = pd.to_numeric(cleaned_nums, errors="coerce")
                        valid_float_count = parsed_floats.notna().sum()
                        if valid_float_count / total_non_null >= 0.85:
                            confidence = round(valid_float_count / total_non_null, 2)
                            sample_orig = str_vals.head(3).tolist()
                            sample_conv = parsed_floats.head(3).tolist()
                            suggestion = {
                                "column": col,
                                "current_type": current_dtype,
                                "suggested_type": "float",
                                "confidence": confidence,
                                "reason": f"{int(confidence * 100)}% of values parse as numeric decimal",
                                "sample_from": sample_orig,
                                "sample_to": sample_conv,
                            }
                    except Exception:
                        pass

                # Test 2d: Datetime
                if not suggestion:
                    # Check for date-like delimiters
                    sample_subset = str_vals.head(100)
                    has_date_symbols = sample_subset.str.contains(r"[-/:]", regex=True).mean() > 0.7
                    if has_date_symbols:
                        try:
                            parsed_dates = pd.to_datetime(sample_subset, errors="coerce", format="mixed")
                            valid_dates = parsed_dates.notna().sum()
                            if valid_dates / len(sample_subset) >= 0.85:
                                confidence = round(valid_dates / len(sample_subset), 2)
                                sample_orig = str_vals.head(3).tolist()
                                sample_conv = [
                                    str(d)[:10] if pd.notna(d) else None
                                    for d in pd.to_datetime(str_vals.head(3), errors="coerce", format="mixed")
                                ]
                                suggestion = {
                                    "column": col,
                                    "current_type": current_dtype,
                                    "suggested_type": "datetime",
                                    "confidence": confidence,
                                    "reason": f"{int(confidence * 100)}% of values parse into datetime stamps",
                                    "sample_from": sample_orig,
                                    "sample_to": sample_conv,
                                }
                        except Exception:
                            pass

            if suggestion:
                suggestions.append(suggestion)

        return suggestions

    @classmethod
    def convert_type(
        cls,
        series: pd.Series,
        target_type: str,
        date_format: Optional[str] = None,
        errors_strategy: str = "coerce",
    ) -> Tuple[pd.Series, int, str]:
        """
        Converts series to target_type ('integer', 'float', 'datetime', 'boolean', 'string').
        Returns (converted_series, affected_rows, summary_message).
        """
        original = series.copy()
        s = series.copy()
        total_rows = len(s)

        if target_type == "integer":
            if pd.api.types.is_object_dtype(s) or pd.api.types.is_string_dtype(s):
                s = s.astype(str).str.replace(",", "", regex=False)
            numeric_s = pd.to_numeric(s, errors="coerce")
            # Nullable integer type
            converted = numeric_s.round().astype("Int64")
            new_nulls = int(converted.isna().sum() - original.isna().sum())
            affected = int((original.astype(str) != converted.astype(str)).sum())
            summary = f"Converted to integer (Int64). {len(converted.dropna())} valid values"
            if new_nulls > 0:
                summary += f", {new_nulls} unparseable value(s) set to null"

        elif target_type == "float":
            if pd.api.types.is_object_dtype(s) or pd.api.types.is_string_dtype(s):
                s = s.astype(str).str.replace(",", "", regex=False)
            converted = pd.to_numeric(s, errors="coerce")
            new_nulls = int(converted.isna().sum() - original.isna().sum())
            affected = int((original.astype(str) != converted.astype(str)).sum())
            summary = f"Converted to float. {len(converted.dropna())} valid numbers"
            if new_nulls > 0:
                summary += f", {new_nulls} unparseable value(s) set to null"

        elif target_type == "datetime":
            converted = pd.to_datetime(s, format=date_format, errors="coerce")
            new_nulls = int(converted.isna().sum() - original.isna().sum())
            affected = int(converted.notna().sum())
            summary = f"Converted to datetime. {len(converted.dropna())} timestamps parsed"
            if new_nulls > 0:
                summary += f", {new_nulls} unparseable value(s) set to null"

        elif target_type == "boolean":
            str_vals = s.astype(str).str.strip().str.lower()
            converted = str_vals.map(lambda v: True if v in cls.BOOLEAN_TRUE else (False if v in cls.BOOLEAN_FALSE else pd.NA))
            converted = converted.astype("boolean")
            new_nulls = int(converted.isna().sum() - original.isna().sum())
            affected = int((original.astype(str) != converted.astype(str)).sum())
            summary = f"Converted to boolean. {len(converted.dropna())} boolean flags"
            if new_nulls > 0:
                summary += f", {new_nulls} non-boolean value(s) set to null"

        elif target_type in ("string", "text"):
            converted = s.astype("string")
            affected = int((original.dtype != converted.dtype))
            summary = f"Converted column dtype to string"

        else:
            raise AppError(
                code="INVALID_TARGET_TYPE",
                message=f"Unsupported target type '{target_type}'. Use: integer, float, datetime, boolean, string.",
                status_code=400,
            )

        return converted, affected, summary
