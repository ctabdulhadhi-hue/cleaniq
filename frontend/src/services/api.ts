export interface HealthResponse {
  status: string;
  app: string;
  version: string;
  active_sessions: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export interface DatasetUploadResponse {
  dataset_id: string;
  filename: string;
  row_count: number;
  column_count: number;
  file_size_bytes: number;
  message: string;
  created_at: string;
  is_sample?: boolean;
}

export interface ColumnProfile {
  name: string;
  type: 'numerical' | 'categorical' | 'date' | 'boolean';
  dtype: string;
  missing_count: number;
  missing_percentage: number;
  unique_count: number;
}

export interface DatasetProfileResponse {
  dataset_id: string;
  row_count: number;
  column_count: number;
  memory_usage_bytes: number;
  memory_usage_formatted: string;
  duplicate_row_count: number;
  columns: ColumnProfile[];
  type_summary: {
    numerical: number;
    categorical: number;
    date: number;
    boolean: number;
  };
  filename?: string;
  is_sample?: boolean;
}

export interface DatasetPreviewResponse {
  dataset_id: string;
  page: number;
  size: number;
  total_rows: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
  columns: string[];
  rows: Record<string, any>[];
}

export interface RecentDataset {
  dataset_id: string;
  filename: string;
  row_count: number;
  column_count: number;
  file_size_bytes: number;
  uploaded_at: string;
  issues_found?: number;
  is_sample?: boolean;
}

// ─── Cleaning Types ──────────────────────────────────────────────────────────

export interface CleanOperationResponse {
  affected_rows: number;
  before_summary: string;
  after_summary: string;
  operation_id: string | null;
  sample_rows?: Record<string, any>[];
}

export interface OperationLogEntry {
  timestamp: string;
  operation: string;
  column: string | null;
  method: string | null;
  affected_rows: number;
}

export interface OperationLogResponse {
  dataset_id: string;
  entries: OperationLogEntry[];
  total: number;
}

export interface UndoRedoResponse {
  dataset_id: string;
  current_step: number;
  total_steps: number;
  can_undo: boolean;
  can_redo: boolean;
  rows_current: number;
  operation_name?: string | null;
  message: string;
}

export interface AIRecommendationItem {
  id: number;
  issue: string;
  recommendation: string;
  reason: string;
  target_column: string | null;
  action_type: string;
  action_params: Record<string, any>;
}

export interface AIAnalysisResponse {
  dataset_id: string;
  profile_hash: string;
  cached: boolean;
  source: string;
  recommendations: AIRecommendationItem[];
}

// ─── Column Stats Types ──────────────────────────────────────────────────────

export interface ColumnStatistics {
  name: string;
  type: string;
  dtype: string;
  missing_count: number;
  missing_percentage: number;
  unique_count: number;
  min?: any;
  max?: any;
  mean?: number | null;
  median?: number | null;
  std?: number | null;
  top_values?: { value: any; count: number }[];
}

export interface ColumnStatsResponse {
  dataset_id: string;
  row_count: number;
  column_count: number;
  columns: ColumnStatistics[];
}

// ─── Advanced Cleaning & Column Management Types ───────────────────────────

export interface TypeSuggestion {
  column: string;
  current_type: string;
  suggested_type: string;
  confidence: number;
  reason: string;
  sample_from: any[];
  sample_to: any[];
}

export interface TypeSuggestionsResponse {
  dataset_id: string;
  suggestions: TypeSuggestion[];
}

export interface ConvertTypeParams {
  column: string;
  target_type: string;
  date_format?: string;
  errors_strategy?: string;
}

export interface TextTransformParams {
  column: string;
  operation: 'trim' | 'case' | 'remove_special' | 'find_replace';
  case_type?: 'lower' | 'upper' | 'title';
  find_text?: string;
  replace_text?: string;
  regex?: boolean;
}

export interface ClusterVariant {
  value: string;
  count: number;
}

export interface ClusterProposal {
  canonical: string;
  canonical_count: number;
  variants: ClusterVariant[];
  total_affected: number;
}

export interface CategoryClustersResponse {
  dataset_id: string;
  column: string;
  clusters: ClusterProposal[];
}

export interface StandardizeMergeItem {
  canonical: string;
  variants: string[];
}

export interface StandardizeCategoriesParams {
  column: string;
  merges: StandardizeMergeItem[];
}

// ─── Module 4: Outlier Detection & Handling Types ───────────────────────────

export interface OutlierSampleItem {
  index: number;
  value: number | null;
  zscore?: number | null;
}

export interface OutlierDetectResponse {
  column: string;
  method: string;
  outlier_count: number;
  total_rows: number;
  percentage: number;
  bounds: { lower: number | null; upper: number | null };
  stats: Record<string, number | null>;
  sample_outliers: OutlierSampleItem[];
}

export interface OutlierDetectParams {
  column: string;
  method?: 'iqr' | 'zscore';
  multiplier?: number;
  zscore_threshold?: number;
}

export interface OutlierHandleParams {
  column: string;
  method?: 'iqr' | 'zscore';
  action?: 'remove' | 'cap' | 'keep';
  multiplier?: number;
  zscore_threshold?: number;
}

// ─── Module 5: Quality Score Types ──────────────────────────────────────────

export interface QualitySubScore {
  name: string;
  score: number;
  weight: number;
  detail: string;
}

export interface QualityScoreResponse {
  dataset_id: string;
  overall_score: number;
  sub_scores: QualitySubScore[];
}

// ─── Module 6: Visualization Data Types ─────────────────────────────────────

export interface HistogramBucket {
  bin_start: number;
  bin_end: number;
  count: number;
  label: string;
}

export interface HistogramResponse {
  dataset_id: string;
  column: string;
  buckets: HistogramBucket[];
  total_rows: number;
  min_val?: number | null;
  max_val?: number | null;
  mean_val?: number | null;
}

export interface BoxPlotResponse {
  dataset_id: string;
  column: string;
  min_val: number;
  q1: number;
  median: number;
  q3: number;
  max_val: number;
  whisker_low: number;
  whisker_high: number;
  outliers: number[];
}

export interface ScatterDataPoint {
  x: number | null;
  y: number | null;
}

export interface ScatterResponse {
  dataset_id: string;
  x_column: string;
  y_column: string;
  data: ScatterDataPoint[];
  total_points: number;
}

export interface CorrelationPair {
  x: string;
  y: string;
  value: number | null;
}

export interface CorrelationResponse {
  dataset_id: string;
  columns: string[];
  data: CorrelationPair[];
}


// ─── Config ──────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || '';
const RECENT_DATASETS_KEY = 'cleaniq_recent_datasets';

// ─── Helper ──────────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = 'Request failed';
    try {
      const errJson = (await res.json()) as ApiError;
      if (errJson?.error?.message) message = errJson.error.message;
    } catch {
      // fallback
    }
    const err = new Error(message);
    (err as any).code = `HTTP_${res.status}`;
    throw err;
  }
  return res.json();
}

