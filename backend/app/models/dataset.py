from typing import List, Dict, Any, Optional
from datetime import datetime
from pydantic import BaseModel, Field


class ColumnProfile(BaseModel):
    name: str = Field(..., description="Column header name")
    type: str = Field(..., description="General category: numerical, categorical, date, boolean")
    dtype: str = Field(..., description="Underlying pandas/numpy dtype string representation")
    missing_count: int = Field(..., description="Total count of missing/NaN values")
    missing_percentage: float = Field(..., description="Percentage of missing values (0-100)")
    unique_count: int = Field(..., description="Number of distinct non-null values")


class DatasetProfileResponse(BaseModel):
    dataset_id: str
    row_count: int
    column_count: int
    memory_usage_bytes: int
    memory_usage_formatted: str
    duplicate_row_count: int
    columns: List[ColumnProfile]
    type_summary: Dict[str, int] = Field(
        ...,
        description="Counts of columns per category: numerical, categorical, date, boolean",
    )
    filename: Optional[str] = None
    is_sample: bool = False


class DatasetUploadResponse(BaseModel):
    dataset_id: str
    filename: str
    row_count: int
    column_count: int
    file_size_bytes: int
    message: str = "Dataset uploaded and parsed successfully"
    created_at: datetime
    is_sample: bool = False


class DatasetPreviewResponse(BaseModel):
    dataset_id: str
    page: int
    size: int
    total_rows: int
    total_pages: int
    has_next: bool
    has_prev: bool
    columns: List[str]
    rows: List[Dict[str, Any]]


# ─── Cleaning Request/Response Models ─────────────────────────────────────────


class CleanMissingRequest(BaseModel):
    """Request body for POST /clean/missing"""
    column: str = Field(..., description="Target column name")
    method: str = Field(
        ...,
        description="Fill method: remove | mean | median | mode | custom",
    )
    value: Optional[Any] = Field(
        default=None,
        description="Custom fill value (required when method='custom')",
    )


class CleanDuplicatesRequest(BaseModel):
    """Request body for POST /clean/duplicates (optional, can be empty)"""
    pass


class CleanOperationResponse(BaseModel):
    """
    Unified response for all cleaning endpoints.
    Returns affected_rows, before/after summaries, and an operation_id
    (null during preview, set after apply).
    """
    affected_rows: int
    before_summary: str
    after_summary: str
    operation_id: Optional[str] = None
    sample_rows: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Sample of affected rows (e.g. duplicate rows for preview)",
    )


# ─── Operation Log Models ────────────────────────────────────────────────────


class OperationLogEntry(BaseModel):
    """A single entry in the per-dataset operation log."""
    timestamp: str
    operation: str
    column: Optional[str] = None
    method: Optional[str] = None
    affected_rows: int = 0


class OperationLogResponse(BaseModel):
    dataset_id: str
    entries: List[OperationLogEntry]
    total: int


# ─── Column Stats (for Visualization) ────────────────────────────────────────


class ColumnStatistics(BaseModel):
    name: str
    type: str
    dtype: str
    missing_count: int = 0
    missing_percentage: float = 0.0
    unique_count: int = 0
    # Numerical stats (null for non-numerical)
    min: Optional[Any] = None
    max: Optional[Any] = None
    mean: Optional[float] = None
    median: Optional[float] = None
    std: Optional[float] = None
    # Categorical stats (null for non-categorical)
    top_values: Optional[List[Dict[str, Any]]] = None


class ColumnStatsResponse(BaseModel):
    dataset_id: str
    row_count: int
    column_count: int
    columns: List[ColumnStatistics]


# ─── Advanced Cleaning & Column Management Models ───────────────────────────


class TypeSuggestion(BaseModel):
    column: str
    current_type: str
    suggested_type: str
    confidence: float
    reason: str
    sample_from: List[Any] = []
    sample_to: List[Any] = []


class TypeSuggestionsResponse(BaseModel):
    dataset_id: str
    suggestions: List[TypeSuggestion]


class ConvertTypeRequest(BaseModel):
    column: str
    target_type: str = Field(..., description="integer | float | datetime | boolean | string")
    date_format: Optional[str] = None
    errors_strategy: Optional[str] = "coerce"


class TextTransformRequest(BaseModel):
    column: str
    operation: str = Field(..., description="trim | case | remove_special | find_replace")
    case_type: Optional[str] = Field(default=None, description="lower | upper | title")
    find_text: Optional[str] = None
    replace_text: Optional[str] = None
    regex: Optional[bool] = False


