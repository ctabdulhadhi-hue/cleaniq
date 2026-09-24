import math
from datetime import datetime
from typing import Dict, Any, List
import pandas as pd
import numpy as np

from app.models.dataset import ColumnProfile, DatasetProfileResponse, ColumnStatistics, ColumnStatsResponse


def format_bytes(num_bytes: int) -> str:
    """Format bytes into a human-readable string representation."""
    if num_bytes < 0:
        return "0 B"
    if num_bytes < 1024:
        return f"{num_bytes} B"
    elif num_bytes < 1024**2:
        return f"{num_bytes / 1024:.2f} KB"
    elif num_bytes < 1024**3:
        return f"{num_bytes / (1024**2):.2f} MB"
    else:
        return f"{num_bytes / (1024**3):.2f} GB"


def classify_column_type(series: pd.Series) -> str:
    """
    Classifies a pandas Series into one of four core categories:
    - 'boolean'
    - 'date'
    - 'numerical'
    - 'categorical'
    """
    dtype = series.dtype

    # 1. Boolean check
    if pd.api.types.is_bool_dtype(dtype) or str(dtype).lower() in ("bool", "boolean"):
        return "boolean"

    non_null = series.dropna()
    if len(non_null) > 0 and all(isinstance(x, (bool, np.bool_)) for x in non_null):
        return "boolean"

    # 2. Datetime / Date check
    if pd.api.types.is_datetime64_any_dtype(dtype) or pd.api.types.is_timedelta64_dtype(dtype):
        return "date"

    if pd.api.types.is_object_dtype(dtype) or pd.api.types.is_string_dtype(dtype):
        if len(non_null) > 0 and all(isinstance(x, (datetime, pd.Timestamp)) for x in non_null):
            return "date"

        # Check if sample strings are valid parseable dates
        if len(non_null) > 0:
            sample = non_null.head(30)
            # Only test sample if strings contain date-like delimiters to avoid false positives on numbers
            if all(isinstance(s, str) and any(d in s for d in ("-", "/", "T", ":")) for s in sample):
                try:
                    pd.to_datetime(sample, errors="raise", format="mixed")
                    return "date"
                except Exception:
                    pass

    # 3. Numerical check
    if pd.api.types.is_numeric_dtype(dtype):
        return "numerical"

    # 4. Fallback: Categorical (strings, text, categories, unparsed objects)
    return "categorical"


def profile_dataframe(df: pd.DataFrame, dataset_id: str) -> DatasetProfileResponse:
    """
    Computes a comprehensive profile of a pandas DataFrame:
    - Row & column counts
    - Total deep memory usage in bytes and human-readable format
    - Column type classification (numerical/categorical/date/boolean)
    - Missing value counts & percentages per column
    - Duplicate row count
    - Unique value count per column
    - Category summary counts
    """
    row_count = len(df)
    column_count = len(df.columns)

    if row_count > 0 and column_count > 0:
        try:
            memory_usage_bytes = int(df.memory_usage(deep=True).sum())
        except Exception:
            memory_usage_bytes = int(df.memory_usage().sum())
    else:
        memory_usage_bytes = 0

    memory_usage_formatted = format_bytes(memory_usage_bytes)

    # Compute duplicate row count safely
    if row_count > 0 and column_count > 0:
        try:
            duplicate_row_count = int(df.duplicated().sum())
        except TypeError:
            # Handle unhashable nested types by stringifying
            duplicate_row_count = int(df.astype(str).duplicated().sum())
    else:
        duplicate_row_count = 0

    columns_profile: List[ColumnProfile] = []
    type_summary: Dict[str, int] = {
        "numerical": 0,
        "categorical": 0,
        "date": 0,
        "boolean": 0,
    }

    for col in df.columns:
        series = df[col]
        col_type = classify_column_type(series)
        type_summary[col_type] = type_summary.get(col_type, 0) + 1

        missing_count = int(series.isna().sum())
        missing_pct = round((missing_count / row_count) * 100, 2) if row_count > 0 else 0.0

        try:
            unique_count = int(series.nunique(dropna=True))
        except TypeError:
            unique_count = int(series.astype(str).nunique(dropna=True))

        columns_profile.append(
            ColumnProfile(
                name=str(col),
                type=col_type,
                dtype=str(series.dtype),
                missing_count=missing_count,
                missing_percentage=missing_pct,
                unique_count=unique_count,
            )
        )

    return DatasetProfileResponse(
        dataset_id=dataset_id,
        row_count=row_count,
        column_count=column_count,
        memory_usage_bytes=memory_usage_bytes,
        memory_usage_formatted=memory_usage_formatted,
        duplicate_row_count=duplicate_row_count,
        columns=columns_profile,
        type_summary=type_summary,
    )


def column_stats_for_dataframe(df: pd.DataFrame, dataset_id: str) -> ColumnStatsResponse:
    """
    Computes detailed per-column statistics for visualization:
    - Numerical: min, max, mean, median, std
    - Categorical/text: top-10 value frequencies
    - All: missing count/percentage, unique count
    """
    row_count = len(df)
    stats_list: List[ColumnStatistics] = []

    for col in df.columns:
        series = df[col]
        col_type = classify_column_type(series)

        missing_count = int(series.isna().sum())
        missing_pct = round((missing_count / row_count) * 100, 2) if row_count > 0 else 0.0

        try:
            unique_count = int(series.nunique(dropna=True))
        except TypeError:
            unique_count = int(series.astype(str).nunique(dropna=True))

        stat = ColumnStatistics(
            name=str(col),
            type=col_type,
            dtype=str(series.dtype),
            missing_count=missing_count,
            missing_percentage=missing_pct,
            unique_count=unique_count,
        )

        if col_type == "numerical":
            non_null = series.dropna()
            if len(non_null) > 0:
                stat.min = _safe_stat_value(non_null.min())
                stat.max = _safe_stat_value(non_null.max())
                stat.mean = _safe_stat_value(non_null.mean())
                stat.median = _safe_stat_value(non_null.median())
                stat.std = _safe_stat_value(non_null.std())

        if col_type in ("categorical", "boolean"):
            try:
                vc = series.dropna().value_counts().head(10)
                stat.top_values = [
                    {"value": _safe_stat_value(val), "count": int(cnt)}
                    for val, cnt in vc.items()
                ]
            except Exception:
                stat.top_values = []

        if col_type == "date":
            non_null = series.dropna()
            if len(non_null) > 0:
                try:
                    dt_series = pd.to_datetime(non_null, errors="coerce").dropna()
                    if len(dt_series) > 0:
                        stat.min = str(dt_series.min())
                        stat.max = str(dt_series.max())
                except Exception:
                    pass

        stats_list.append(stat)

    return ColumnStatsResponse(
        dataset_id=dataset_id,
        row_count=row_count,
        column_count=len(df.columns),
        columns=stats_list,
    )


def _safe_stat_value(val: Any) -> Any:
    """Convert numpy/pandas values to JSON-safe Python primitives."""
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    if isinstance(val, np.generic):
        return val.item()
    if isinstance(val, (pd.Timestamp, datetime)):
        return str(val)
    return val