// ─── Health ──────────────────────────────────────────────────────────────────

export async function checkBackendHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);
  return handleResponse<HealthResponse>(res);
}

// ─── Upload ──────────────────────────────────────────────────────────────────

export async function uploadDataset(
  file: File,
  onProgress?: (progressPercent: number) => void,
): Promise<DatasetUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.open('POST', `${API_BASE}/api/v1/datasets`);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 90);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (onProgress) onProgress(100);
      try {
        const responseData = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(responseData as DatasetUploadResponse);
        } else {
          const code = responseData?.error?.code || `HTTP_${xhr.status}`;
          const message = responseData?.error?.message || 'File upload failed';
          const err = new Error(message);
          (err as any).code = code;
          reject(err);
        }
      } catch (e) {
        reject(new Error(xhr.statusText || 'Unable to parse server response'));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during file upload. Check if backend is running.'));
    };

    xhr.send(formData);
  });
}

// ─── Sample Dataset ──────────────────────────────────────────────────────────

export async function loadSampleDataset(): Promise<DatasetUploadResponse> {
  const res = await fetch(`${API_BASE}/api/v1/datasets/sample`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const data = await handleResponse<DatasetUploadResponse>(res);

  // Automatically cache in recent datasets
  saveRecentDataset({
    dataset_id: data.dataset_id,
    filename: data.filename,
    row_count: data.row_count,
    column_count: data.column_count,
    file_size_bytes: data.file_size_bytes,
    uploaded_at: data.created_at,
    is_sample: true,
  });

  return data;
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export async function getDatasetProfile(datasetId: string): Promise<DatasetProfileResponse> {
  const res = await fetch(`${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/profile`);
  return handleResponse<DatasetProfileResponse>(res);
}

// ─── Preview (paginated rows) ────────────────────────────────────────────────

export async function getDatasetPreview(
  datasetId: string,
  page: number = 1,
  size: number = 100,
): Promise<DatasetPreviewResponse> {
  const url = `${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/preview?page=${page}&size=${size}`;
  const res = await fetch(url);
  return handleResponse<DatasetPreviewResponse>(res);
}

// ─── Column Stats ────────────────────────────────────────────────────────────

export async function getColumnStats(datasetId: string): Promise<ColumnStatsResponse> {
  const res = await fetch(`${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/stats`);
  return handleResponse<ColumnStatsResponse>(res);
}

// ─── Clean: Missing Values ───────────────────────────────────────────────────

export async function cleanMissing(
  datasetId: string,
  column: string,
  method: 'remove' | 'mean' | 'median' | 'mode' | 'custom',
  value?: any,
  preview: boolean = true,
): Promise<CleanOperationResponse> {
  const url = `${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/clean/missing?preview=${preview}`;
  const body: any = { column, method };
  if (value !== undefined && value !== null) body.value = value;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<CleanOperationResponse>(res);
}

// ─── Clean: Duplicates ───────────────────────────────────────────────────────

export async function cleanDuplicates(
  datasetId: string,
  preview: boolean = true,
): Promise<CleanOperationResponse> {
  const url = `${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/clean/duplicates?preview=${preview}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return handleResponse<CleanOperationResponse>(res);
}

// ─── Operation Log ───────────────────────────────────────────────────────────

export async function getOperationLog(datasetId: string): Promise<OperationLogResponse> {
  const res = await fetch(`${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/operations`);
  return handleResponse<OperationLogResponse>(res);
}

// ─── Rollback ────────────────────────────────────────────────────────────────

export async function rollbackLastOperation(datasetId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/rollback`, {
    method: 'POST',
  });
  return handleResponse<any>(res);
}

// ─── Module 1: Data Type Conversion API ──────────────────────────────────────

export async function getTypeSuggestions(datasetId: string): Promise<TypeSuggestionsResponse> {
  const res = await fetch(`${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/clean/type-suggestions`);
  return handleResponse<TypeSuggestionsResponse>(res);
}

export async function convertColumnType(
  datasetId: string,
  params: ConvertTypeParams,
  preview: boolean = true,
): Promise<CleanOperationResponse> {
  const url = `${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/clean/convert-type?preview=${preview}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return handleResponse<CleanOperationResponse>(res);
}

// ─── Module 2: Text Cleaning & Standardization API ──────────────────────────

export async function transformText(
  datasetId: string,
  params: TextTransformParams,
  preview: boolean = true,
): Promise<CleanOperationResponse> {
  const url = `${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/clean/text/transform?preview=${preview}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return handleResponse<CleanOperationResponse>(res);
}

export async function getCategoryClusters(
  datasetId: string,
  column: string,
  threshold: number = 0.85,
): Promise<CategoryClustersResponse> {
  const url = `${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/clean/text/clusters?column=${encodeURIComponent(column)}&threshold=${threshold}`;
  const res = await fetch(url);
  return handleResponse<CategoryClustersResponse>(res);
}

export async function standardizeCategories(
  datasetId: string,
  params: StandardizeCategoriesParams,
  preview: boolean = true,
): Promise<CleanOperationResponse> {
  const url = `${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/clean/text/standardize?preview=${preview}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return handleResponse<CleanOperationResponse>(res);
}

// ─── Module 3: Column Management API ────────────────────────────────────────

export async function renameColumn(
  datasetId: string,
  oldName: string,
  newName: string,
  preview: boolean = true,
): Promise<CleanOperationResponse> {
  const url = `${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/columns/rename?preview=${preview}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ old_name: oldName, new_name: newName }),
  });
  return handleResponse<CleanOperationResponse>(res);
}

