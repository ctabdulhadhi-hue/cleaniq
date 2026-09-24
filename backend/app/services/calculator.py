import re
from typing import Dict, Any, Tuple
import pandas as pd
import numpy as np
from asteval import Interpreter
from app.core.errors import AppError


class SafeColumnCalculator:
    """
    Evaluates calculated column expressions using asteval without eval().
    Limits symbols to active DataFrame columns and a small whitelist of mathematical operations.
    """

    SAFE_FUNCTIONS = {
        "abs": np.abs,
        "round": np.round,
        "sqrt": np.sqrt,
        "log": np.log,
        "log10": np.log10,
        "exp": np.exp,
        "sin": np.sin,
        "cos": np.cos,
        "tan": np.tan,
        "floor": np.floor,
        "ceil": np.ceil,
        "min": np.minimum,
        "max": np.maximum,
        "clip": np.clip,
        "isnan": np.isnan,
        "where": np.where,
    }

    @classmethod
    def evaluate(cls, df: pd.DataFrame, expression: str) -> pd.Series:
        """
        Safely computes a new column Series from an expression over df.
        """
        expr = expression.strip()
        if not expr:
            raise AppError(
                code="EMPTY_EXPRESSION",
                message="Calculation expression cannot be empty.",
                status_code=400,
            )

        # Create fresh isolated interpreter
        aeval = Interpreter(use_numpy=True, no_builtins=True)

        # Clear symbol table of potential non-safe default symbols
        for key in list(aeval.symtable.keys()):
            if key not in cls.SAFE_FUNCTIONS:
                del aeval.symtable[key]

        # Register safe functions
        for name, fn in cls.SAFE_FUNCTIONS.items():
            aeval.symtable[name] = fn

        # Map column names: support bracketed [Column Name] or `Column Name`
        col_alias_map: Dict[str, str] = {}
        transformed_expr = expr

        # Find bracketed or backtick column names: [Column Name] or `Column Name`
        bracket_matches = list(re.finditer(r"\[([^\]]+)\]|`([^`]+)`", expr))
        for i, match in enumerate(bracket_matches):
            raw_col = match.group(1) or match.group(2)
            if raw_col in df.columns:
                alias = f"__col_{i}__"
                col_alias_map[alias] = raw_col
                transformed_expr = transformed_expr.replace(match.group(0), alias)
            else:
                raise AppError(
                    code="COLUMN_NOT_FOUND",
                    message=f"Column '{raw_col}' referenced in expression does not exist in dataset.",
                    status_code=400,
                )

        # Also inject columns whose names are valid Python identifiers directly
        for col in df.columns:
            if col.isidentifier() and col not in cls.SAFE_FUNCTIONS:
                # Convert numeric column or series to numpy array or pandas Series
                s = df[col]
                # Coerce to numeric if possible for math
                if pd.api.types.is_numeric_dtype(s):
                    aeval.symtable[col] = s.to_numpy()
                else:
                    aeval.symtable[col] = s.to_numpy()

        # Inject aliased columns
        for alias, raw_col in col_alias_map.items():
            s = df[raw_col]
            if pd.api.types.is_numeric_dtype(s):
                aeval.symtable[alias] = s.to_numpy()
            else:
                aeval.symtable[alias] = s.to_numpy()

        # Execute expression in asteval
        try:
            result = aeval(transformed_expr)
        except Exception as e:
            raise AppError(
                code="CALCULATION_ERROR",
                message=f"Calculation error: {str(e)}",
                status_code=400,
            )

        # Check for asteval errors
        if aeval.error:
            err_msgs = [err.get_error()[1] for err in aeval.error if err.get_error()]
            msg = "; ".join(err_msgs) if err_msgs else "Invalid syntax or variable in expression"
            raise AppError(
                code="EXPRESSION_ERROR",
                message=f"Could not evaluate expression: {msg}",
                status_code=400,
            )

        if result is None:
            raise AppError(
                code="CALCULATION_EMPTY",
                message="Expression resulted in an empty/undefined value.",
                status_code=400,
            )

        # Convert result into pd.Series aligned with DataFrame
        if np.isscalar(result):
            series = pd.Series([result] * len(df), index=df.index)
        elif isinstance(result, (np.ndarray, pd.Series, list)):
            if len(result) != len(df):
                raise AppError(
                    code="SHAPE_MISMATCH",
                    message=f"Result length ({len(result)}) does not match dataset row count ({len(df)}).",
                    status_code=400,
                )
            series = pd.Series(result, index=df.index)
        else:
            series = pd.Series(result, index=df.index)

        # Replace infinite numbers from division by zero with NaN
        series = series.replace([np.inf, -np.inf], np.nan)
        return series
