import io
import math
import os
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np
from fastapi import APIRouter, UploadFile, File, Query, Path, Body, Response

from app.core.errors import AppError
from app.core.session_store import session_store, OperationRecord
from app.services.file_parser import parse_uploaded_file, MAX_FILE_SIZE_BYTES
from app.services.profiler import profile_dataframe, column_stats_for_dataframe
from app.services.calculator import SafeColumnCalculator
from app.services.text_cleaner import TextCleanerService
from app.services.type_detector import TypeDetectorService
from app.services.outliers import OutlierDetectorService
from app.services.quality import QualityScoreService
from app.services.report import ReportGeneratorService
from app.services.ai_analyzer import AIAnalysisService
from app.models.dataset import (
    DatasetUploadResponse,
    DatasetProfileResponse,
    DatasetPreviewResponse,
    CleanMissingRequest,
    CleanDuplicatesRequest,
    CleanOperationResponse,
    OperationLogEntry,
    OperationLogResponse,
    ColumnStatsResponse,
    TypeSuggestion,
    TypeSuggestionsResponse,
    ConvertTypeRequest,
    TextTransformRequest,
    ClusterProposal,
    CategoryClustersResponse,
    StandardizeCategoriesRequest,
    RenameColumnRequest,
    DeleteColumnRequest,
    ReorderColumnsRequest,
    CalculatedColumnRequest,
    OutlierDetectRequest,
    OutlierDetectResponse,
    OutlierHandleRequest,
    QualityScoreResponse,
    HistogramResponse,
    HistogramBucket,
    BoxPlotResponse,
    ScatterResponse,
    ScatterDataPoint,
    CorrelationResponse,
    CorrelationPair,
    UndoRedoResponse,
    AIRecommendationItem,
    AIAnalysisResponse,
)

router = APIRouter(prefix="/api/v1/datasets", tags=["Datasets"])


def sanitize_dataframe_records(df_slice: pd.DataFrame) -> List[Dict[str, Any]]:
    """Converts a DataFrame slice into JSON-safe dictionaries, handling NaN, NaT, Inf, and timestamps."""
    records = []
    for record in df_slice.to_dict(orient="records"):
        cleaned_row: Dict[str, Any] = {}
        for k, v in record.items():
            if pd.isna(v) or v is pd.NaT:
                cleaned_row[k] = None
            elif isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                cleaned_row[k] = None
            elif isinstance(v, (datetime, pd.Timestamp)):
                cleaned_row[k] = v.isoformat()
            elif isinstance(v, np.generic):
                cleaned_row[k] = v.item()
            else:
                cleaned_row[k] = v
        records.append(cleaned_row)
    return records


def _safe_value(val: Any) -> Any:
    """Convert numpy/pandas values to JSON-safe primitives."""
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    if pd.isna(val):
        return None
    if isinstance(val, np.generic):
        return val.item()
    if isinstance(val, (pd.Timestamp, datetime)):
        return val.isoformat()
    return val


# ─── Upload ───────────────────────────────────────────────────────────────────


@router.post("", response_model=DatasetUploadResponse, status_code=201)
async def upload_dataset(file: UploadFile = File(...)):
    """
    Uploads and parses a dataset file (.csv, .xlsx, .xls) up to 50MB.
    Validates file content by attempting to parse into a DataFrame.
    Stores the DataFrame in the in-memory session store and returns dataset_id.
    """
    filename = file.filename or "uploaded_dataset"

    # Read file content safely up to MAX_FILE_SIZE_BYTES + 1
    content = await file.read(MAX_FILE_SIZE_BYTES + 1024)
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise AppError(
            code="FILE_TOO_LARGE",
            message=f"File exceeds maximum allowed size of 50MB (received {len(content) / (1024 * 1024):.2f}MB)",
            status_code=413,
        )

    # Validate file content by attempting to parse it
    df = parse_uploaded_file(filename, content)

    # Generate unique dataset_id
    dataset_id = f"ds_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)

    metadata = {
        "filename": filename,
        "file_size_bytes": len(content),
        "row_count": len(df),
        "column_count": len(df.columns),
        "created_at": now.isoformat(),
    }

    # Store in session store
    session_store.set(dataset_id, df, metadata)

    return DatasetUploadResponse(
        dataset_id=dataset_id,
        filename=filename,
        row_count=len(df),
        column_count=len(df.columns),
        file_size_bytes=len(content),
        message="Dataset uploaded and parsed successfully",
        created_at=now,
    )


SAMPLE_CSV_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../data/sample_dataset.csv")
)


@router.post("/sample", response_model=DatasetUploadResponse, status_code=201)
async def load_sample_dataset():
    """
    Loads bundled sample dataset through the exact same code path as normal upload,
    creating a session with is_sample=True.
    """
    if not os.path.exists(SAMPLE_CSV_PATH):
        raise AppError(
            code="SAMPLE_NOT_FOUND",
            message="Bundled sample dataset file could not be found.",
            status_code=500,
        )

    with open(SAMPLE_CSV_PATH, "rb") as f:
        content = f.read()

    filename = "sample_dataset.csv"
    df = parse_uploaded_file(filename, content)

    dataset_id = f"ds_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)

    metadata = {
        "filename": filename,
        "file_size_bytes": len(content),
        "row_count": len(df),
        "column_count": len(df.columns),
        "created_at": now.isoformat(),
        "is_sample": True,
    }

    session_store.set(dataset_id, df, metadata)

    return DatasetUploadResponse(
        dataset_id=dataset_id,
        filename=filename,
        row_count=len(df),
        column_count=len(df.columns),
        file_size_bytes=len(content),
        message="Sample dataset loaded successfully",
        created_at=now,
        is_sample=True,
    )


