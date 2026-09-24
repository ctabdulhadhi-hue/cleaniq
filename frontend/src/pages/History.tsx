import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  History as HistoryIcon,
  Undo2,
  Redo2,
  Database,
  UploadCloud,
  CheckCircle2,
  Clock,
  Trash2,
  Wand2,
  Copy,
  ChevronDown,
  Loader2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Download,
  FileText,
} from 'lucide-react';
import {
  getOperationLog,
  undoOperation,
  redoOperation,
  gotoStepOperation,
  getRecentDatasets,
  getReportExportUrl,
  type OperationLogEntry,
  type RecentDataset,
} from '../services/api';

export function History() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryId = searchParams.get('id');

  const [recentDatasets, setRecentDatasets] = useState<RecentDataset[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(queryId);

  const [entries, setEntries] = useState<OperationLogEntry[]>([]);
  const [canUndo, setCanUndo] = useState(true);
  const [canRedo, setCanRedo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Initialize recent datasets
  useEffect(() => {
    const list = getRecentDatasets();
    setRecentDatasets(list);
    if (!queryId && list.length > 0) {
      setActiveDatasetId(list[0].dataset_id);
      setSearchParams({ id: list[0].dataset_id });
    }
  }, []);

  // Fetch operation log when dataset changes
  useEffect(() => {
    if (!activeDatasetId) return;
    let cancelled = false;

    const fetchHistory = async () => {
      setLoading(true);
      setError(null);
      setSuccessMessage(null);
      try {
        const data = await getOperationLog(activeDatasetId);
        if (!cancelled) {
          setEntries(data.entries);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load operation history');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [activeDatasetId]);

  const handleSelectDataset = (id: string) => {
    setActiveDatasetId(id);
    setSearchParams({ id });
  };

  const handleUndo = async () => {
    if (!activeDatasetId || actionLoading) return;
    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await undoOperation(activeDatasetId);
      setSuccessMessage(res.message);
      setCanUndo(res.can_undo);
      setCanRedo(res.can_redo);
      const data = await getOperationLog(activeDatasetId);
      setEntries(data.entries);
    } catch (err: any) {
      setError(err.message || 'Failed to undo step');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRedo = async () => {
    if (!activeDatasetId || actionLoading) return;
    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await redoOperation(activeDatasetId);
      setSuccessMessage(res.message);
      setCanUndo(res.can_undo);
      setCanRedo(res.can_redo);
      const data = await getOperationLog(activeDatasetId);
      setEntries(data.entries);
    } catch (err: any) {
      setError(err.message || 'Failed to redo step');
    } finally {
      setActionLoading(false);
    }
  };

  const handleGotoStep = async (step: number) => {
    if (!activeDatasetId || actionLoading) return;
    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await gotoStepOperation(activeDatasetId, step);
      setSuccessMessage(res.message);
      setCanUndo(res.can_undo);
      setCanRedo(res.can_redo);
      const data = await getOperationLog(activeDatasetId);
      setEntries(data.entries);
    } catch (err: any) {
      setError(err.message || 'Failed to jump to step');
    } finally {
      setActionLoading(false);
    }
  };

  const currentDataset = recentDatasets.find((d) => d.dataset_id === activeDatasetId);
  const totalAffectedRows = entries.reduce((sum, op) => sum + (op.affected_rows || 0), 0);

  // Formatting timestamp
  const formatTimestamp = (ts: string) => {
    try {
      const date = new Date(ts);
      return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  // Helper to render operation badge
  const renderOperationBadge = (op: OperationLogEntry) => {
    const name = op.operation;
    if (name.includes('outlier_remove')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <Trash2 className="w-3.5 h-3.5" />
          Remove Outliers
        </span>
      );
    }
    if (name.includes('outlier_cap')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <Wand2 className="w-3.5 h-3.5" />
          Cap Outliers
        </span>
      );
    }
    if (name.includes('convert_type')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#ff6a3d]/15 text-[#ffb08a] border border-[#ff6a3d]/30">
          <Wand2 className="w-3.5 h-3.5" />
          Convert Type
        </span>
      );
    }
    if (name.includes('text_') || name.includes('standardize')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <Sparkles className="w-3.5 h-3.5" />
          Text Clean ({op.method || name})
        </span>
      );
    }
    if (name.includes('column_')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#ff6a3d]/15 text-[#ffb08a] border border-[#ff6a3d]/30">
          <Wand2 className="w-3.5 h-3.5" />
          Column Ops ({name.replace('column_', '')})
        </span>
      );
    }
    if (name.includes('duplicates')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
          <Copy className="w-3.5 h-3.5" />
          Remove Duplicates
        </span>
      );
    }
    if (op.method === 'remove') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <Trash2 className="w-3.5 h-3.5" />
          Drop Missing Rows
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#ff6a3d]/15 text-[#ffb08a] border border-[#ff6a3d]/30">
        <Wand2 className="w-3.5 h-3.5" />
        Impute Missing ({op.method || 'value'})
      </span>
    );
  };

  if (!activeDatasetId && recentDatasets.length === 0) {
    return (
      <div className="empty-state-card max-w-4xl mx-auto py-16 text-center space-y-5">
        <div className="empty-state-icon w-16 h-16 rounded-[14px] bg-[#ff6a3d]/10 text-[#ff6a3d] mx-auto flex items-center justify-center border border-[#ff6a3d]/25">
          <Database className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white">No Dataset Active</h2>
        <p className="text-sm text-[#8a8a86] max-w-sm mx-auto">
          Upload a dataset and execute cleaning steps to build an operation history audit trail.
        </p>
        <Link
          to="/upload"
          className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
        >
          <UploadCloud className="w-4 h-4" />
          <span>Upload Dataset</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#ff6a3d] font-semibold mb-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Audit Trail & Rollbacks</span>
          </div>
          <h1 className="animate-hero-blur-in text-3xl font-extrabold text-white tracking-tight">
            Operation History
          </h1>
          <p className="text-sm text-[#8a8a86] mt-1">
            Chronological log of all approved data cleaning operations with instant rollbacks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {recentDatasets.length > 1 && (
            <div className="relative">
              <select
                value={activeDatasetId || ''}
                onChange={(e) => handleSelectDataset(e.target.value)}
                className="appearance-none bg-white/[0.03] border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-2 pr-9 text-xs text-[#f2f2f0] font-medium hover:border-[#ff6a3d]/50 focus:outline-none"
              >
                {recentDatasets.map((d) => (
                  <option key={d.dataset_id} value={d.dataset_id} className="bg-[#0c0c0e]">
                    {d.filename} ({d.dataset_id.slice(0, 10)})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#8a8a86] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          {activeDatasetId && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleUndo}
                disabled={actionLoading || entries.length === 0 || !canUndo}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 text-xs font-semibold transition-all disabled:opacity-40"
                title="Undo last step via log replay"
              >
                {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                <span>Undo</span>
              </button>

              <button
                type="button"
                onClick={handleRedo}
                disabled={actionLoading || !canRedo}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#ff6a3d]/15 hover:bg-[#ff6a3d]/25 text-[#ffb08a] border border-[#ff6a3d]/30 text-xs font-semibold transition-all disabled:opacity-40"
                title="Redo step via log replay"
              >
                {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Redo2 className="w-3.5 h-3.5" />}
                <span>Redo</span>
              </button>

              <a
                href={getReportExportUrl(activeDatasetId, 'pdf')}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[rgba(255,255,255,0.15)] hover:bg-white/5 text-[#f2f2f0] text-xs font-medium transition-all"
                title="Download PDF Quality Audit Report"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                <span>PDF Report</span>
              </a>

              <a
                href={getReportExportUrl(activeDatasetId, 'html')}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[rgba(255,255,255,0.15)] hover:bg-white/5 text-[#f2f2f0] text-xs font-medium transition-all"
                title="Download HTML Quality Audit Report"
              >
                <Download className="w-3.5 h-3.5" />
                <span>HTML Report</span>
              </a>
            </div>
          )}

          <Link
            to={`/cleaning?id=${activeDatasetId || ''}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#ff6a3d] hover:bg-[#ff7b50] text-[#0c0c0e] text-xs font-semibold transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#0c0c0e]" />
            <span>Open Studio</span>
          </Link>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between text-xs text-emerald-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-[#8a8a86] hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-between text-xs text-rose-400">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-[#8a8a86] hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-white/[0.03] p-5 space-y-1">
          <div className="text-xs text-[#8a8a86] uppercase font-semibold tracking-wider">
            Total Operations
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            {entries.length}
          </div>
          <div className="text-xs text-[#7a7a75]">
            Approved transformations applied
          </div>
        </div>

        <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-white/[0.03] p-5 space-y-1">
          <div className="text-xs text-[#8a8a86] uppercase font-semibold tracking-wider">
            Rows Affected
          </div>
          <div className="text-2xl font-bold text-[#ff6a3d] font-mono">
            {totalAffectedRows.toLocaleString()}
          </div>
          <div className="text-xs text-[#7a7a75]">
            Modified or cleaned across all actions
          </div>
        </div>

        <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-white/[0.03] p-5 space-y-1">
          <div className="text-xs text-[#8a8a86] uppercase font-semibold tracking-wider">
            Active Dataset
          </div>
          <div className="text-base font-bold text-white truncate" title={currentDataset?.filename}>
            {currentDataset?.filename || activeDatasetId}
          </div>
          <div className="text-xs text-[#7a7a75] font-mono">
            ID: {activeDatasetId?.slice(0, 16)}...
          </div>
        </div>
      </div>

      {/* Operation Log Timeline */}
      <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-white/[0.03] overflow-hidden">
        <div className="p-5 border-b border-[rgba(255,255,255,0.08)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HistoryIcon className="w-4 h-4 text-[#ff6a3d]" />
            <h2 className="text-base font-bold text-white">
              Chronological Audit Trail
            </h2>
          </div>
          <span className="text-xs text-[#8a8a86]">
            {entries.length > 20 ? `Showing last 20 of ${entries.length} operations` : `${entries.length} ${entries.length === 1 ? 'event' : 'events'} recorded`}
          </span>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <Loader2 className="w-7 h-7 text-[#ff6a3d] animate-spin" />
              <p className="text-xs text-[#8a8a86]">Loading audit history...</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="empty-state-card text-center py-16 space-y-4">
              <div className="empty-state-icon w-12 h-12 rounded-[14px] bg-white/5 text-[#8a8a86] mx-auto flex items-center justify-center border border-[rgba(255,255,255,0.08)]">
                <HistoryIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">
                  No Cleaning Operations Recorded
                </h3>
                <p className="text-xs text-[#8a8a86] max-w-md mx-auto mt-1">
                  When you preview and approve cleaning actions like filling missing values or removing duplicate rows, they will appear here in chronological order.
                </p>
              </div>
              <Link
                to={`/cleaning?id=${activeDatasetId || ''}`}
                className="btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold"
              >
                <span>Go to Cleaning Studio</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="relative pl-6 space-y-8 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-[rgba(255,255,255,0.08)]">
              {entries.slice(-20).map((entry, idx) => {
                const stepNumber = entries.indexOf(entry) + 1;
                return (
                  <div
                    key={idx}
                    onClick={() => handleGotoStep(stepNumber)}
                    className="relative group cursor-pointer"
                    title={`Click to jump to Step #${stepNumber}`}
                  >
                    {/* Timeline dot */}
                    <div className="absolute -left-6 top-1.5 w-6 h-6 rounded-full bg-[#0c0c0e] border-2 border-[#ff6a3d] flex items-center justify-center text-[10px] font-bold text-[#ff6a3d] shadow-md group-hover:scale-110 transition-all">
                      {stepNumber}
                    </div>

                    {/* Entry Card */}
                    <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-white/[0.02] p-5 hover:border-[#ff6a3d]/40 transition-all space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {renderOperationBadge(entry)}
                          <span className="text-xs font-mono text-[#8a8a86]">
                            {entry.operation}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-[#7a7a75]">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{formatTimestamp(entry.timestamp)}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs border-t border-[rgba(255,255,255,0.06)]">
                        {entry.column && (
                          <div>
                            <span className="text-[#8a8a86] block text-[11px] mb-0.5">
                              Target Column
                            </span>
                            <span className="font-semibold text-white font-mono bg-white/5 px-2 py-0.5 rounded border border-white/10">
                              {entry.column}
                            </span>
                          </div>
                        )}

                        {entry.method && (
                          <div>
                            <span className="text-[#8a8a86] block text-[11px] mb-0.5">
                              Method / Parameter
                            </span>
                            <span className="font-medium text-slate-200 capitalize">
                              {entry.method}
                            </span>
                          </div>
                        )}

                        <div>
                          <span className="text-[#8a8a86] block text-[11px] mb-0.5">
                            Impact
                          </span>
                          <span className="font-semibold text-emerald-400">
                            {entry.affected_rows.toLocaleString()} rows affected
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
