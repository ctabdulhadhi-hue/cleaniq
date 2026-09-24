import { useEffect, useState, useMemo } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCw,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import {
  getDatasetPreview,
  getOperationLog,
  type DatasetPreviewResponse,
  type OperationLogEntry,
} from '../services/api';

interface DataTableProps {
  datasetId: string;
  operationLog?: OperationLogEntry[];
  refreshKey?: number | string;
}

type SortDirection = 'asc' | 'desc' | null;

interface SortConfig {
  column: string | null;
  direction: SortDirection;
}

export function DataTable({ datasetId, operationLog, refreshKey }: DataTableProps) {
  const [data, setData] = useState<DatasetPreviewResponse | null>(null);
  const [page, setPage] = useState<number>(1);
  const [size, setSize] = useState<number>(50);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: null, direction: null });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [internalOpLog, setInternalOpLog] = useState<OperationLogEntry[]>([]);

  // Fetch operation log if not passed via props
  useEffect(() => {
    if (operationLog !== undefined) return;
    if (!datasetId) return;

    let cancelled = false;
    getOperationLog(datasetId)
      .then((res) => {
        if (!cancelled) setInternalOpLog(res.entries);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [datasetId, operationLog, refreshKey]);

  const effectiveOpLog = operationLog ?? internalOpLog;

  // Identify columns that were affected by recent cleaning operations
  const modifiedColumns = useMemo(() => {
    const cols = new Set<string>();
    effectiveOpLog.forEach((entry) => {
      if (entry.column) {
        cols.add(entry.column);
      }
    });
    return cols;
  }, [effectiveOpLog]);

  // Fetch paginated preview when datasetId, page, size, or refreshKey changes
  useEffect(() => {
    let cancelled = false;

    const fetchPreview = async () => {
      setLoading(true);
      setError(null);
      try {
        const preview = await getDatasetPreview(datasetId, page, size);
        if (!cancelled) {
          setData(preview);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load preview rows');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (datasetId) {
      fetchPreview();
    }

    return () => {
      cancelled = true;
    };
  }, [datasetId, page, size, refreshKey]);

  // Handle header click for sorting
  const handleSort = (column: string) => {
    setSortConfig((prev) => {
      if (prev.column !== column) {
        return { column, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { column, direction: 'desc' };
      }
      return { column: null, direction: null };
    });
  };

  // Filter and sort current page's rows
  const displayedRows = useMemo(() => {
    if (!data?.rows) return [];
    let rows = [...data.rows];

    // Search filter across all row fields
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter((row) =>
        Object.values(row).some((val) => {
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(q);
        }),
      );
    }

    // Column sort
    if (sortConfig.column && sortConfig.direction) {
      const col = sortConfig.column;
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        const valA = a[col];
        const valB = b[col];

        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;

        if (typeof valA === 'number' && typeof valB === 'number') {
          return (valA - valB) * dir;
        }
        return String(valA).localeCompare(String(valB)) * dir;
      });
    }

    return rows;
  }, [data, searchQuery, sortConfig]);

  const isMissingValue = (value: any) => value === null || value === undefined || value === '';

  const renderCellContent = (value: any, isModifiedCol: boolean) => {
    if (isMissingValue(value)) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/35 font-semibold italic">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          null
        </span>
      );
    }
    if (typeof value === 'boolean') {
      return value ? (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
          true
        </span>
      ) : (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-rose-500/15 text-rose-400 border border-rose-500/20">
          false
        </span>
      );
    }
    if (typeof value === 'number') {
      return (
        <span className={`font-mono tabular-nums ${isModifiedCol ? 'text-sky-300 font-semibold' : 'text-slate-200'}`}>
          {value.toLocaleString()}
        </span>
      );
    }
    return (
      <span className={`truncate max-w-xs block ${isModifiedCol ? 'text-sky-200 font-medium' : 'text-slate-300'}`}>
        {String(value)}
      </span>
    );
  };

  const startRow = data ? (data.page - 1) * data.size + 1 : 0;
  const endRow = data ? Math.min(data.page * data.size, data.total_rows) : 0;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md shadow-xl overflow-hidden flex flex-col">
      {/* Table Toolbar */}
      <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        {/* Search input & Cell highlighting legend */}
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[240px]">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search current page rows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-800/70 border border-slate-700/80 rounded-xl text-sm text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {/* Highlighting Legend */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px] font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Yellow: Missing</span>
            </div>
            {modifiedColumns.size > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/25 text-sky-300 text-[11px] font-medium">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                <span>Blue: Recently Modified ({modifiedColumns.size})</span>
              </div>
            )}
          </div>
        </div>

        {/* Controls: Page size & refresh */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Rows:</span>
            <select
              value={size}
              onChange={(e) => {
                setSize(Number(e.target.value));
                setPage(1);
              }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <button
            onClick={() => {
              // Trigger reload
              setPage((p) => p);
            }}
            disabled={loading}
            title="Refresh preview"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-500/10 border-b border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Table Container with virtualized scroll */}
      <div className="relative overflow-x-auto max-h-[580px] scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        <table className="w-full text-left text-xs border-collapse">
          {/* Sticky Header */}
          <thead className="bg-slate-950/90 backdrop-blur-md sticky top-0 z-10 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
            <tr>
              <th className="py-3 px-3 w-14 text-center border-r border-slate-800/60 font-mono text-[10px] text-slate-500">
                #
              </th>
              {data?.columns.map((col) => {
                const isSorted = sortConfig.column === col;
                return (
                  <th
                    key={col}
                    onClick={() => handleSort(col)}
                    className="py-3 px-4 font-semibold text-slate-300 hover:bg-slate-800/50 cursor-pointer select-none transition-colors border-r border-slate-800/40 last:border-r-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{col}</span>
                      <span className="text-slate-500">
                        {isSorted ? (
                          sortConfig.direction === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-indigo-400" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-indigo-400" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-30 hover:opacity-100" />
                        )}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-800/50">
            {loading && !data ? (
              // Loading skeleton
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="py-3 px-3 text-center">
                    <div className="h-3 w-6 bg-slate-800 rounded mx-auto" />
                  </td>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="py-3 px-4">
                      <div className="h-3 bg-slate-800/60 rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : displayedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={(data?.columns.length || 1) + 1}
                  className="py-16 text-center text-slate-500"
                >
                  <FileSpreadsheet className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-60" />
                  <p className="text-sm font-medium">No rows found</p>
                  <p className="text-xs mt-1">
                    {searchQuery ? 'Try clearing your search term' : 'This dataset page has no records.'}
                  </p>
                </td>
              </tr>
            ) : (
              displayedRows.map((row, idx) => {
                const rowIndex = startRow + idx;
                return (
                  <tr
                    key={idx}
                    className="hover:bg-indigo-950/15 transition-colors group"
                  >
                    <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-500 border-r border-slate-800/60 group-hover:text-slate-400">
                      {rowIndex}
                    </td>
                    {data?.columns.map((col) => {
                      const val = row[col];
                      const missing = isMissingValue(val);
                      const isModifiedCol = modifiedColumns.has(col);
                      return (
                        <td
                          key={col}
                          className={`py-2.5 px-4 border-r border-slate-800/40 last:border-r-0 transition-colors ${
                            missing
                              ? 'bg-amber-500/10'
                              : isModifiedCol
                              ? 'bg-sky-500/10 border-l border-l-sky-500/50'
                              : ''
                          }`}
                        >
                          {renderCellContent(val, isModifiedCol)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
        <div>
          {data ? (
            <span>
              Showing <span className="text-slate-200 font-semibold">{startRow}</span> to{' '}
              <span className="text-slate-200 font-semibold">{endRow}</span> of{' '}
              <span className="text-slate-200 font-semibold">{data.total_rows.toLocaleString()}</span> rows
              {searchQuery && (
                <span className="ml-2 text-indigo-400">
                  (filtered {displayedRows.length} on current page)
                </span>
              )}
            </span>
          ) : (
            <span>Loading rows...</span>
          )}
        </div>

        {/* Page navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={!data?.has_prev || loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 border border-slate-700 text-slate-300 font-medium transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>

          <span className="px-3 py-1.5 text-xs text-slate-300 font-medium">
            Page {data?.page ?? 1} of {data?.total_pages ?? 1}
          </span>

          <button
            onClick={() => setPage((p) => Math.min(data?.total_pages || 1, p + 1))}
            disabled={!data?.has_next || loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 border border-slate-700 text-slate-300 font-medium transition-colors"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