# ─── Profile ─────────────────────────────────────────────────────────────────


@router.get("/{dataset_id}/profile", response_model=DatasetProfileResponse)
async def get_dataset_profile(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
):
    """
    Returns full profile of the dataset:
    - Row & column counts, memory usage, column types, missing values, duplicate count
    """
    df = session_store.get(dataset_id)
    if df is None:
        raise AppError(
            code="DATASET_NOT_FOUND",
            message=f"Dataset '{dataset_id}' not found or session has expired.",
            status_code=404,
        )

    profile = profile_dataframe(df, dataset_id)
    session = session_store.get_session(dataset_id)
    if session and session.metadata:
        profile.filename = session.metadata.get("filename", "dataset")
        profile.is_sample = session.metadata.get("is_sample", False)
    return profile


# ─── Preview (paginated rows) ────────────────────────────────────────────────


@router.get("/{dataset_id}/preview", response_model=DatasetPreviewResponse)
async def get_dataset_preview(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    size: int = Query(100, ge=1, le=1000, description="Rows per page"),
):
    """Returns paginated rows from the dataset."""
    df = session_store.get(dataset_id)
    if df is None:
        raise AppError(
            code="DATASET_NOT_FOUND",
            message=f"Dataset '{dataset_id}' not found or session has expired.",
            status_code=404,
        )

    total_rows = len(df)
    total_pages = math.ceil(total_rows / size) if total_rows > 0 else 1

    start_idx = (page - 1) * size
    end_idx = min(start_idx + size, total_rows)

    if start_idx >= total_rows and total_rows > 0:
        sliced_df = pd.DataFrame(columns=df.columns)
    else:
        sliced_df = df.iloc[start_idx:end_idx]

    rows = sanitize_dataframe_records(sliced_df)

    return DatasetPreviewResponse(
        dataset_id=dataset_id,
        page=page,
        size=size,
        total_rows=total_rows,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_prev=page > 1,
        columns=[str(c) for c in df.columns],
        rows=rows,
    )


# ─── Column Stats (for Visualization page) ───────────────────────────────────


@router.get("/{dataset_id}/stats", response_model=ColumnStatsResponse)
async def get_column_stats(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
):
    """
    Returns detailed per-column statistics for visualization:
    numerical → min, max, mean, median, std;
    categorical → top-10 value frequencies.
    """
    df = session_store.get(dataset_id)
    if df is None:
        raise AppError(
            code="DATASET_NOT_FOUND",
            message=f"Dataset '{dataset_id}' not found or session has expired.",
            status_code=404,
        )

    return column_stats_for_dataframe(df, dataset_id)


# ─── Clean: Missing Values ───────────────────────────────────────────────────


@router.post("/{dataset_id}/clean/missing", response_model=CleanOperationResponse)
async def clean_missing(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
    preview: bool = Query(True, description="If true, preview only. If false, apply and log."),
    body: CleanMissingRequest = Body(...),
):
    """
    Handle missing values for a specific column.

    preview=true  → compute effect without mutating (e.g. "median = 24, 23 rows would be filled")
    preview=false → apply the fill/remove, append to operation log
    """
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(
            code="DATASET_NOT_FOUND",
            message=f"Dataset '{dataset_id}' not found or session has expired.",
            status_code=404,
        )

    df = session.df
    col = body.column

    if col not in df.columns:
        raise AppError(
            code="INVALID_COLUMN",
            message=f"Column '{col}' not found in dataset.",
            status_code=400,
        )

    missing_count = int(df[col].isna().sum())
    if missing_count == 0:
        return CleanOperationResponse(
            affected_rows=0,
            before_summary=f"Column '{col}' has 0 missing values",
            after_summary="No changes needed",
            operation_id=None,
        )

    method = body.method
    rows_before = len(df)

    if method == "remove":
        result_df = df.dropna(subset=[col])
        affected = rows_before - len(result_df)
        fill_description = f"Remove {affected} row(s) with missing '{col}'"
        before_summary = f"Column '{col}': {missing_count} missing value(s) out of {rows_before} rows"
        after_summary = f"{affected} row(s) removed → {len(result_df)} rows remaining"

    elif method in ("mean", "median", "mode"):
        if method in ("mean", "median") and not pd.api.types.is_numeric_dtype(df[col]):
            raise AppError(
                code="INVALID_METHOD",
                message=f"Cannot use '{method}' on non-numeric column '{col}' (dtype: {df[col].dtype})",
                status_code=400,
            )

        if method == "mean":
            fill_val = df[col].mean()
        elif method == "median":
            fill_val = df[col].median()
        else:  # mode
            mode_series = df[col].mode()
            if len(mode_series) == 0:
                raise AppError(
                    code="NO_MODE",
                    message=f"Cannot compute mode for column '{col}' — no non-null values.",
                    status_code=400,
                )
            fill_val = mode_series.iloc[0]

        safe_fill = _safe_value(fill_val)
        result_df = df.copy()
        result_df[col] = result_df[col].fillna(fill_val)
        affected = missing_count

        before_summary = f"Column '{col}': {missing_count} missing value(s) out of {rows_before} rows"
        if method == "mean":
            after_summary = f"Mean = {safe_fill}, {affected} cell(s) would be filled"
        elif method == "median":
            after_summary = f"Median = {safe_fill}, {affected} cell(s) would be filled"
        else:
            after_summary = f"Mode = {safe_fill}, {affected} cell(s) would be filled"
        fill_description = f"Fill {affected} missing '{col}' with {method} ({safe_fill})"

    elif method == "custom":
        if body.value is None:
            raise AppError(
                code="MISSING_VALUE",
                message="Custom fill method requires a 'value' parameter.",
                status_code=400,
            )
        fill_val = body.value
        # Try to cast to numeric if the column is numeric
        if pd.api.types.is_numeric_dtype(df[col]):
            try:
                fill_val = float(fill_val)
            except (ValueError, TypeError):
                pass

        result_df = df.copy()
        result_df[col] = result_df[col].fillna(fill_val)
        affected = missing_count

        before_summary = f"Column '{col}': {missing_count} missing value(s) out of {rows_before} rows"
        after_summary = f"Custom value = {fill_val}, {affected} cell(s) would be filled"
        fill_description = f"Fill {affected} missing '{col}' with custom value ({fill_val})"

    else:
        raise AppError(
            code="INVALID_METHOD",
            message=f"Unknown method '{method}'. Use: remove, mean, median, mode, custom",
            status_code=400,
        )

    if preview:
        return CleanOperationResponse(
            affected_rows=affected,
            before_summary=before_summary,
            after_summary=after_summary,
            operation_id=None,
        )

    # Apply: take snapshot, update DataFrame, log the operation
    snapshot = df.copy(deep=True)
    result_df = result_df.reset_index(drop=True)

    record = OperationRecord(
        operation="clean_missing",
        params={"column": col, "method": method, "value": _safe_value(body.value) if body.value is not None else None},
        columns_affected=[col],
        affected_row_count=affected,
        rows_before=rows_before,
        rows_after=len(result_df),
        snapshot_before=snapshot,
    )
    op_index = session.push_operation(record)
    session.df = result_df
    session.touch()

    return CleanOperationResponse(
        affected_rows=affected,
        before_summary=before_summary,
        after_summary=after_summary.replace("would be", "were") if "would be" in after_summary else after_summary,
        operation_id=f"op_{op_index}",
    )


