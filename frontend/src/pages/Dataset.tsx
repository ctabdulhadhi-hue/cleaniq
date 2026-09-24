import { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  Database,
  Layers,
  HardDrive,
  Copy,
  AlertCircle,
  CheckCircle2,
  UploadCloud,
  ChevronDown,
  FileSpreadsheet,
  Calendar,
  Binary,
  Hash,
  Type,
  Download,
  FileText,
  RotateCcw,
} from 'lucide-react';
import {
  getDatasetProfile,
  getRecentDatasets,
  getDatasetExportUrl,
  getReportExportUrl,
  loadSampleDataset,
  type DatasetProfileResponse,
  type RecentDataset,
  updateRecentDatasetIssues,
} from '../services/api';
import { DataTable } from '../components/DataTable';
import { TiltCard } from '../components/reactbits/TiltCard';

export function Dataset() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const queryId = searchParams.get('id');
  const [recentDatasets, setRecentDatasets] = useState<RecentDataset[]>(() => getRecentDatasets());
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(() => {
    if (queryId) return queryId;
    const initialList = getRecentDatasets();
    return initialList.length > 0 ? initialList[0].dataset_id : null;
  });

  const [profile, setProfile] = useState<DatasetProfileResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [resettingSample, setResettingSample] = useState(false);

  const handleResetSample = async () => {
    try {
      setResettingSample(true);
      const res = await loadSampleDataset();
      const updatedList = getRecentDatasets();
      setRecentDatasets(updatedList);
      setActiveDatasetId(res.dataset_id);
      setSearchParams({ id: res.dataset_id });
    } catch (err: any) {
      console.error('Failed to reset sample dataset:', err);
    } finally {
      setResettingSample(false);
    }
  };

  // Sync activeDatasetId if queryId or recent list changes
  useEffect(() => {
    if (queryId && queryId !== activeDatasetId) {
      setActiveDatasetId(queryId);
    } else if (!queryId && recentDatasets.length > 0 && !activeDatasetId) {
      setActiveDatasetId(recentDatasets[0].dataset_id);
      setSearchParams({ id: recentDatasets[0].dataset_id });
    }
  }, [queryId, activeDatasetId, recentDatasets, setSearchParams]);

  // Fetch dataset profile when activeDatasetId changes
  useEffect(() => {
    let cancelled = false;
    if (!activeDatasetId) {
      setProfile(null);
      return;
    }

    const fetchProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getDatasetProfile(activeDatasetId);
        if (!cancelled) {
          setProfile(res);
          // Update total issues found in local storage
          const totalMissing = res.columns.reduce((sum, col) => sum + col.missing_count, 0);
          const totalIssues = totalMissing + res.duplicate_row_count;
          updateRecentDatasetIssues(activeDatasetId, totalIssues);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Dataset not found or session has expired.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [activeDatasetId]);

  const handleSelectDataset = (id: string) => {
    setActiveDatasetId(id);
    setSearchParams({ id });
  };

  if (!activeDatasetId || (!loading && error && recentDatasets.length === 0)) {
    return (
      <div className="empty-state-card max-w-4xl mx-auto py-12 text-center space-y-5">
        <div className="empty-state-icon w-16 h-16 rounded-[14px] bg-[#ff6a3d]/10 text-[#ff6a3d] mx-auto flex items-center justify-center border border-[#ff6a3d]/25">
          <Database className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">No Active Dataset</h2>
          <p className="text-sm text-[#8a8a86] mt-1 max-w-sm mx-auto">
            Upload a CSV or Excel dataset to inspect its profile and explore tabular rows.
          </p>
        </div>
        <div>
          <Link
            to="/upload"
            className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload Dataset</span>
          </Link>
        </div>
      </div>
    );
  }

  const columnsWithMissing = profile?.columns.filter((c) => c.missing_count > 0) || [];
  const totalMissingCells = profile?.columns.reduce((acc, c) => acc + c.missing_count, 0) || 0;

  const activeRecent = recentDatasets.find((d) => d.dataset_id === activeDatasetId);
  const isSample = Boolean(profile?.is_sample || activeRecent?.is_sample);
  const currentFilename = activeRecent?.filename || profile?.filename || (isSample ? 'sample_dataset.csv' : 'Dataset Inspection & Schema');

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header & Dataset Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#ff6a3d] font-semibold mb-1">
            <Database className="w-3.5 h-3.5" />
            <span>Dataset Explorer</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="animate-hero-blur-in text-3xl font-extrabold text-white tracking-tight">
              {currentFilename}
            </h1>
            {isSample && (
              <span
                id="sample-data-badge"
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/25"
              >
                Sample data
              </span>
            )}
          </div>
          {isSample ? (
            <div className="flex items-center gap-3 mt-1.5 text-xs text-[#8a8a86] flex-wrap">
              <span>This is sample data — upload your own anytime from the sidebar.</span>
              <button
                type="button"
                id="reset-sample-btn"
                onClick={handleResetSample}
                disabled={resettingSample}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#ff6a3d] hover:text-[#ff7b50] underline cursor-pointer disabled:opacity-50"
              >
                {resettingSample ? (
                  <>
                    <RotateCcw className="w-3 h-3 animate-spin" />
                    <span>Resetting sample...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3 h-3" />
                    <span>Start over with a fresh sample</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <p className="text-xs text-[#8a8a86] mt-1">
              Dataset Inspection & Schema
            </p>
          )}
        </div>

        {/* Switcher & Action buttons */}
        <div className="flex flex-wrap items-center gap-3">
          {recentDatasets.length > 1 && (
            <div className="relative">
              <select
                value={activeDatasetId}
                onChange={(e) => handleSelectDataset(e.target.value)}
                className="appearance-none bg-white/[0.03] border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-2 pr-9 text-xs text-[#f2f2f0] font-medium hover:border-[#ff6a3d]/50 focus:outline-none"
              >
                {recentDatasets.map((d) => (
                  <option key={d.dataset_id} value={d.dataset_id} className="bg-[#0c0c0e]">
                    {d.filename} {d.is_sample ? '(Sample)' : ''} ({d.dataset_id.slice(0, 10)})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#8a8a86] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          {activeDatasetId && (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={getDatasetExportUrl(activeDatasetId, 'csv')}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#ff6a3d] hover:bg-[#ff7b50] text-[#0c0c0e] text-xs font-bold transition-all"
                title="Download Cleaned CSV Dataset"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </a>

              <a
                href={getDatasetExportUrl(activeDatasetId, 'xlsx')}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[rgba(255,255,255,0.15)] hover:bg-white/5 text-[#f2f2f0] text-xs font-medium transition-all"
                title="Download Cleaned Excel Dataset"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export XLSX</span>
              </a>

              <a
                href={getReportExportUrl(activeDatasetId, 'pdf')}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[rgba(255,255,255,0.15)] hover:bg-white/5 text-[#f2f2f0] text-xs font-medium transition-all"
                title="Download PDF Quality Audit Report"
              >
                <FileText className="w-3.5 h-3.5 text-[#ff6a3d]" />
                <span>PDF Report</span>
              </a>
            </div>
          )}

          <Link
            to="/upload"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[rgba(255,255,255,0.15)] hover:bg-white/5 text-[#f2f2f0] text-xs font-medium transition-colors"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>New Upload</span>
          </Link>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-[14px] bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">Failed to Load Profile</p>
              <p className="text-xs text-rose-300/90 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/upload')}
            className="text-xs underline hover:text-white"
          >
            Upload Again
          </button>
        </div>
      )}

      {/* Profile Overview Stats */}
      {profile && (
        <div className="space-y-6">
          {/* 4 Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Rows */}
            <TiltCard
              tiltAmplitude={4}
              spotlightColor="rgba(255, 106, 61, 0.14)"
              className="kpi-card p-5 rounded-[14px] bg-white/[0.03] border border-[rgba(255,255,255,0.08)] space-y-2 cursor-default"
            >
              <div className="flex items-center justify-between text-[#8a8a86] text-xs font-medium">
                <span>Total Rows</span>
                <Layers className="w-4 h-4 text-[#ff6a3d]" />
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-white font-mono">
                {profile.row_count.toLocaleString()}
              </div>
              <p className="text-[11px] text-[#8a8a86]">Records in current session</p>
            </TiltCard>

            {/* Columns */}
            <TiltCard
              tiltAmplitude={4}
              spotlightColor="rgba(255, 106, 61, 0.14)"
              className="kpi-card p-5 rounded-[14px] bg-white/[0.03] border border-[rgba(255,255,255,0.08)] space-y-2 cursor-default"
            >
              <div className="flex items-center justify-between text-[#8a8a86] text-xs font-medium">
                <span>Total Columns</span>
                <FileSpreadsheet className="w-4 h-4 text-[#ff6a3d]" />
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-white font-mono">
                {profile.column_count}
              </div>
              <p className="text-[11px] text-[#8a8a86]">Schema attributes detected</p>
            </TiltCard>

            {/* Memory Usage */}
            <TiltCard
              tiltAmplitude={4}
              spotlightColor="rgba(255, 106, 61, 0.14)"
              className="kpi-card p-5 rounded-[14px] bg-white/[0.03] border border-[rgba(255,255,255,0.08)] space-y-2 cursor-default"
            >
              <div className="flex items-center justify-between text-[#8a8a86] text-xs font-medium">
                <span>Memory Footprint</span>
                <HardDrive className="w-4 h-4 text-[#ff6a3d]" />
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-white font-mono">
                {profile.memory_usage_formatted}
              </div>
              <p className="text-[11px] text-[#8a8a86]">Deep DataFrame allocation</p>
            </TiltCard>

            {/* Duplicate Rows */}
            <TiltCard
              tiltAmplitude={4}
              spotlightColor={profile.duplicate_row_count > 0 ? 'rgba(251, 191, 36, 0.16)' : 'rgba(52, 211, 153, 0.16)'}
              className="kpi-card p-5 rounded-[14px] bg-white/[0.03] border border-[rgba(255,255,255,0.08)] space-y-2 cursor-default"
            >
              <div className="flex items-center justify-between text-[#8a8a86] text-xs font-medium">
                <span>Duplicate Rows</span>
                <Copy className="w-4 h-4 text-[#ff6a3d]" />
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-2xl sm:text-3xl font-bold font-mono ${
                    profile.duplicate_row_count > 0 ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                >
                  {profile.duplicate_row_count.toLocaleString()}
                </span>
                {profile.duplicate_row_count > 0 && (
                  <span className="text-[11px] text-amber-400/80 font-medium">flagged</span>
                )}
              </div>
              <p className="text-[11px] text-[#8a8a86]">
                {profile.duplicate_row_count === 0
                  ? 'All rows are unique'
                  : 'Candidate duplicates for removal'}
              </p>
            </TiltCard>
          </div>

          {/* Type Distribution & Missing Values Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Column Types Breakdown */}
            <div className="p-6 rounded-[14px] bg-white/[0.03] border border-[rgba(255,255,255,0.08)] space-y-4">
              <h3 className="text-sm font-semibold text-white">Column Types Breakdown</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)] flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#ff6a3d]/15 text-[#ff6a3d] flex items-center justify-center">
                    <Hash className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white font-mono">
                      {profile.type_summary.numerical}
                    </div>
                    <div className="text-[11px] text-[#8a8a86]">Numerical</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)] flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#ff6a3d]/15 text-[#ff6a3d] flex items-center justify-center">
                    <Type className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white font-mono">
                      {profile.type_summary.categorical}
                    </div>
                    <div className="text-[11px] text-[#8a8a86]">Categorical</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)] flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#ff6a3d]/15 text-[#ff6a3d] flex items-center justify-center">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white font-mono">
                      {profile.type_summary.date}
                    </div>
                    <div className="text-[11px] text-[#8a8a86]">Date/Time</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)] flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#ff6a3d]/15 text-[#ff6a3d] flex items-center justify-center">
                    <Binary className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white font-mono">
                      {profile.type_summary.boolean}
                    </div>
                    <div className="text-[11px] text-[#8a8a86]">Boolean</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Missing Values Overview */}
            <div className="lg:col-span-2 p-6 rounded-[14px] bg-white/[0.03] border border-[rgba(255,255,255,0.08)] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Missing Values per Column</h3>
                  <p className="text-xs text-[#8a8a86] mt-0.5">
                    {totalMissingCells === 0
                      ? 'No missing values found across all columns'
                      : `${totalMissingCells} total null cells found in ${columnsWithMissing.length} column(s)`}
                  </p>
                </div>
                {totalMissingCells === 0 ? (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 100% Complete
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-medium">
                    <AlertCircle className="w-3.5 h-3.5" /> Missing Data Found
                  </span>
                )}
              </div>

              {/* Column Missing Bars */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-40 overflow-y-auto pr-1">
                {profile.columns.map((col) => {
                  const hasMissing = col.missing_count > 0;
                  return (
                    <div
                      key={col.name}
                      className="p-3 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)] flex flex-col justify-between gap-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-semibold text-slate-200 truncate">{col.name}</span>
                          <span className="text-[10px] text-[#8a8a86] font-mono px-1.5 py-0.2 rounded bg-white/5">
                            {col.type}
                          </span>
                        </div>
                        <span
                          className={`font-mono text-[11px] font-semibold ${
                            hasMissing ? 'text-amber-400' : 'text-[#8a8a86]'
                          }`}
                        >
                          {col.missing_count} ({col.missing_percentage}%)
                        </span>
                      </div>

                      {/* Percentage Bar */}
                      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            hasMissing ? 'bg-amber-400' : 'bg-emerald-500/60'
                          }`}
                          style={{
                            width: hasMissing ? `${Math.max(col.missing_percentage, 5)}%` : '0%',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Paginated DataTable */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Tabular Rows Preview</h2>
          <span className="text-xs text-[#8a8a86]">
            Previewing live rows from session store (default size 100)
          </span>
        </div>
        <DataTable datasetId={activeDatasetId} />
      </div>
    </div>
  );
}
