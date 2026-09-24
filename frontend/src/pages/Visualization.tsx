import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  BarChart3,
  Database,
  UploadCloud,
  Loader2,
  AlertTriangle,
  ChevronDown,
  Activity,
  Sparkles,
  Grid,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  getColumnStats,
  getRecentDatasets,
  getHistogramData,
  getBoxPlotData,
  getScatterData,
  getCorrelationData,
  type ColumnStatsResponse,
  type RecentDataset,
  type HistogramResponse,
  type BoxPlotResponse,
  type ScatterResponse,
  type CorrelationResponse,
} from '../services/api';

const COLORS = ['#ff6a3d', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ff8f66', '#14b8a6'];

export function Visualization() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryId = searchParams.get('id');

  const [recentDatasets, setRecentDatasets] = useState<RecentDataset[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(queryId);

  const [stats, setStats] = useState<ColumnStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected state for visualizations
  const [primaryColumn, setPrimaryColumn] = useState<string>('');
  const [secondaryColumn, setSecondaryColumn] = useState<string>('');
  const [chartType, setChartType] = useState<string>('histogram');

  // Chart data states
  const [histogramData, setHistogramData] = useState<HistogramResponse | null>(null);
  const [boxPlotData, setBoxPlotData] = useState<BoxPlotResponse | null>(null);
  const [scatterData, setScatterData] = useState<ScatterResponse | null>(null);
  const [correlationData, setCorrelationData] = useState<CorrelationResponse | null>(null);

  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  useEffect(() => {
    const list = getRecentDatasets();
    setRecentDatasets(list);
    if (!queryId && list.length > 0) {
      setActiveDatasetId(list[0].dataset_id);
      setSearchParams({ id: list[0].dataset_id });
    }
  }, [queryId, setSearchParams]);

  useEffect(() => {
    if (!activeDatasetId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getColumnStats(activeDatasetId);
        if (!cancelled) {
          setStats(data);
          if (data.columns.length > 0) {
            setPrimaryColumn(data.columns[0].name);
            if (data.columns.length > 1) {
              setSecondaryColumn(data.columns[1].name);
            }
          }
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeDatasetId]);

  // Handle Chart Generation
  const fetchChartData = async () => {
    if (!activeDatasetId || !primaryColumn) return;
    setChartLoading(true);
    setChartError(null);

    try {
      if (chartType === 'histogram') {
        const data = await getHistogramData(activeDatasetId, primaryColumn);
        setHistogramData(data);
      } else if (chartType === 'boxplot') {
        const data = await getBoxPlotData(activeDatasetId, primaryColumn);
        setBoxPlotData(data);
      } else if (chartType === 'scatter') {
        if (!secondaryColumn) throw new Error('Please select a secondary numerical column for Scatter Plot.');
        const data = await getScatterData(activeDatasetId, primaryColumn, secondaryColumn);
        setScatterData(data);
      } else if (chartType === 'correlation') {
        const data = await getCorrelationData(activeDatasetId);
        setCorrelationData(data);
      }
    } catch (err: any) {
      setChartError(err.message || 'Failed to generate chart data');
    } finally {
      setChartLoading(false);
    }
  };

  useEffect(() => {
    if (stats && primaryColumn) {
      fetchChartData();
    }
  }, [primaryColumn, chartType, activeDatasetId]);

  const handleSelectDataset = (id: string) => {
    setActiveDatasetId(id);
    setSearchParams({ id });
  };

  const selectedStat = stats?.columns.find((c) => c.name === primaryColumn);
  const numericColumns = stats?.columns.filter((c) => c.type === 'numerical') || [];

  if (!activeDatasetId && recentDatasets.length === 0) {
    return (
      <div className="empty-state-card max-w-4xl mx-auto py-12 text-center space-y-5">
        <div className="empty-state-icon w-16 h-16 rounded-[14px] bg-[#ff6a3d]/10 text-[#ff6a3d] mx-auto flex items-center justify-center border border-[#ff6a3d]/25">
          <Database className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white">No Dataset Loaded</h2>
        <p className="text-sm text-[#8a8a86] max-w-sm mx-auto">Upload a dataset to visualize column distributions.</p>
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
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#ff6a3d] font-semibold mb-1">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Interactive Analytics</span>
          </div>
          <h1 className="animate-hero-blur-in text-3xl font-extrabold text-white tracking-tight">Data Visualization</h1>
        </div>

        {/* Dataset Selector */}
        {recentDatasets.length > 0 && (
          <div className="relative">
            <select
              value={activeDatasetId || ''}
              onChange={(e) => handleSelectDataset(e.target.value)}
              className="appearance-none bg-white/[0.03] border border-[rgba(255,255,255,0.08)] hover:border-[#ff6a3d]/50 text-[#f2f2f0] text-sm font-medium rounded-xl px-4 py-2.5 pr-10 focus:outline-none transition-all cursor-pointer"
            >
              {recentDatasets.map((d) => (
                <option key={d.dataset_id} value={d.dataset_id} className="bg-[#0c0c0e]">
                  {d.filename} ({d.row_count.toLocaleString()} rows)
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-[#8a8a86] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-20 text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#ff6a3d] mx-auto" />
          <p className="text-sm text-[#8a8a86]">Loading dataset column profile & metrics...</p>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : stats ? (
        <div className="space-y-8">
          {/* Controls Panel */}
          <div className="p-6 rounded-[14px] bg-white/[0.03] border border-[rgba(255,255,255,0.08)] space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(255,255,255,0.08)] pb-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Sparkles className="w-4 h-4 text-[#ff6a3d]" />
                <span>Chart Configuration</span>
              </div>
              <button
                onClick={fetchChartData}
                disabled={chartLoading}
                className="px-4 py-2 rounded-xl bg-[#ff6a3d] hover:bg-[#ff7b50] text-[#0c0c0e] font-semibold text-sm transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {chartLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                <span>Generate Chart</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Primary Column Picker */}
              <div>
                <label className="block text-xs font-semibold text-[#8a8a86] uppercase tracking-wider mb-2">
                  Primary Column
                </label>
                <select
                  value={primaryColumn}
                  onChange={(e) => setPrimaryColumn(e.target.value)}
                  className="w-full bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#ff6a3d] transition-all"
                >
                  {stats.columns.map((col) => (
                    <option key={col.name} value={col.name} className="bg-[#0c0c0e]">
                      {col.name} ({col.type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Chart Type Picker */}
              <div>
                <label className="block text-xs font-semibold text-[#8a8a86] uppercase tracking-wider mb-2">
                  Chart Type
                </label>
                <select
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value)}
                  className="w-full bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#ff6a3d] transition-all"
                >
                  <optgroup label="Numerical Analysis" className="bg-[#0c0c0e]">
                    <option value="histogram">Histogram (Distribution)</option>
                    <option value="boxplot">Box Plot (Quartiles & Outliers)</option>
                    <option value="scatter">Scatter Plot (X vs Y)</option>
                  </optgroup>
                  <optgroup label="Categorical & Frequency" className="bg-[#0c0c0e]">
                    <option value="bar">Bar Chart (Frequencies)</option>
                    <option value="pie">Pie Chart (Distribution)</option>
                    <option value="line">Line Chart (Trend / Time Series)</option>
                  </optgroup>
                  <optgroup label="Multi-Column Analysis" className="bg-[#0c0c0e]">
                    <option value="correlation">Correlation Matrix Heatmap</option>
                  </optgroup>
                </select>
              </div>

              {/* Secondary Column Picker (Scatter Only) */}
              <div>
                <label className="block text-xs font-semibold text-[#8a8a86] uppercase tracking-wider mb-2">
                  Secondary Column (Scatter Plot X/Y)
                </label>
                <select
                  value={secondaryColumn}
                  disabled={chartType !== 'scatter'}
                  onChange={(e) => setSecondaryColumn(e.target.value)}
                  className="w-full bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#ff6a3d] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="" className="bg-[#0c0c0e]">Select Secondary Numeric Column...</option>
                  {numericColumns.map((col) => (
                    <option key={col.name} value={col.name} className="bg-[#0c0c0e]">
                      {col.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Chart Display Area */}
          <div className="p-6 rounded-[14px] bg-white/[0.03] border border-[rgba(255,255,255,0.08)] min-h-[420px] flex flex-col justify-center">
            {chartLoading ? (
              <div className="py-20 text-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-[#ff6a3d] mx-auto" />
                <p className="text-sm text-[#8a8a86]">Computing visualization data...</p>
              </div>
            ) : chartError ? (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center justify-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>{chartError}</span>
              </div>
            ) : (
              <div>
                {/* 1. HISTOGRAM */}
                {chartType === 'histogram' && histogramData && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-sm text-[#8a8a86]">
                      <span>Histogram Distribution for <strong className="text-white">{primaryColumn}</strong></span>
                      {histogramData.mean_val !== undefined && (
                        <span>Mean: <strong className="text-[#ff6a3d]">{histogramData.mean_val}</strong></span>
                      )}
                    </div>
                    <div className="h-[350px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={histogramData.buckets}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" opacity={0.5} />
                          <XAxis dataKey="label" stroke="#8a8a86" fontSize={12} />
                          <YAxis stroke="#8a8a86" fontSize={12} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0c0c0e', borderColor: 'rgba(255,255,255,0.15)', borderRadius: '12px', color: '#fff' }}
                          />
                          <Bar dataKey="count" fill="#ff6a3d" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* 2. BOX PLOT */}
                {chartType === 'boxplot' && boxPlotData && (
                  <div className="space-y-6">
                    <div className="text-sm text-[#8a8a86]">
                      Box Plot Summary for <strong className="text-white">{primaryColumn}</strong>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
                      <div className="p-3 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)]">
                        <div className="text-xs text-[#8a8a86]">Min</div>
                        <div className="text-base font-bold text-white">{boxPlotData.min_val}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)]">
                        <div className="text-xs text-[#8a8a86]">Q1 (25%)</div>
                        <div className="text-base font-bold text-[#ffb08a]">{boxPlotData.q1}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)]">
                        <div className="text-xs text-[#8a8a86]">Median (50%)</div>
                        <div className="text-base font-bold text-emerald-400">{boxPlotData.median}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)]">
                        <div className="text-xs text-[#8a8a86]">Q3 (75%)</div>
                        <div className="text-base font-bold text-[#ffb08a]">{boxPlotData.q3}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)]">
                        <div className="text-xs text-[#8a8a86]">Max</div>
                        <div className="text-base font-bold text-white">{boxPlotData.max_val}</div>
                      </div>
                    </div>

                    <div className="p-6 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)] space-y-3">
                      <div className="text-xs font-semibold text-[#8a8a86]">Interquartile Range & Bounds</div>
                      <div className="flex items-center gap-3 text-xs text-slate-300">
                        <span>Lower Whisker: <strong>{boxPlotData.whisker_low}</strong></span>
                        <span className="text-[#8a8a86]">|</span>
                        <span>Upper Whisker: <strong>{boxPlotData.whisker_high}</strong></span>
                        <span className="text-[#8a8a86]">|</span>
                        <span>Flagged Outliers: <strong className="text-rose-400">{boxPlotData.outliers.length}</strong></span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. SCATTER PLOT */}
                {chartType === 'scatter' && scatterData && (
                  <div className="space-y-4">
                    <div className="text-sm text-[#8a8a86]">
                      Scatter Plot: <strong className="text-white">{scatterData.x_column}</strong> vs{' '}
                      <strong className="text-white">{scatterData.y_column}</strong> ({scatterData.total_points} points)
                    </div>
                    <div className="h-[350px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" opacity={0.5} />
                          <XAxis dataKey="x" name={scatterData.x_column} stroke="#8a8a86" fontSize={12} />
                          <YAxis dataKey="y" name={scatterData.y_column} stroke="#8a8a86" fontSize={12} />
                          <Tooltip
                            cursor={{ strokeDasharray: '3 3' }}
                            contentStyle={{ backgroundColor: '#0c0c0e', borderColor: 'rgba(255,255,255,0.15)', borderRadius: '12px', color: '#fff' }}
                          />
                          <Scatter name="Data Points" data={scatterData.data} fill="#ff6a3d" />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* 4. CATEGORICAL BAR / PIE / LINE */}
                {(chartType === 'bar' || chartType === 'pie' || chartType === 'line') && selectedStat && selectedStat.top_values && (
                  <div className="space-y-4">
                    <div className="text-sm text-[#8a8a86]">
                      Values Trend & Distribution for <strong className="text-white">{primaryColumn}</strong>
                    </div>
                    <div className="h-[350px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        {chartType === 'bar' ? (
                          <BarChart data={selectedStat.top_values}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" opacity={0.5} />
                            <XAxis dataKey="value" stroke="#8a8a86" fontSize={12} />
                            <YAxis stroke="#8a8a86" fontSize={12} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0c0c0e', borderColor: 'rgba(255,255,255,0.15)', borderRadius: '12px', color: '#fff' }}
                            />
                            <Bar dataKey="count" fill="#ff6a3d" radius={[6, 6, 0, 0]}>
                              {selectedStat.top_values.map((_, idx) => (
                                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        ) : chartType === 'pie' ? (
                          <PieChart>
                            <Pie
                              data={selectedStat.top_values}
                              dataKey="count"
                              nameKey="value"
                              cx="50%"
                              cy="50%"
                              outerRadius={120}
                              label={({ value }) => String(value)}
                            >
                              {selectedStat.top_values.map((_, idx) => (
                                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0c0c0e', borderColor: 'rgba(255,255,255,0.15)', borderRadius: '12px', color: '#fff' }}
                            />
                            <Legend />
                          </PieChart>
                        ) : (
                          <LineChart data={selectedStat.top_values}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" opacity={0.5} />
                            <XAxis dataKey="value" stroke="#8a8a86" fontSize={12} />
                            <YAxis stroke="#8a8a86" fontSize={12} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0c0c0e', borderColor: 'rgba(255,255,255,0.15)', borderRadius: '12px', color: '#fff' }}
                            />
                            <Line type="monotone" dataKey="count" stroke="#ff6a3d" strokeWidth={3} dot={{ fill: '#ff6a3d', r: 5 }} />
                          </LineChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* 5. CORRELATION MATRIX HEATMAP */}
                {chartType === 'correlation' && correlationData && (
                  <div className="space-y-4">
                    <div className="text-sm text-[#8a8a86]">
                      Pairwise Pearson Correlation Matrix ({correlationData.columns.length} numeric columns)
                    </div>

                    {correlationData.columns.length < 2 ? (
                      <div className="p-8 text-center text-[#8a8a86] text-sm">
                        At least 2 numerical columns are required to compute correlation matrix.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead>
                            <tr className="border-b border-[rgba(255,255,255,0.08)]">
                              <th className="p-3 text-[#8a8a86] font-semibold">Column</th>
                              {correlationData.columns.map((c) => (
                                <th key={c} className="p-3 text-slate-300 font-semibold text-center">
                                  {c}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {correlationData.columns.map((rowCol) => (
                              <tr key={rowCol} className="border-b border-[rgba(255,255,255,0.05)]">
                                <td className="p-3 font-semibold text-slate-200">{rowCol}</td>
                                {correlationData.columns.map((colCol) => {
                                  const pair = correlationData.data.find(
                                    (p) => p.x === rowCol && p.y === colCol
                                  );
                                  const val = pair?.value ?? 0;
                                  const isSelf = rowCol === colCol;
                                  const bgOpacity = Math.abs(val);

                                  return (
                                    <td
                                      key={colCol}
                                      className={`p-3 text-center font-mono text-xs ${
                                        isSelf
                                          ? 'bg-white/10 text-white font-bold'
                                          : val > 0
                                          ? 'text-[#ffb08a]'
                                          : 'text-rose-400'
                                      }`}
                                      style={{
                                        backgroundColor: isSelf
                                          ? undefined
                                          : val > 0
                                          ? `rgba(255, 106, 61, ${bgOpacity * 0.3})`
                                          : `rgba(244, 63, 94, ${bgOpacity * 0.3})`,
                                      }}
                                    >
                                      {val.toFixed(2)}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Missing Values Heatmap / Distribution Overview */}
          <div className="p-6 rounded-[14px] bg-white/[0.03] border border-[rgba(255,255,255,0.08)] space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Grid className="w-4 h-4 text-[#ff6a3d]" />
              <span>Missing Values Overview Across All Columns</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.columns.map((col) => (
                <div key={col.name} className="p-4 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white truncate max-w-[150px]">{col.name}</span>
                    <span className="text-[#8a8a86]">{col.missing_percentage.toFixed(1)}% missing</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        col.missing_percentage > 20
                          ? 'bg-rose-500'
                          : col.missing_percentage > 0
                          ? 'bg-amber-400'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.max(col.missing_percentage, 2)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