# ─── Clean: Duplicates ───────────────────────────────────────────────────────


@router.post("/{dataset_id}/clean/duplicates", response_model=CleanOperationResponse)
async def clean_duplicates(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
    preview: bool = Query(True, description="If true, preview only. If false, apply and log."),
    body: CleanDuplicatesRequest = Body(default=None),
):
    """
    Handle duplicate rows.

    preview=true  → return duplicate count and sample duplicate rows
    preview=false → remove duplicates (keep first), append to operation log
    """
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(
            code="DATASET_NOT_FOUND",
            message=f"Dataset '{dataset_id}' not found or session has expired.",
            status_code=404,
        )

    df = session.df
    rows_before = len(df)

    # Compute duplicates
    try:
        dup_mask = df.duplicated(keep="first")
    except TypeError:
        dup_mask = df.astype(str).duplicated(keep="first")

    dup_count = int(dup_mask.sum())

    if dup_count == 0:
        return CleanOperationResponse(
            affected_rows=0,
            before_summary=f"{rows_before} rows, 0 duplicates found",
            after_summary="No duplicates to remove",
            operation_id=None,
        )

    # Get sample duplicate rows for preview
    dup_sample = df[dup_mask].head(20)
    sample_rows = sanitize_dataframe_records(dup_sample)

    before_summary = f"{rows_before} rows, {dup_count} duplicate(s) found"
    rows_after = rows_before - dup_count
    after_summary = f"{dup_count} duplicate row(s) removed → {rows_after} rows remaining"

    if preview:
        return CleanOperationResponse(
            affected_rows=dup_count,
            before_summary=before_summary,
            after_summary=after_summary,
            operation_id=None,
            sample_rows=sample_rows,
        )

    # Apply: remove duplicates
    snapshot = df.copy(deep=True)
    result_df = df.drop_duplicates(keep="first").reset_index(drop=True)

    record = OperationRecord(
        operation="clean_duplicates",
        params={},
        columns_affected=list(df.columns),
        affected_row_count=dup_count,
        rows_before=rows_before,
        rows_after=len(result_df),
        snapshot_before=snapshot,
    )
    op_index = session.push_operation(record)
    session.df = result_df
    session.touch()

    return CleanOperationResponse(
        affected_rows=dup_count,
        before_summary=before_summary,
        after_summary=after_summary,
        operation_id=f"op_{op_index}",
    )


# ─── Operation Log ───────────────────────────────────────────────────────────


@router.get("/{dataset_id}/operations", response_model=OperationLogResponse)
async def get_operation_log(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
):
    """Returns the full chronological operation log for this dataset."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(
            code="DATASET_NOT_FOUND",
            message=f"Dataset '{dataset_id}' not found or session has expired.",
            status_code=404,
        )

    entries = []
    for record in session.history:
        entries.append(OperationLogEntry(
            timestamp=record.applied_at,
            operation=record.operation,
            column=record.params.get("column", None),
            method=record.params.get("method", None),
            affected_rows=record.affected_row_count,
        ))

    return OperationLogResponse(
        dataset_id=dataset_id,
        entries=entries,
        total=len(entries),
    )


# ─── Rollback ────────────────────────────────────────────────────────────────


@router.post("/{dataset_id}/rollback")
async def rollback_last(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
):
    """Rollback the most recent cleaning operation."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(
            code="DATASET_NOT_FOUND",
            message=f"Dataset '{dataset_id}' not found or session has expired.",
            status_code=404,
        )

    rows_before = len(session.df)
    record = session.pop_operation()

    if record is None:
        raise AppError(
            code="NO_OPERATIONS",
            message="No operations to rollback. The operation history is empty.",
            status_code=400,
        )

    rows_after = len(session.df)
    session.touch()

    return {
        "rolled_back_operation": record.operation,
        "rows_before": rows_before,
        "rows_after": rows_after,
        "message": f"Rolled back '{record.operation}' — restored to {rows_after} rows",
    }


