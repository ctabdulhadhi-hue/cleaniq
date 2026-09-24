import io
import logging
from typing import Tuple
import pandas as pd

from app.core.errors import AppError

logger = logging.getLogger(__name__)

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
ZIP_MAGIC_BYTES = b"PK\x03\x04"
OLE_MAGIC_BYTES = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"


def parse_uploaded_file(filename: str, file_bytes: bytes) -> pd.DataFrame:
    """
    Parses an uploaded file into a pandas DataFrame.
    Validates file content rather than blindly relying on file extensions:
    - Inspects magic bytes for Excel formats (.xlsx, .xls)
    - Tries CSV / TSV with automatic delimiter and encoding detection
    - Rejects invalid, corrupted, or oversized files with clear AppError
    """
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise AppError(
            code="FILE_TOO_LARGE",
            message=f"File exceeds maximum allowed size of 50MB (received {len(file_bytes) / (1024 * 1024):.2f}MB)",
            status_code=413,
        )

    if not file_bytes:
        raise AppError(
            code="EMPTY_FILE",
            message="Uploaded file is empty (0 bytes).",
            status_code=400,
        )

    lower_name = (filename or "").lower()
    df: pd.DataFrame | None = None
    parse_errors: list[str] = []

    # Check for Excel ZIP magic bytes (.xlsx)
    is_zip = file_bytes.startswith(ZIP_MAGIC_BYTES)
    is_ole = file_bytes.startswith(OLE_MAGIC_BYTES)

    # Strategy 1: Openpyxl for modern Excel (.xlsx)
    if is_zip or lower_name.endswith((".xlsx", ".xlsm")):
        try:
            df = pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl")
        except Exception as e:
            parse_errors.append(f"openpyxl: {str(e)}")

    # Strategy 2: xlrd for legacy Excel (.xls)
    if df is None and (is_ole or lower_name.endswith(".xls")):
        try:
            df = pd.read_excel(io.BytesIO(file_bytes), engine="xlrd")
        except Exception as e:
            parse_errors.append(f"xlrd: {str(e)}")

    # Strategy 3: CSV/TSV parsing with encoding & separator fallbacks
    if df is None:
        # If the file contains null bytes, it is a binary file (not text/CSV)
        if b"\x00" in file_bytes:
            raise AppError(
                code="INVALID_FILE_CONTENT",
                message=f"Failed to parse '{filename}': file contains binary data and is not a valid CSV or Excel document.",
                status_code=400,
            )

        encodings = ["utf-8-sig", "utf-8", "latin1", "cp1252"]
        for enc in encodings:
            try:
                decoded = file_bytes.decode(enc)
                sample = decoded[:4096]
                
                # Sniff delimiter if possible
                sep = ","
                if "\t" in sample and sample.count("\t") > sample.count(","):
                    sep = "\t"
                elif ";" in sample and sample.count(";") > sample.count(","):
                    sep = ";"
                elif "|" in sample and sample.count("|") > sample.count(","):
                    sep = "|"

                df = pd.read_csv(io.StringIO(decoded), sep=sep)
                break
            except Exception as e:
                parse_errors.append(f"csv ({enc}): {str(e)}")
                continue

    # Strategy 4: Fallback generic pd.read_excel if extension suggested excel
    if df is None and lower_name.endswith((".xlsx", ".xls")):
        try:
            df = pd.read_excel(io.BytesIO(file_bytes))
        except Exception as e:
            parse_errors.append(f"excel-generic: {str(e)}")

    if df is None:
        logger.warning(f"Failed parsing file '{filename}'. Errors: {parse_errors}")
        raise AppError(
            code="INVALID_FILE_CONTENT",
            message=(
                f"Failed to parse '{filename}': file is corrupted or not a valid CSV or Excel document."
            ),
            status_code=400,
        )

    # Validate that dataframe is not empty
    if df.empty and len(df.columns) == 0:
        raise AppError(
            code="EMPTY_DATASET",
            message=f"Uploaded file '{filename}' contains no readable data rows or columns.",
            status_code=400,
        )

    # Clean up column headers (ensure string, trim whitespace)
    df.columns = [
        str(col).strip() if pd.notna(col) and str(col).strip() != "" else f"column_{i+1}"
        for i, col in enumerate(df.columns)
    ]

    return df