class ClusterVariant(BaseModel):
    value: str
    count: int


class ClusterProposal(BaseModel):
    canonical: str
    canonical_count: int
    variants: List[ClusterVariant]
    total_affected: int


class CategoryClustersResponse(BaseModel):
    dataset_id: str
    column: str
    clusters: List[ClusterProposal]


class StandardizeMergeItem(BaseModel):
    canonical: str
    variants: List[str]


class StandardizeCategoriesRequest(BaseModel):
    column: str
    merges: List[StandardizeMergeItem]


class RenameColumnRequest(BaseModel):
    old_name: str
    new_name: str


class DeleteColumnRequest(BaseModel):
    column: str


class ReorderColumnsRequest(BaseModel):
    column_order: List[str]


class CalculatedColumnRequest(BaseModel):
    new_column: str
    expression: str


# ─── Outlier Detection Models ────────────────────────────────────────────────


class OutlierDetectRequest(BaseModel):
    column: str
    method: str = Field(default="iqr", description="iqr | zscore")
    multiplier: float = Field(default=1.5, ge=0.5, le=5.0, description="IQR multiplier (for IQR method)")
    zscore_threshold: float = Field(default=3.0, ge=1.0, le=10.0, description="Z-score threshold (for zscore method)")


class OutlierSampleItem(BaseModel):
    index: int
    value: Optional[float] = None
    zscore: Optional[float] = None


class OutlierDetectResponse(BaseModel):
    column: str
    method: str
    outlier_count: int
    total_rows: int
    percentage: float
    bounds: Dict[str, Optional[float]]
    stats: Dict[str, Optional[float]]
    sample_outliers: List[OutlierSampleItem]


class OutlierHandleRequest(BaseModel):
    column: str
    method: str = Field(default="iqr", description="iqr | zscore")
    action: str = Field(default="remove", description="remove | cap | keep")
    multiplier: float = Field(default=1.5, ge=0.5, le=5.0)
    zscore_threshold: float = Field(default=3.0, ge=1.0, le=10.0)


# ─── Quality Score Models ────────────────────────────────────────────────────


class QualitySubScore(BaseModel):
    name: str
    score: float
    weight: float
    detail: str


class QualityScoreResponse(BaseModel):
    dataset_id: str
    overall_score: float
    sub_scores: List[QualitySubScore]


# ─── Visualization Data Models ──────────────────────────────────────────────


class HistogramBucket(BaseModel):
    bin_start: float
    bin_end: float
    count: int
    label: str


class HistogramResponse(BaseModel):
    dataset_id: str
    column: str
    buckets: List[HistogramBucket]
    total_rows: int
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    mean_val: Optional[float] = None


class BoxPlotResponse(BaseModel):
    dataset_id: str
    column: str
    min_val: float
    q1: float
    median: float
    q3: float
    max_val: float
    whisker_low: float
    whisker_high: float
    outliers: List[float]


class ScatterDataPoint(BaseModel):
    x: Optional[float] = None
    y: Optional[float] = None


class ScatterResponse(BaseModel):
    dataset_id: str
    x_column: str
    y_column: str
    data: List[ScatterDataPoint]
    total_points: int


class CorrelationPair(BaseModel):
    x: str
    y: str
    value: Optional[float] = None


class CorrelationResponse(BaseModel):
    dataset_id: str
    columns: List[str]
    data: List[CorrelationPair]


# ─── Undo / Redo Log Replay Models ──────────────────────────────────────────


class UndoRedoResponse(BaseModel):
    dataset_id: str
    current_step: int
    total_steps: int
    can_undo: bool
    can_redo: bool
    rows_current: int
    operation_name: Optional[str] = None
    message: str


# ─── AI Analysis Models ──────────────────────────────────────────────────────


class AIRecommendationItem(BaseModel):
    id: int
    issue: str
    recommendation: str
    reason: str
    target_column: Optional[str] = None
    action_type: str  # clean_missing, clean_duplicates, outlier_handle, convert_type, standardize_values, text_transform
    action_params: Dict[str, Any]


class AIAnalysisResponse(BaseModel):
    dataset_id: str
    profile_hash: str
    cached: bool
    source: str
    recommendations: List[AIRecommendationItem]