# ─── Module 1: Data Type Conversion ─────────────────────────────────────────


@router.get("/{dataset_id}/clean/type-suggestions", response_model=TypeSuggestionsResponse)
async def get_type_suggestions(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
):
    """Auto-detects columns that can be converted to optimal types with confidence score."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    suggestions_data = TypeDetectorService.suggest_types(session.df)
    suggestions = [TypeSuggestion(**item) for item in suggestions_data]
    return TypeSuggestionsResponse(dataset_id=dataset_id, suggestions=suggestions)


@router.post("/{dataset_id}/clean/convert-type", response_model=CleanOperationResponse)
async def convert_column_type(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
    preview: bool = Query(True, description="Preview effect if true; apply if false"),
    body: ConvertTypeRequest = Body(...),
):
    """Converts a column's data type (integer, float, datetime, boolean, string)."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    df = session.df
    col = body.column
    if col not in df.columns:
        raise AppError(code="COLUMN_NOT_FOUND", message=f"Column '{col}' not found in dataset.", status_code=404)

    before_dtype = str(df[col].dtype)
    before_summary = f"Column '{col}' (current type: {before_dtype})"

    converted_series, affected, summary_msg = TypeDetectorService.convert_type(
        series=df[col],
        target_type=body.target_type,
        date_format=body.date_format,
        errors_strategy=body.errors_strategy or "coerce",
    )
    after_summary = f"{summary_msg} (target: {body.target_type})"

    if preview:
        return CleanOperationResponse(
            affected_rows=affected,
            before_summary=before_summary,
            after_summary=after_summary,
            operation_id=None,
        )

    # Apply
    snapshot = df.copy(deep=True)
    result_df = df.copy()
    result_df[col] = converted_series

    record = OperationRecord(
        operation="convert_type",
        params={"column": col, "target_type": body.target_type, "date_format": body.date_format},
        columns_affected=[col],
        affected_row_count=affected,
        rows_before=len(df),
        rows_after=len(result_df),
        snapshot_before=snapshot,
    )
    op_index = session.push_operation(record)
    session.df = result_df
    session.touch()

    return CleanOperationResponse(
        affected_rows=affected,
        before_summary=before_summary,
        after_summary=after_summary,
        operation_id=f"op_{op_index}",
    )


# ─── Module 2: Text Cleaning & Value Standardization ────────────────────────


@router.post("/{dataset_id}/clean/text/transform", response_model=CleanOperationResponse)
async def transform_text_column(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
    preview: bool = Query(True, description="Preview effect if true; apply if false"),
    body: TextTransformRequest = Body(...),
):
    """Text transformation: trim, lower/upper/title case, remove special characters, find & replace."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    df = session.df
    col = body.column
    if col not in df.columns:
        raise AppError(code="COLUMN_NOT_FOUND", message=f"Column '{col}' not found in dataset.", status_code=404)

    transformed_series, affected = TextCleanerService.transform_text(
        series=df[col],
        operation=body.operation,
        case_type=body.case_type,
        find_text=body.find_text,
        replace_text=body.replace_text,
        regex=bool(body.regex),
    )

    before_summary = f"Column '{col}' ({len(df)} total rows)"
    if body.operation == "trim":
        after_summary = f"Trimmed whitespace on {affected} cell(s)"
    elif body.operation == "case":
        after_summary = f"Converted to {body.case_type} case on {affected} cell(s)"
    elif body.operation == "remove_special":
        after_summary = f"Removed special characters on {affected} cell(s)"
    else:
        after_summary = f"Replaced '{body.find_text}' with '{body.replace_text or ''}' on {affected} cell(s)"

    if preview:
        return CleanOperationResponse(
            affected_rows=affected,
            before_summary=before_summary,
            after_summary=after_summary,
            operation_id=None,
        )

    # Apply
    snapshot = df.copy(deep=True)
    result_df = df.copy()
    result_df[col] = transformed_series

    record = OperationRecord(
        operation=f"text_{body.operation}",
        params={"column": col, "operation": body.operation, "case_type": body.case_type},
        columns_affected=[col],
        affected_row_count=affected,
        rows_before=len(df),
        rows_after=len(result_df),
        snapshot_before=snapshot,
    )
    op_index = session.push_operation(record)
    session.df = result_df
    session.touch()

    return CleanOperationResponse(
        affected_rows=affected,
        before_summary=before_summary,
        after_summary=after_summary,
        operation_id=f"op_{op_index}",
    )


@router.get("/{dataset_id}/clean/text/clusters", response_model=CategoryClustersResponse)
async def get_text_clusters(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
    column: str = Query(..., description="Target category/text column name"),
    threshold: float = Query(0.85, ge=0.5, le=1.0, description="Similarity threshold (0.5 - 1.0)"),
):
    """Clusters near-duplicate category strings for standardization review."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    df = session.df
    if column not in df.columns:
        raise AppError(code="COLUMN_NOT_FOUND", message=f"Column '{column}' not found.", status_code=404)

    raw_clusters = TextCleanerService.cluster_near_duplicates(df[column], similarity_threshold=threshold)
    clusters = [ClusterProposal(**c) for c in raw_clusters]
    return CategoryClustersResponse(dataset_id=dataset_id, column=column, clusters=clusters)


