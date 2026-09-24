import math
from typing import Dict, Any, List, Tuple, Optional
import pandas as pd
import numpy as np


class OutlierDetectorService:
    """
    Detects outliers in numerical columns using IQR or Z-score methods.
    Returns detection results with statistics and sample outlier values.
    """

    @staticmethod
    def detect_iqr(
        series: pd.Series,
        multiplier: float = 1.5,
    ) -> Dict[str, Any]:
        """
        Detects outliers using the Interquartile Range (IQR) method.
        Outliers are values below Q1 - multiplier*IQR or above Q3 + multiplier*IQR.

        Returns dict with outlier_indices, stats, sample_outliers, etc.
        """
        non_null = series.dropna()
        if len(non_null) == 0:
            return {
                "method": "iqr",
                "outlier_count": 0,
                "total_rows": len(series),
                "percentage": 0.0,
                "bounds": {"lower": None, "upper": None},
                "stats": {"q1": None, "q3": None, "iqr": None},
                "sample_outliers": [],
                "outlier_indices": [],
            }

        numeric = pd.to_numeric(non_null, errors="coerce").dropna()
        if len(numeric) == 0:
            return {
                "method": "iqr",
                "outlier_count": 0,
                "total_rows": len(series),
                "percentage": 0.0,
                "bounds": {"lower": None, "upper": None},
                "stats": {"q1": None, "q3": None, "iqr": None},
                "sample_outliers": [],
                "outlier_indices": [],
            }

        q1 = float(numeric.quantile(0.25))
        q3 = float(numeric.quantile(0.75))
        iqr = q3 - q1
        lower_bound = q1 - multiplier * iqr
        upper_bound = q3 + multiplier * iqr

        # Build outlier mask aligned with original series index
        full_numeric = pd.to_numeric(series, errors="coerce")
        outlier_mask = (full_numeric < lower_bound) | (full_numeric > upper_bound)
        # Only flag non-null values
        outlier_mask = outlier_mask & series.notna()

        outlier_indices = list(series.index[outlier_mask])
        outlier_values = series[outlier_mask]
        outlier_count = int(outlier_mask.sum())
        total = len(series)
        percentage = round((outlier_count / total) * 100, 2) if total > 0 else 0.0

        # Sample outlier values (first 20)
        sample = []
        for idx in outlier_indices[:20]:
            val = series.loc[idx]
            safe_val = float(val) if not (isinstance(val, float) and (math.isnan(val) or math.isinf(val))) else None
            sample.append({"index": int(idx), "value": safe_val})

        return {
            "method": "iqr",
            "outlier_count": outlier_count,
            "total_rows": total,
            "percentage": percentage,
            "bounds": {
                "lower": round(lower_bound, 4),
                "upper": round(upper_bound, 4),
            },
            "stats": {
                "q1": round(q1, 4),
                "q3": round(q3, 4),
                "iqr": round(iqr, 4),
                "multiplier": multiplier,
            },
            "sample_outliers": sample,
            "outlier_indices": [int(i) for i in outlier_indices],
        }

    @staticmethod
    def detect_zscore(
        series: pd.Series,
        threshold: float = 3.0,
    ) -> Dict[str, Any]:
        """
        Detects outliers using the Z-score method.
        Outliers are values with |z-score| > threshold.
        """
        non_null = series.dropna()
        if len(non_null) == 0:
            return {
                "method": "zscore",
                "outlier_count": 0,
                "total_rows": len(series),
                "percentage": 0.0,
                "bounds": {"lower": None, "upper": None},
                "stats": {"mean": None, "std": None, "threshold": threshold},
                "sample_outliers": [],
                "outlier_indices": [],
            }

        numeric = pd.to_numeric(non_null, errors="coerce").dropna()
        if len(numeric) == 0 or numeric.std() == 0:
            return {
                "method": "zscore",
                "outlier_count": 0,
                "total_rows": len(series),
                "percentage": 0.0,
                "bounds": {"lower": None, "upper": None},
                "stats": {"mean": None, "std": None, "threshold": threshold},
                "sample_outliers": [],
                "outlier_indices": [],
            }

        mean_val = float(numeric.mean())
        std_val = float(numeric.std())

        lower_bound = mean_val - threshold * std_val
        upper_bound = mean_val + threshold * std_val

        full_numeric = pd.to_numeric(series, errors="coerce")
        z_scores = (full_numeric - mean_val) / std_val
        outlier_mask = z_scores.abs() > threshold
        outlier_mask = outlier_mask & series.notna()

        outlier_indices = list(series.index[outlier_mask])
        outlier_count = int(outlier_mask.sum())
        total = len(series)
        percentage = round((outlier_count / total) * 100, 2) if total > 0 else 0.0

        sample = []
        for idx in outlier_indices[:20]:
            val = series.loc[idx]
            z = z_scores.loc[idx]
            safe_val = float(val) if not (isinstance(val, float) and (math.isnan(val) or math.isinf(val))) else None
            safe_z = round(float(z), 4) if not (isinstance(z, float) and (math.isnan(z) or math.isinf(z))) else None
            sample.append({"index": int(idx), "value": safe_val, "zscore": safe_z})

        return {
            "method": "zscore",
            "outlier_count": outlier_count,
            "total_rows": total,
            "percentage": percentage,
            "bounds": {
                "lower": round(lower_bound, 4),
                "upper": round(upper_bound, 4),
            },
            "stats": {
                "mean": round(mean_val, 4),
                "std": round(std_val, 4),
                "threshold": threshold,
            },
            "sample_outliers": sample,
            "outlier_indices": [int(i) for i in outlier_indices],
        }

    @classmethod
    def detect(
        cls,
        df: pd.DataFrame,
        column: str,
        method: str = "iqr",
        multiplier: float = 1.5,
        zscore_threshold: float = 3.0,
    ) -> Dict[str, Any]:
        """Dispatch to IQR or Z-score detection for a specific column in a DataFrame."""
        series = df[column]
        if method == "iqr":
            return cls.detect_iqr(series, multiplier=multiplier)
        elif method == "zscore":
            return cls.detect_zscore(series, threshold=zscore_threshold)
        else:
            raise ValueError(f"Unknown outlier method '{method}'. Use 'iqr' or 'zscore'.")

    @classmethod
    def handle_outliers(
        cls,
        df: pd.DataFrame,
        column: str,
        method: str = "iqr",
        action: str = "remove",
        multiplier: float = 1.5,
        zscore_threshold: float = 3.0,
    ) -> Tuple[pd.DataFrame, int, str]:
        """
        Handles outliers by removing or capping them.
        Returns (result_df, affected_count, summary_message).
        """
        detection = cls.detect(
            df, column=column, method=method,
            multiplier=multiplier, zscore_threshold=zscore_threshold,
        )
        outlier_count = detection["outlier_count"]
        bounds = detection["bounds"]

        if outlier_count == 0:
            return df.copy(), 0, "No outliers detected"

        full_numeric = pd.to_numeric(df[column], errors="coerce")

        if action == "remove":
            lower = bounds["lower"]
            upper = bounds["upper"]
            mask = (full_numeric >= lower) & (full_numeric <= upper) | df[column].isna()
            result_df = df[mask].reset_index(drop=True)
            affected = outlier_count
            summary = f"Removed {affected} outlier row(s) using {method.upper()} method"

        elif action == "cap":
            result_df = df.copy()
            lower = bounds["lower"]
            upper = bounds["upper"]
            capped = full_numeric.clip(lower=lower, upper=upper)
            # Only update non-null positions
            non_null_mask = df[column].notna()
            result_df.loc[non_null_mask, column] = capped[non_null_mask]
            affected = outlier_count
            summary = f"Capped {affected} outlier(s) to bounds [{lower:.2f}, {upper:.2f}] using {method.upper()}"

        elif action == "keep":
            return df.copy(), 0, f"Kept all {outlier_count} outlier(s) — no changes applied"

        else:
            raise ValueError(f"Unknown action '{action}'. Use 'remove', 'cap', or 'keep'.")

        return result_df, affected, summary
