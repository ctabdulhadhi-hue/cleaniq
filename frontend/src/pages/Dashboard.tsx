import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  UploadCloud,
  CheckCircle2,
  XCircle,
  Database,
  ArrowRight,
  FileSpreadsheet,
  Trash2,
  Layers,
  AlertTriangle,
  Award,
} from 'lucide-react';
import {
  checkBackendHealth,
  getRecentDatasets,
  removeRecentDataset,
  getQualityScore,
  type HealthResponse,
  type RecentDataset,
  type QualityScoreResponse,
} from '../services/api';
import { TiltCard } from '../components/reactbits/TiltCard';
import { useCountUp } from '../hooks/useCountUp';

export function Dashboard() {
  const navigate = useNavigate();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loadingHealth, setLoadingHealth] = useState<boolean>(true);

  const [recentDatasets, setRecentDatasets] = useState<RecentDataset[]>([]);
  const [qualityData, setQualityData] = useState<QualityScoreResponse | null>(null);

  useEffect(() => {
    // Fetch backend health
    const fetchHealth = async () => {
      setLoadingHealth(true);
      try {
        const res = await checkBackendHealth();
        setHealth(res);
      } catch {
        setHealth(null);
      } finally {
        setLoadingHealth(false);
      }
    };

    fetchHealth();
    const datasets = getRecentDatasets();
    setRecentDatasets(datasets);

    if (datasets.length > 0) {
      getQualityScore(datasets[0].dataset_id)
        .then((q) => setQualityData(q))
        .catch(() => setQualityData(null));
    }
  }, []);

  const handleDeleteRecent = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeRecentDataset(id);
    setRecentDatasets(getRecentDatasets());
  };

  // Calculate KPIs
  const datasetsProcessedCount = Math.max(
    recentDatasets.length,
    health?.active_sessions ?? 0
  );

  const totalIssuesFound = recentDatasets.reduce((sum, d) => sum + (d.issues_found || 0), 0);

  // Animated KPI numbers counting up over ~0.6s on change
  const animatedDatasetsCount = useCountUp(datasetsProcessedCount);
  const animatedIssuesCount = useCountUp(totalIssuesFound);
  const animatedQualityScore = useCountUp(
    qualityData ? Number((qualityData.overall_score * 100).toFixed(1)) : 0,
    { decimals: 1 }
  );

  // Score color helper function (orange for high, amber for medium, red for low)
  const getScoreColorClass = (pct: number) => {
    if (pct >= 80) return 'bg-[#ff6a3d] text-[#ff6a3d]';
    if (pct >= 60) return 'bg-amber-400 text-amber-400';
    return 'bg-rose-500 text-rose-500';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Hero Welcome Card */}
      <div className="relative overflow-hidden rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-white/[0.03] p-8 sm:p-10">
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-[rgba(255,255,255,0.1)] text-[#f2f2f0] text-xs font-semibold">
            <img src="/logo-icon.svg" alt="CleanIQ" className="w-4 h-4 rounded object-contain" />
            <span>CleanIQ Controlled Data Engine</span>
          </div>
          <h1 className="animate-hero-blur-in text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Hello, <span className="text-[#ff6a3d]">CleanIQ</span>
          </h1>
          <p className="text-[#8a8a86] text-base leading-relaxed">
            Audit-ready data cleaning with zero silent mutations. Every transformation must be
            previewed and explicitly approved before being committed.
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-3">
            <Link
              to="/upload"
              className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload Dataset</span>
              <ArrowRight className="w-4 h-4 ml-0.5" />
            </Link>
            {recentDatasets.length > 0 && (
              <Link
                to={`/dataset?id=${recentDatasets[0].dataset_id}`}
                className="btn-secondary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
              >
                <Database className="w-4 h-4" />
                <span>Open Latest Dataset</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards: Datasets Processed, Issues Found, Quality Score */}
      <div>
        <h2 className="text-xs uppercase tracking-wider font-semibold text-[#8a8a86] mb-3">
          Platform Metrics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Datasets Processed */}
          <TiltCard
            tiltAmplitude={5}
            spotlightColor="rgba(255, 106, 61, 0.16)"
            className="kpi-card p-6 rounded-[14px] bg-white/[0.03] border border-[rgba(255,255,255,0.08)] space-y-3 cursor-default"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#8a8a86]">
                Datasets Processed
              </span>
              <div className="w-8 h-8 rounded-lg bg-white/5 text-[#f2f2f0] flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-white font-mono">
              {animatedDatasetsCount}
            </div>
            <p className="text-xs text-[#8a8a86]">
              {recentDatasets.length} cached locally · {health?.active_sessions ?? 0} active server session(s)
            </p>
          </TiltCard>

          {/* Issues Found */}
          <TiltCard
            tiltAmplitude={5}
            spotlightColor="rgba(251, 191, 36, 0.16)"
            className="kpi-card p-6 rounded-[14px] bg-white/[0.03] border border-[rgba(255,255,255,0.08)] space-y-3 cursor-default"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#8a8a86]">
                Issues Found
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-amber-400 font-mono">
              {animatedIssuesCount.toLocaleString()}
            </div>
            <p className="text-xs text-[#8a8a86]">
              Missing cells and duplicate rows across active datasets
            </p>
          </TiltCard>

          {/* Overall Quality Score (Orange Treatment with React Bits Tilt & Spotlight) */}
          <TiltCard
            tiltAmplitude={5}
            spotlightColor="rgba(255, 106, 61, 0.16)"
            className="kpi-card p-6 rounded-[14px] bg-white/[0.03] border border-[rgba(255,255,255,0.08)] border-t-2 border-t-[#ff6a3d] space-y-3 cursor-default"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#8a8a86]">
                Latest Dataset Quality
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#ff6a3d]/15 text-[#ff6a3d] flex items-center justify-center">
                <Award className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-[#ff6a3d] font-mono">
                {qualityData ? animatedQualityScore.toFixed(1) : 'N/A'}
              </span>
              <span className="text-xs text-[#ffb08a] font-mono">%</span>
              {qualityData && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#ff6a3d]/15 text-[#ffb08a] border border-[#ff6a3d]/25 font-semibold">
                  Live Audit
                </span>
              )}
            </div>
            <p className="text-xs text-[#8a8a86]">
              Weighted index: Completeness, Consistency, Validity, Uniqueness
            </p>
          </TiltCard>
        </div>
      </div>

      {/* Quality Score Breakdown Sub-Scores */}
      {qualityData && (
        <div className="p-6 rounded-[14px] bg-white/[0.03] border border-[rgba(255,255,255,0.08)] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-[#ff6a3d]" />
              Data Quality Dimensions Breakdown
            </h3>
            <span className="text-xs text-[#8a8a86]">Target dataset: <strong className="text-white">{recentDatasets[0]?.filename}</strong></span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {qualityData.sub_scores.map((sub) => {
              const pct = Number((sub.score * 100).toFixed(1));
              const colorClass = getScoreColorClass(pct);
              const barBg = colorClass.split(' ')[0];
              const textClr = colorClass.split(' ')[1];

              return (
                <TiltCard
                  key={sub.name}
                  tiltAmplitude={4}
                  spotlightColor="rgba(255, 106, 61, 0.14)"
                  className="kpi-card p-4 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)] space-y-2 cursor-default"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white capitalize">{sub.name}</span>
                    <span className={`font-bold font-mono ${textClr}`}>{pct}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barBg}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-[#8a8a86] line-clamp-1" title={sub.detail}>{sub.detail}</p>
                </TiltCard>
              );
            })}
          </div>
        </div>
      )}

      {/* Recently Uploaded Datasets */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Recent Datasets</h2>
            <p className="text-xs text-[#8a8a86]">
              Your active datasets stored in local session memory
            </p>
          </div>
          {recentDatasets.length > 0 && (
            <Link
              to="/upload"
              className="text-xs font-medium text-[#ff6a3d] hover:text-[#ff7b50] flex items-center gap-1"
            >
              <span>Upload another</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        {recentDatasets.length === 0 ? (
          <div className="empty-state-card rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-white/[0.03] p-10 text-center space-y-3">
            <FileSpreadsheet className="empty-state-icon w-10 h-10 text-[#8a8a86] mx-auto opacity-70" />
            <h3 className="text-sm font-semibold text-white">No Datasets Uploaded Yet</h3>
            <p className="text-xs text-[#8a8a86] max-w-sm mx-auto">
              Upload a CSV, TSV, or Excel spreadsheet to start inspecting profiling metrics and previewing rows.
            </p>
            <div className="pt-2">
              <Link
                to="/upload"
                className="btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload Dataset</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-white/[0.03] overflow-hidden">
            <div className="divide-y divide-[rgba(255,255,255,0.06)]">
              {recentDatasets.map((d) => (
                <div
                  key={d.dataset_id}
                  onClick={() => navigate(`/dataset?id=${d.dataset_id}`)}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.04] cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#ff6a3d]/10 border border-[#ff6a3d]/20 text-[#ff6a3d] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white truncate group-hover:text-[#ff6a3d] transition-colors">
                          {d.filename}
                        </h4>
                        {d.is_sample && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Sample
                          </span>
                        )}
                        <span className="font-mono text-[10px] text-[#8a8a86] px-1.5 py-0.2 rounded bg-white/5">
                          {d.dataset_id}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[#8a8a86] mt-1">
                        <span>{d.row_count?.toLocaleString() ?? 0} rows</span>
                        <span>·</span>
                        <span>{d.column_count ?? 0} columns</span>
                        <span>·</span>
                        <span>
                          {d.file_size_bytes
                            ? `${(d.file_size_bytes / 1024).toFixed(1)} KB`
                            : 'In-memory'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={(e) => handleDeleteRecent(e, d.dataset_id)}
                      title="Remove from recent list"
                      className="p-2 rounded-lg text-[#8a8a86] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.15)] hover:bg-white/5 text-slate-200 text-xs font-medium transition-colors">
                      <span>Explore</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Backend API Connectivity Status Banner */}
      <div className="p-4 rounded-[14px] bg-white/[0.03] border border-[rgba(255,255,255,0.08)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-[#f2f2f0] font-medium">FastAPI Local Engine</span>
        </div>
        <div className="text-xs text-[#8a8a86] flex items-center gap-2">
          {loadingHealth ? (
            <span>Connecting...</span>
          ) : health?.status === 'ok' ? (
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Online (v{health.version})
            </span>
          ) : (
            <span className="flex items-center gap-1 text-rose-400 font-medium">
              <XCircle className="w-3.5 h-3.5" /> Offline
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