@router.post("/{dataset_id}/clean/text/standardize", response_model=CleanOperationResponse)
async def standardize_categories(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
    preview: bool = Query(True, description="Preview effect if true; apply if false"),
    body: StandardizeCategoriesRequest = Body(...),
):
    """Standardizes near-duplicate category strings by merging variants into approved canonical names."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    df = session.df
    col = body.column
    if col not in df.columns:
        raise AppError(code="COLUMN_NOT_FOUND", message=f"Column '{col}' not found.", status_code=404)

    merges_dict = [m.model_dump() for m in body.merges]
    transformed_series, affected = TextCleanerService.apply_standardize(df[col], merges_dict)

    cluster_count = len(body.merges)
    before_summary = f"Column '{col}': {cluster_count} merge group(s) proposed"
    after_summary = f"Standardized {affected} value(s) across {cluster_count} category cluster(s)"

    if preview:
        return CleanOperationResponse(
            affected_rows=affected,
            before_summary=before_summary,
            after_summary=after_summary,
            operation_id=None,
        )

    # Apply
    snapshot = df.copy(deep=True)
    result_df = df.copy()
    result_df[col] = transformed_series

    record = OperationRecord(
        operation="standardize_categories",
        params={"column": col, "cluster_count": cluster_count},
        columns_affected=[col],
        affected_row_count=affected,
        rows_before=len(df),
        rows_after=len(result_df),
        snapshot_before=snapshot,
    )
    op_index = session.push_operation(record)
    session.df = result_df
    session.touch()

    return CleanOperationResponse(
        affected_rows=affected,
        before_summary=before_summary,
        after_summary=after_summary,
        operation_id=f"op_{op_index}",
    )


# ─── Module 3: Column Management ────────────────────────────────────────────


@router.post("/{dataset_id}/columns/rename", response_model=CleanOperationResponse)
async def rename_column(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
    preview: bool = Query(True, description="Preview effect if true; apply if false"),
    body: RenameColumnRequest = Body(...),
):
    """Renames an existing column."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    df = session.df
    old = body.old_name.strip()
    new = body.new_name.strip()

    if old not in df.columns:
        raise AppError(code="COLUMN_NOT_FOUND", message=f"Column '{old}' does not exist.", status_code=404)
    if not new:
        raise AppError(code="INVALID_COLUMN_NAME", message="New column name cannot be empty.", status_code=400)
    if new != old and new in df.columns:
        raise AppError(code="COLUMN_EXISTS", message=f"A column named '{new}' already exists.", status_code=400)

    before_summary = f"Column name: '{old}'"
    after_summary = f"Renamed '{old}' to '{new}'"

    if preview:
        return CleanOperationResponse(
            affected_rows=len(df),
            before_summary=before_summary,
            after_summary=after_summary,
            operation_id=None,
        )

    snapshot = df.copy(deep=True)
    result_df = df.rename(columns={old: new})

    record = OperationRecord(
        operation="column_rename",
        params={"old_name": old, "new_name": new},
        columns_affected=[new],
        affected_row_count=len(df),
        rows_before=len(df),
        rows_after=len(result_df),
        snapshot_before=snapshot,
    )
    op_index = session.push_operation(record)
    session.df = result_df
    session.touch()

    return CleanOperationResponse(
        affected_rows=len(df),
        before_summary=before_summary,
        after_summary=after_summary,
        operation_id=f"op_{op_index}",
    )


@router.post("/{dataset_id}/columns/delete", response_model=CleanOperationResponse)
async def delete_column(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
    preview: bool = Query(True, description="Preview effect if true; apply if false"),
    body: DeleteColumnRequest = Body(...),
):
    """Deletes a column from the dataset."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    df = session.df
    col = body.column.strip()
    if col not in df.columns:
        raise AppError(code="COLUMN_NOT_FOUND", message=f"Column '{col}' does not exist.", status_code=404)
    if len(df.columns) <= 1:
        raise AppError(code="CANNOT_DELETE_LAST", message="Cannot delete the only column in the dataset.", status_code=400)

    before_summary = f"Dataset with {len(df.columns)} columns"
    after_summary = f"Deleted column '{col}' — {len(df.columns) - 1} columns remaining"

    if preview:
        return CleanOperationResponse(
            affected_rows=len(df),
            before_summary=before_summary,
            after_summary=after_summary,
            operation_id=None,
        )

    snapshot = df.copy(deep=True)
    result_df = df.drop(columns=[col])

    record = OperationRecord(
        operation="column_delete",
        params={"column": col},
        columns_affected=[col],
        affected_row_count=len(df),
        rows_before=len(df),
        rows_after=len(result_df),
        snapshot_before=snapshot,
    )
    op_index = session.push_operation(record)
    session.df = result_df
    session.touch()

    return CleanOperationResponse(
        affected_rows=len(df),
        before_summary=before_summary,
        after_summary=after_summary,
        operation_id=f"op_{op_index}",
    )


@router.post("/{dataset_id}/columns/reorder", response_model=CleanOperationResponse)
async def reorder_columns(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
    preview: bool = Query(True, description="Preview effect if true; apply if false"),
    body: ReorderColumnsRequest = Body(...),
):
    """Reorders the columns of the dataset."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    df = session.df
    current_cols = list(df.columns)
    new_order = body.column_order

    if set(current_cols) != set(new_order) or len(current_cols) != len(new_order):
        raise AppError(
            code="INVALID_ORDER",
            message="New column order must contain exactly the same columns as the current dataset.",
            status_code=400,
        )

    before_summary = f"Current order: {', '.join(current_cols[:5])}..."
    after_summary = f"Reordered {len(new_order)} columns: {', '.join(new_order[:5])}..."

    if preview:
        return CleanOperationResponse(
            affected_rows=len(df),
            before_summary=before_summary,
            after_summary=after_summary,
            operation_id=None,
        )

    snapshot = df.copy(deep=True)
    result_df = df[new_order]

    record = OperationRecord(
        operation="column_reorder",
        params={"order": new_order},
        columns_affected=new_order,
        affected_row_count=len(df),
        rows_before=len(df),
        rows_after=len(result_df),
        snapshot_before=snapshot,
    )
    op_index = session.push_operation(record)
    session.df = result_df
    session.touch()

    return CleanOperationResponse(
        affected_rows=len(df),
        before_summary=before_summary,
        after_summary=after_summary,
        operation_id=f"op_{op_index}",
    )


