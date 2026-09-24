import math
from typing import Dict, Any, List
import pandas as pd
import numpy as np

from app.services.profiler import classify_column_type
from app.services.text_cleaner import TextCleanerService
from app.services.type_detector import TypeDetectorService


class QualityScoreService:
    """
    Computes a weighted data quality score with four sub-dimensions:
      score = 0.40*completeness + 0.25*consistency + 0.20*validity + 0.15*uniqueness

    Each sub-score ranges from 0.0 to 1.0.
    """

    WEIGHTS = {
        "completeness": 0.40,
        "consistency": 0.25,
        "validity": 0.20,
        "uniqueness": 0.15,
    }

    @classmethod
    def compute(cls, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Computes overall quality score and four sub-scores for the given DataFrame.
        Returns a dict with overall_score and sub_scores list.
        """
        row_count = len(df)
        col_count = len(df.columns)
        total_cells = row_count * col_count

        # ── Completeness ─────────────────────────────────────────────────
        # completeness = 1 - (missing_cells / total_cells)
        if total_cells == 0:
            completeness = 1.0
            completeness_detail = "No data to evaluate"
        else:
            missing_cells = int(df.isna().sum().sum())
            completeness = 1.0 - (missing_cells / total_cells)
            completeness_detail = f"{missing_cells} missing cell(s) out of {total_cells} total"

        # ── Consistency ──────────────────────────────────────────────────
        # consistency = 1 - (inconsistent_categorical_values / total_categorical_cells)
        # "Inconsistent" = values that belong to a near-duplicate cluster (non-canonical variants)
        cat_columns = [col for col in df.columns if classify_column_type(df[col]) == "categorical"]
        total_cat_cells = 0
        inconsistent_count = 0

        for col in cat_columns:
            non_null_count = int(df[col].notna().sum())
            total_cat_cells += non_null_count

            try:
                clusters = TextCleanerService.cluster_near_duplicates(
                    df[col], similarity_threshold=0.85, max_clusters=100
                )
                for cluster in clusters:
                    inconsistent_count += cluster["total_affected"]
            except Exception:
                pass

        if total_cat_cells == 0:
            consistency = 1.0
            consistency_detail = "No categorical columns to evaluate"
        else:
            consistency = 1.0 - (inconsistent_count / total_cat_cells)
            consistency = max(0.0, consistency)
            consistency_detail = f"{inconsistent_count} inconsistent value(s) across {len(cat_columns)} categorical column(s)"

        # ── Validity ─────────────────────────────────────────────────────
        # validity = 1 - (type/format/range check failures / total_cells)
        # A "failure" is a non-null cell that the type detector says should be converted,
        # implying the current type doesn't match the data's natural type.
        invalid_count = 0

        if total_cells > 0:
            try:
                suggestions = TypeDetectorService.suggest_types(df)
                for suggestion in suggestions:
                    col_name = suggestion["column"]
                    confidence = suggestion.get("confidence", 0)
                    # Count cells that would be affected by the suggestion
                    # Higher confidence = more cells are "invalid" for current type
                    non_null_in_col = int(df[col_name].notna().sum())
                    # Scale by confidence: if confidence is 1.0, all non-null cells are "mistyped"
                    invalid_count += int(non_null_in_col * confidence * 0.5)
            except Exception:
                pass

            # Also check for numerical columns with potential range issues (inf values)
            for col in df.columns:
                if pd.api.types.is_numeric_dtype(df[col]):
                    inf_count = int(np.isinf(df[col].dropna().values).sum()) if len(df[col].dropna()) > 0 else 0
                    invalid_count += inf_count

        if total_cells == 0:
            validity = 1.0
            validity_detail = "No data to evaluate"
        else:
            validity = 1.0 - (invalid_count / total_cells)
            validity = max(0.0, validity)
            validity_detail = f"{invalid_count} potential type/format issue(s) out of {total_cells} cells"

        # ── Uniqueness ───────────────────────────────────────────────────
        # uniqueness = 1 - (duplicate_rows / total_rows)
        if row_count == 0:
            uniqueness = 1.0
            uniqueness_detail = "No rows to evaluate"
        else:
            try:
                dup_count = int(df.duplicated().sum())
            except TypeError:
                dup_count = int(df.astype(str).duplicated().sum())
            uniqueness = 1.0 - (dup_count / row_count)
            uniqueness_detail = f"{dup_count} duplicate row(s) out of {row_count}"

        # ── Overall Score ────────────────────────────────────────────────
        overall = (
            cls.WEIGHTS["completeness"] * completeness
            + cls.WEIGHTS["consistency"] * consistency
            + cls.WEIGHTS["validity"] * validity
            + cls.WEIGHTS["uniqueness"] * uniqueness
        )
        overall = round(overall, 4)

        sub_scores = [
            {
                "name": "completeness",
                "score": round(completeness, 4),
                "weight": cls.WEIGHTS["completeness"],
                "detail": completeness_detail,
            },
            {
                "name": "consistency",
                "score": round(consistency, 4),
                "weight": cls.WEIGHTS["consistency"],
                "detail": consistency_detail,
            },
            {
                "name": "validity",
                "score": round(validity, 4),
                "weight": cls.WEIGHTS["validity"],
                "detail": validity_detail,
            },
            {
                "name": "uniqueness",
                "score": round(uniqueness, 4),
                "weight": cls.WEIGHTS["uniqueness"],
                "detail": uniqueness_detail,
            },
        ]

        return {
            "overall_score": overall,
            "sub_scores": sub_scores,
        }
