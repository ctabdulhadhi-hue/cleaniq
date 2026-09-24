import logging
from typing import Any, Dict, List
import pandas as pd

from app.services.type_detector import TypeDetectorService
from app.services.text_cleaner import TextCleanerService
from app.services.calculator import SafeColumnCalculator
from app.services.outliers import OutlierDetectorService

logger = logging.getLogger(__name__)


class ReplayEngine:
    """
    Replays an operation record on a DataFrame without requiring full dataset snapshots per version.
    """

    @classmethod
    def apply_record(cls, df: pd.DataFrame, operation: str, params: Dict[str, Any]) -> pd.DataFrame:
        """
        Applies a single operation record to a DataFrame and returns the transformed DataFrame.
        """
        result_df = df.copy()

        try:
          if operation == "clean_missing":
              col = params.get("column")
              method = params.get("method")
              val = params.get("value")

              if not col or col not in result_df.columns:
                  return result_df

              if method == "remove":
                  result_df = result_df.dropna(subset=[col]).reset_index(drop=True)
              elif method == "mean":
                  num_series = pd.to_numeric(result_df[col], errors="coerce")
                  mean_val = float(num_series.mean()) if not num_series.dropna().empty else 0
                  result_df[col] = result_df[col].fillna(mean_val)
              elif method == "median":
                  num_series = pd.to_numeric(result_df[col], errors="coerce")
                  med_val = float(num_series.median()) if not num_series.dropna().empty else 0
                  result_df[col] = result_df[col].fillna(med_val)
              elif method == "mode":
                  mode_series = result_df[col].mode()
                  mode_val = mode_series.iloc[0] if not mode_series.empty else ""
                  result_df[col] = result_df[col].fillna(mode_val)
              elif method == "custom":
                  if val is not None:
                      fill_val = val
                      if pd.api.types.is_numeric_dtype(result_df[col]):
                          try:
                              fill_val = float(fill_val)
                          except (ValueError, TypeError):
                              pass
                      result_df[col] = result_df[col].fillna(fill_val)

          elif operation == "clean_duplicates":
              try:
                  result_df = result_df.drop_duplicates(keep="first").reset_index(drop=True)
              except TypeError:
                  result_df = result_df.astype(str).drop_duplicates(keep="first").reset_index(drop=True)

          elif operation == "convert_type":
              col = params.get("column")
              target_type = params.get("target_type")
              date_format = params.get("date_format")
              if col and col in result_df.columns and target_type:
                  converted_series, _, _ = TypeDetectorService.convert_type(
                      series=result_df[col],
                      target_type=target_type,
                      date_format=date_format,
                  )
                  result_df[col] = converted_series

          elif operation.startswith("text_"):
              col = params.get("column")
              op_type = params.get("operation") or operation.replace("text_", "")
              case_type = params.get("case_type")
              find_text = params.get("find_text")
              replace_text = params.get("replace_text")
              regex = bool(params.get("regex"))

              if col and col in result_df.columns:
                  transformed, _ = TextCleanerService.transform_text(
                      series=result_df[col],
                      operation=op_type,
                      case_type=case_type,
                      find_text=find_text,
                      replace_text=replace_text,
                      regex=regex,
                  )
                  result_df[col] = transformed

          elif operation == "standardize_categories":
              col = params.get("column")
              merges = params.get("merges") or []
              if col and col in result_df.columns and merges:
                  transformed, _ = TextCleanerService.apply_standardize(result_df[col], merges)
                  result_df[col] = transformed

          elif operation == "column_rename":
              old_name = params.get("old_name")
              new_name = params.get("new_name")
              if old_name and new_name and old_name in result_df.columns:
                  result_df = result_df.rename(columns={old_name: new_name})

          elif operation == "column_delete":
              col = params.get("column")
              if col and col in result_df.columns:
                  result_df = result_df.drop(columns=[col])

          elif operation == "column_reorder":
              order = params.get("order") or []
              if order and set(order) == set(result_df.columns):
                  result_df = result_df[order]

          elif operation == "column_calculate":
              new_col = params.get("new_column")
              expr = params.get("expression")
              if new_col and expr:
                  calc_series = SafeColumnCalculator.evaluate(result_df, expr)
                  result_df[new_col] = calc_series

          elif operation.startswith("outlier_"):
              col = params.get("column")
              method = params.get("method") or "iqr"
              action = params.get("action") or operation.replace("outlier_", "")
              multiplier = params.get("multiplier", 1.5)
              zscore_threshold = params.get("zscore_threshold", 3.0)

              if col and col in result_df.columns:
                  res_df, _, _ = OutlierDetectorService.handle_outliers(
                      df=result_df,
                      column=col,
                      method=method,
                      action=action,
                      multiplier=multiplier,
                      zscore_threshold=zscore_threshold,
                  )
                  result_df = res_df

        except Exception as e:
            logger.error(f"Error replaying operation '{operation}' with params {params}: {e}")

        return result_df