@router.post("/{dataset_id}/columns/calculate", response_model=CleanOperationResponse)
async def create_calculated_column(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
    preview: bool = Query(True, description="Preview effect if true; apply if false"),
    body: CalculatedColumnRequest = Body(...),
):
    """
    Safely creates a new calculated column using restricted asteval evaluator (no eval).
    Limited to arithmetic, DataFrame columns, and whitelisted mathematical operations.
    """
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    df = session.df
    new_col = body.new_column.strip()
    if not new_col:
        raise AppError(code="INVALID_COLUMN_NAME", message="Calculated column name cannot be empty.", status_code=400)

    calculated_series = SafeColumnCalculator.evaluate(df, body.expression)

    before_summary = f"Dataset with {len(df.columns)} columns"
    sample_preview = calculated_series.head(5).tolist()
    sample_preview_str = ", ".join(str(_safe_value(v)) for v in sample_preview)
    after_summary = f"Created column '{new_col}' from expression: `{body.expression}` (Sample: [{sample_preview_str}])"

    # Preview sample rows
    preview_df = df.head(5).copy()
    preview_df[new_col] = calculated_series.head(5)
    sample_rows = sanitize_dataframe_records(preview_df)

    if preview:
        return CleanOperationResponse(
            affected_rows=len(df),
            before_summary=before_summary,
            after_summary=after_summary,
            operation_id=None,
            sample_rows=sample_rows,
        )

    # Apply
    snapshot = df.copy(deep=True)
    result_df = df.copy()
    result_df[new_col] = calculated_series

    record = OperationRecord(
        operation="column_calculate",
        params={"new_column": new_col, "expression": body.expression},
        columns_affected=[new_col],
        affected_row_count=len(df),
        rows_before=len(df),
        rows_after=len(result_df),
        snapshot_before=snapshot,
    )
    op_index = session.push_operation(record)
    session.df = result_df
    session.touch()

    return CleanOperationResponse(
        affected_rows=len(df),
        before_summary=before_summary,
        after_summary=after_summary,
        operation_id=f"op_{op_index}",
        sample_rows=sample_rows,
    )


# ─── Module 4: Outlier Detection & Handling ─────────────────────────────────


@router.post("/{dataset_id}/clean/outliers/detect", response_model=OutlierDetectResponse)
async def detect_outliers(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
    body: OutlierDetectRequest = Body(...),
):
    """Detects outliers in a numeric column using IQR or Z-score method."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    df = session.df
    col = body.column
    if col not in df.columns:
        raise AppError(code="COLUMN_NOT_FOUND", message=f"Column '{col}' not found in dataset.", status_code=404)

    res = OutlierDetectorService.detect(
        df=df,
        column=col,
        method=body.method,
        multiplier=body.multiplier,
        zscore_threshold=body.zscore_threshold,
    )

    return OutlierDetectResponse(
        column=col,
        method=body.method,
        outlier_count=res["outlier_count"],
        total_rows=res["total_rows"],
        percentage=res["percentage"],
        bounds=res["bounds"],
        stats=res["stats"],
        sample_outliers=res["sample_outliers"],
    )


@router.post("/{dataset_id}/clean/outliers/handle", response_model=CleanOperationResponse)
async def handle_outliers(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
    preview: bool = Query(True, description="Preview effect if true; apply if false"),
    body: OutlierHandleRequest = Body(...),
):
    """Handles detected outliers by removing them, capping them at bounds, or keeping them."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    df = session.df
    col = body.column
    if col not in df.columns:
        raise AppError(code="COLUMN_NOT_FOUND", message=f"Column '{col}' not found in dataset.", status_code=404)

    result_df, affected, summary_msg = OutlierDetectorService.handle_outliers(
        df=df,
        column=col,
        method=body.method,
        action=body.action,
        multiplier=body.multiplier,
        zscore_threshold=body.zscore_threshold,
    )

    before_summary = f"Column '{col}' ({len(df)} total rows)"
    after_summary = summary_msg

    if preview or body.action == "keep":
        return CleanOperationResponse(
            affected_rows=affected,
            before_summary=before_summary,
            after_summary=after_summary,
            operation_id=None,
        )

    # Apply
    snapshot = df.copy(deep=True)
    record = OperationRecord(
        operation=f"outlier_{body.action}",
        params={"column": col, "method": body.method, "action": body.action},
        columns_affected=[col],
        affected_row_count=affected,
        rows_before=len(df),
        rows_after=len(result_df),
        snapshot_before=snapshot,
    )
    op_index = session.push_operation(record)
    session.df = result_df
    session.touch()

    return CleanOperationResponse(
        affected_rows=affected,
        before_summary=before_summary,
        after_summary=after_summary,
        operation_id=f"op_{op_index}",
    )


# ─── Module 5: Quality Score ──────────────────────────────────────────────────