export async function deleteColumn(
  datasetId: string,
  column: string,
  preview: boolean = true,
): Promise<CleanOperationResponse> {
  const url = `${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/columns/delete?preview=${preview}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ column }),
  });
  return handleResponse<CleanOperationResponse>(res);
}

export async function reorderColumns(
  datasetId: string,
  columnOrder: string[],
  preview: boolean = true,
): Promise<CleanOperationResponse> {
  const url = `${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/columns/reorder?preview=${preview}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ column_order: columnOrder }),
  });
  return handleResponse<CleanOperationResponse>(res);
}

export async function createCalculatedColumn(
  datasetId: string,
  newColumn: string,
  expression: string,
  preview: boolean = true,
): Promise<CleanOperationResponse> {
  const url = `${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/columns/calculate?preview=${preview}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_column: newColumn, expression }),
  });
  return handleResponse<CleanOperationResponse>(res);
}

// ─── Module 4: Outlier Detection API ────────────────────────────────────────

export async function detectOutliers(
  datasetId: string,
  params: OutlierDetectParams,
): Promise<OutlierDetectResponse> {
  const url = `${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/clean/outliers/detect`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return handleResponse<OutlierDetectResponse>(res);
}

export async function handleOutliers(
  datasetId: string,
  params: OutlierHandleParams,
  preview: boolean = true,
): Promise<CleanOperationResponse> {
  const url = `${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/clean/outliers/handle?preview=${preview}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return handleResponse<CleanOperationResponse>(res);
}

// ─── Module 5: Quality Score API ────────────────────────────────────────────

export async function getQualityScore(datasetId: string): Promise<QualityScoreResponse> {
  const res = await fetch(`${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/quality`);
  return handleResponse<QualityScoreResponse>(res);
}

// ─── Module 6: Visualization API ────────────────────────────────────────────

export async function getHistogramData(
  datasetId: string,
  column: string,
  bins: number = 20,
): Promise<HistogramResponse> {
  const url = `${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/viz/histogram?column=${encodeURIComponent(column)}&bins=${bins}`;
  const res = await fetch(url);
  return handleResponse<HistogramResponse>(res);
}

export async function getBoxPlotData(
  datasetId: string,
  column: string,
): Promise<BoxPlotResponse> {
  const url = `${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/viz/boxplot?column=${encodeURIComponent(column)}`;
  const res = await fetch(url);
  return handleResponse<BoxPlotResponse>(res);
}

export async function getScatterData(
  datasetId: string,
  xColumn: string,
  yColumn: string,
  limit: number = 500,
): Promise<ScatterResponse> {
  const url = `${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/viz/scatter?x_column=${encodeURIComponent(xColumn)}&y_column=${encodeURIComponent(yColumn)}&limit=${limit}`;
  const res = await fetch(url);
  return handleResponse<ScatterResponse>(res);
}

export async function getCorrelationData(
  datasetId: string,
): Promise<CorrelationResponse> {
  const url = `${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/viz/correlation`;
  const res = await fetch(url);
  return handleResponse<CorrelationResponse>(res);
}

// ─── Module 7 & 8: Undo/Redo & Export API Functions ─────────────────────────

export async function undoOperation(datasetId: string): Promise<UndoRedoResponse> {
  const res = await fetch(`${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/undo`, {
    method: 'POST',
  });
  return handleResponse<UndoRedoResponse>(res);
}

export async function redoOperation(datasetId: string): Promise<UndoRedoResponse> {
  const res = await fetch(`${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/redo`, {
    method: 'POST',
  });
  return handleResponse<UndoRedoResponse>(res);
}

export async function gotoStepOperation(datasetId: string, step: number): Promise<UndoRedoResponse> {
  const res = await fetch(`${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/goto-step?step=${step}`, {
    method: 'POST',
  });
  return handleResponse<UndoRedoResponse>(res);
}

export function getDatasetExportUrl(datasetId: string, format: 'csv' | 'xlsx' = 'csv'): string {
  return `${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/export?format=${format}`;
}

export function getReportExportUrl(datasetId: string, format: 'html' | 'pdf' = 'html'): string {
  return `${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/export/report?format=${format}`;
}

export async function analyzeDatasetWithAI(datasetId: string): Promise<AIAnalysisResponse> {
  const res = await fetch(`${API_BASE}/api/v1/datasets/${encodeURIComponent(datasetId)}/ai/analyze`, {
    method: 'POST',
  });
  return handleResponse<AIAnalysisResponse>(res);
}


// ─── LocalStorage helpers for Recent Datasets ────────────────────────────────

export function getRecentDatasets(): RecentDataset[] {
  try {
    const raw = localStorage.getItem(RECENT_DATASETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRecentDataset(dataset: RecentDataset): void {
  try {
    const current = getRecentDatasets().filter((d) => d.dataset_id !== dataset.dataset_id);
    current.unshift(dataset);
    // Keep up to 20 recent datasets
    const trimmed = current.slice(0, 20);
    localStorage.setItem(RECENT_DATASETS_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('Failed to save recent dataset:', e);
  }
}

export function updateRecentDatasetIssues(datasetId: string, issuesFound: number): void {
  try {
    const current = getRecentDatasets().map((d) =>
      d.dataset_id === datasetId ? { ...d, issues_found: issuesFound } : d,
    );
    localStorage.setItem(RECENT_DATASETS_KEY, JSON.stringify(current));
  } catch (e) {
    console.error('Failed to update recent dataset issues:', e);
  }
}

export function removeRecentDataset(datasetId: string): void {
  try {
    const updated = getRecentDatasets().filter((d) => d.dataset_id !== datasetId);
    localStorage.setItem(RECENT_DATASETS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to remove recent dataset:', e);
  }
}