@router.get("/{dataset_id}/quality", response_model=QualityScoreResponse)
async def get_quality_score(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
):
    """Computes overall quality score and 4 sub-scores (completeness, consistency, validity, uniqueness)."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    score_dict = QualityScoreService.compute(session.df)
    return QualityScoreResponse(
        dataset_id=dataset_id,
        overall_score=score_dict["overall_score"],
        sub_scores=score_dict["sub_scores"],
    )


# ─── Module 6: Visualization Endpoints ───────────────────────────────────────


@router.get("/{dataset_id}/viz/histogram", response_model=HistogramResponse)
async def get_viz_histogram(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
    column: str = Query(..., description="Numerical column name"),
    bins: int = Query(20, ge=5, le=100, description="Number of histogram bins"),
):
    """Generates histogram buckets for a numerical column."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    df = session.df
    if column not in df.columns:
        raise AppError(code="COLUMN_NOT_FOUND", message=f"Column '{column}' not found.", status_code=404)

    series = pd.to_numeric(df[column], errors="coerce").dropna()
    if series.empty:
        return HistogramResponse(
            dataset_id=dataset_id, column=column, buckets=[], total_rows=0
        )

    counts, bin_edges = np.histogram(series, bins=bins)
    buckets = []
    for i in range(len(counts)):
        b_start = float(bin_edges[i])
        b_end = float(bin_edges[i + 1])
        buckets.append(
            HistogramBucket(
                bin_start=round(b_start, 4),
                bin_end=round(b_end, 4),
                count=int(counts[i]),
                label=f"{round(b_start, 2)} - {round(b_end, 2)}",
            )
        )

    return HistogramResponse(
        dataset_id=dataset_id,
        column=column,
        buckets=buckets,
        total_rows=len(series),
        min_val=float(series.min()),
        max_val=float(series.max()),
        mean_val=round(float(series.mean()), 4),
    )


@router.get("/{dataset_id}/viz/boxplot", response_model=BoxPlotResponse)
async def get_viz_boxplot(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
    column: str = Query(..., description="Numerical column name"),
):
    """Computes box plot statistics (min, Q1, median, Q3, max, whiskers, outliers) for a numerical column."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    df = session.df
    if column not in df.columns:
        raise AppError(code="COLUMN_NOT_FOUND", message=f"Column '{column}' not found.", status_code=404)

    series = pd.to_numeric(df[column], errors="coerce").dropna()
    if series.empty:
        return BoxPlotResponse(
            dataset_id=dataset_id,
            column=column,
            min_val=0.0,
            q1=0.0,
            median=0.0,
            q3=0.0,
            max_val=0.0,
            whisker_low=0.0,
            whisker_high=0.0,
            outliers=[],
        )

    q1 = float(series.quantile(0.25))
    median = float(series.quantile(0.50))
    q3 = float(series.quantile(0.75))
    iqr = q3 - q1
    lower_bound = q1 - 1.5 * iqr
    upper_bound = q3 + 1.5 * iqr

    non_outliers = series[(series >= lower_bound) & (series <= upper_bound)]
    whisker_low = float(non_outliers.min()) if not non_outliers.empty else q1
    whisker_high = float(non_outliers.max()) if not non_outliers.empty else q3

    outliers = series[(series < lower_bound) | (series > upper_bound)].tolist()
    # Limit to 50 sample outliers for display
    sample_outliers = [round(float(o), 4) for o in outliers[:50]]

    return BoxPlotResponse(
        dataset_id=dataset_id,
        column=column,
        min_val=round(float(series.min()), 4),
        q1=round(q1, 4),
        median=round(median, 4),
        q3=round(q3, 4),
        max_val=round(float(series.max()), 4),
        whisker_low=round(whisker_low, 4),
        whisker_high=round(whisker_high, 4),
        outliers=sample_outliers,
    )


@router.get("/{dataset_id}/viz/scatter", response_model=ScatterResponse)
async def get_viz_scatter(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
    x_column: str = Query(..., description="X-axis numerical column name"),
    y_column: str = Query(..., description="Y-axis numerical column name"),
    limit: int = Query(500, ge=10, le=2000, description="Max data points to sample"),
):
    """Returns paired (x, y) data points for scatter plot visual analysis."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    df = session.df
    if x_column not in df.columns or y_column not in df.columns:
        raise AppError(code="COLUMN_NOT_FOUND", message="One or both columns not found.", status_code=404)

    sub_df = df[[x_column, y_column]].copy()
    sub_df[x_column] = pd.to_numeric(sub_df[x_column], errors="coerce")
    sub_df[y_column] = pd.to_numeric(sub_df[y_column], errors="coerce")
    valid = sub_df.dropna()

    if len(valid) > limit:
        valid = valid.sample(n=limit, random_state=42)

    points = []
    for _, row in valid.iterrows():
        points.append(
            ScatterDataPoint(
                x=round(float(row[x_column]), 4),
                y=round(float(row[y_column]), 4),
            )
        )

    return ScatterResponse(
        dataset_id=dataset_id,
        x_column=x_column,
        y_column=y_column,
        data=points,
        total_points=len(points),
    )


@router.get("/{dataset_id}/viz/correlation", response_model=CorrelationResponse)
async def get_viz_correlation(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
):
    """Computes pair-wise Pearson correlation matrix for numerical columns."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    df = session.df
    num_df = df.select_dtypes(include=[np.number])

    if num_df.shape[1] < 2:
        return CorrelationResponse(dataset_id=dataset_id, columns=[], data=[])

    corr_matrix = num_df.corr(method="pearson")
    columns = list(corr_matrix.columns)
    pairs = []

    for c1 in columns:
        for c2 in columns:
            val = corr_matrix.loc[c1, c2]
            pairs.append(
                CorrelationPair(
                    x=c1,
                    y=c2,
                    value=None if pd.isna(val) else round(float(val), 4),
                )
            )

    return CorrelationResponse(
        dataset_id=dataset_id,
        columns=columns,
        data=pairs,
    )


# ─── Module 7: Undo / Redo via Log Replay ───────────────────────────────────


@router.post("/{dataset_id}/undo", response_model=UndoRedoResponse)
async def undo_operation(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
):
    """Undoes the last operation using operation-log replay."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    if session.current_step <= 0:
        raise AppError(code="CANNOT_UNDO", message="Already at initial state (step 0). No operations to undo.", status_code=400)

    record = session.undo()
    op_name = record.operation if record else None

    return UndoRedoResponse(
        dataset_id=dataset_id,
        current_step=session.current_step,
        total_steps=len(session.history),
        can_undo=session.current_step > 0,
        can_redo=session.current_step < len(session.history),
        rows_current=len(session.df),
        operation_name=op_name,
        message=f"Undid step {session.current_step + 1} ({op_name}) — restored to {len(session.df)} rows",
    )


@router.post("/{dataset_id}/redo", response_model=UndoRedoResponse)
async def redo_operation(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
):
    """Redoes the next operation using operation-log replay."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    if session.current_step >= len(session.history):
        raise AppError(code="CANNOT_REDO", message="Already at latest step. No operations to redo.", status_code=400)

    record = session.redo()
    op_name = record.operation if record else None

    return UndoRedoResponse(
        dataset_id=dataset_id,
        current_step=session.current_step,
        total_steps=len(session.history),
        can_undo=session.current_step > 0,
        can_redo=session.current_step < len(session.history),
        rows_current=len(session.df),
        operation_name=op_name,
        message=f"Redid step {session.current_step} ({op_name}) — updated to {len(session.df)} rows",
    )


@router.post("/{dataset_id}/goto-step", response_model=UndoRedoResponse)
async def goto_step_operation(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
    step: int = Query(..., ge=0, description="Target history step index (0 = original state)"),
):
    """Jumps to a specific step in history by replaying log from step 0."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    if step < 0 or step > len(session.history):
        raise AppError(code="INVALID_STEP", message=f"Target step must be between 0 and {len(session.history)}.", status_code=400)

    session.replay_to_step(step)

    return UndoRedoResponse(
        dataset_id=dataset_id,
        current_step=session.current_step,
        total_steps=len(session.history),
        can_undo=session.current_step > 0,
        can_redo=session.current_step < len(session.history),
        rows_current=len(session.df),
        message=f"Replayed to step {step} — dataset updated to {len(session.df)} rows",
    )


# ─── Module 8: Dataset Export ────────────────────────────────────────────────


@router.get("/{dataset_id}/export")
async def export_dataset(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
    format: str = Query("csv", description="File format: csv | xlsx"),
):
    """Exports cleaned dataset as downloadable CSV or XLSX file."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    df = session.df
    base_name = session.metadata.get("filename", f"dataset_{dataset_id}").rsplit(".", 1)[0]
    safe_name = "".join(c for c in base_name if c.isalnum() or c in ("-", "_")).strip() or "dataset"

    if format.lower() == "xlsx":
        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Cleaned Data")
        buffer.seek(0)
        filename = f"{safe_name}_cleaned.xlsx"
        return Response(
            content=buffer.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    else:
        # Default CSV
        csv_str = df.to_csv(index=False)
        filename = f"{safe_name}_cleaned.csv"
        return Response(
            content=csv_str.encode("utf-8"),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )


# ─── Module 9: Quality Audit Report Export ───────────────────────────────────


@router.get("/{dataset_id}/export/report")
async def export_report(
    dataset_id: str = Path(..., description="Unique dataset identifier"),
    format: str = Query("html", description="Report format: html | pdf"),
):
    """Exports data quality audit report (rows before/after, quality scores before/after, and bulleted operations log)."""
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    base_name = session.metadata.get("filename", f"dataset_{dataset_id}").rsplit(".", 1)[0]
    safe_name = "".join(c for c in base_name if c.isalnum() or c in ("-", "_")).strip() or "dataset"

    if format.lower() == "pdf":
        pdf_bytes = ReportGeneratorService.generate_pdf_report(session)
        filename = f"{safe_name}_quality_report.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    else:
        # Default HTML
        html_str = ReportGeneratorService.generate_html_report(session)
        filename = f"{safe_name}_quality_report.html"
        return Response(
            content=html_str.encode("utf-8"),
            media_type="text/html",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )


# ─── Module 10: AI Dataset Analysis ─────────────────────────────────────────


@router.post("/{dataset_id}/ai/analyze", response_model=AIAnalysisResponse)
async def analyze_dataset_with_ai(
    dataset_id: str = Path(..., description="Unique dataset identifier")
):
    """
    Analyzes dataset quality using Gemini API (or rule engine fallback).
    STRICT PRIVACY GUARANTEE: Sends ONLY high-level metadata profile (shape, dtypes, missing %, flagged issues, quality sub-scores). NEVER sends raw row-level data.
    Caches responses per dataset + profile-hash.
    """
    session = session_store.get_session(dataset_id)
    if session is None:
        raise AppError(code="DATASET_NOT_FOUND", message=f"Dataset '{dataset_id}' not found.", status_code=404)

    analysis_response = AIAnalysisService.analyze(session.df, dataset_id)
    return analysis_response




