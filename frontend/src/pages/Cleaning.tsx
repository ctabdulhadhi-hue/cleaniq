import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Wand2,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Database,
  UploadCloud,
  Copy,
  Trash2,
  Loader2,
  Undo2,
  ChevronDown,
  Binary,
  Type,
  Columns,
  Sparkles,
  Calculator,
  ArrowRightLeft,
  Search,
  ArrowUp,
  ArrowDown,
  Bot,
  Lightbulb,
  X,
  Zap,
  Check,
} from 'lucide-react';
import {
  getDatasetProfile,
  cleanMissing,
  cleanDuplicates,
  getOperationLog,
  rollbackLastOperation,
  getRecentDatasets,
  getTypeSuggestions,
  convertColumnType,
  transformText,
  getCategoryClusters,
  standardizeCategories,
  renameColumn,
  deleteColumn,
  reorderColumns,
  createCalculatedColumn,
  detectOutliers,
  handleOutliers,
  analyzeDatasetWithAI,
  type DatasetProfileResponse,
  type CleanOperationResponse,
  type OperationLogEntry,
  type RecentDataset,
  type TypeSuggestion,
  type ClusterProposal,
  type OutlierDetectResponse,
  type AIAnalysisResponse,
  type AIRecommendationItem,
} from '../services/api';
import { DataTable } from '../components/DataTable';

type FillMethod = 'remove' | 'mean' | 'median' | 'mode' | 'custom';
type StudioTab =
  | 'nulls-duplicates'
  | 'type-conversion'
  | 'text-cleaning'
  | 'column-management'
  | 'outliers';

export function Cleaning() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryId = searchParams.get('id');

  const [activeTab, setActiveTab] = useState<StudioTab>('nulls-duplicates');
  const [recentDatasets] = useState<RecentDataset[]>(() => getRecentDatasets());
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(() => {
    if (queryId) return queryId;
    const initialList = getRecentDatasets();
    return initialList.length > 0 ? initialList[0].dataset_id : null;
  });

  const [profile, setProfile] = useState<DatasetProfileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Missing values state
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [fillMethod, setFillMethod] = useState<FillMethod>('mean');
  const [customValue, setCustomValue] = useState('');
  const [missingPreview, setMissingPreview] = useState<CleanOperationResponse | null>(null);
  const [missingLoading, setMissingLoading] = useState(false);
  const [missingApplying, setMissingApplying] = useState(false);
  const [missingResult, setMissingResult] = useState<string | null>(null);

  // Duplicates state
  const [dupPreview, setDupPreview] = useState<CleanOperationResponse | null>(null);
  const [dupApplying, setDupApplying] = useState(false);
  const [dupResult, setDupResult] = useState<string | null>(null);

  // Operation log
  const [opLog, setOpLog] = useState<OperationLogEntry[]>([]);

  // ─── Module 1: Type Conversion State ──────────────────────────────────────
  const [typeSuggestions, setTypeSuggestions] = useState<TypeSuggestion[]>([]);
  const [selectedTypeCol, setSelectedTypeCol] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<string>('integer');
  const [dateFormat, setDateFormat] = useState<string>('');
  const [typePreview, setTypePreview] = useState<CleanOperationResponse | null>(null);
  const [typeOperating, setTypeOperating] = useState(false);
  const [typeResult, setTypeResult] = useState<string | null>(null);

  // ─── Module 2: Text Cleaning & Standardization State ─────────────────────
  const [textCol, setTextCol] = useState<string | null>(null);
  const [textOp, setTextOp] = useState<'trim' | 'case' | 'remove_special' | 'find_replace'>('trim');
  const [caseType, setCaseType] = useState<'lower' | 'upper' | 'title'>('lower');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [textPreview, setTextPreview] = useState<CleanOperationResponse | null>(null);
  const [textOperating, setTextOperating] = useState(false);
  const [textResult, setTextResult] = useState<string | null>(null);

  // Near-duplicate clustering state
  const [clusterCol, setClusterCol] = useState<string | null>(null);
  const [clusters, setClusters] = useState<ClusterProposal[]>([]);
  const [clustersLoading, setClustersLoading] = useState(false);
  const [selectedMerges, setSelectedMerges] = useState<Record<string, boolean>>({});
  const [standardizePreview, setStandardizePreview] = useState<CleanOperationResponse | null>(null);
  const [standardizeOperating, setStandardizeOperating] = useState(false);
  const [standardizeResult, setStandardizeResult] = useState<string | null>(null);

  // ─── Module 3: Column Management State ────────────────────────────────────
  const [colRenameOld, setColRenameOld] = useState<string>('');
  const [colRenameNew, setColRenameNew] = useState<string>('');
  const [colDeleteTarget, setColDeleteTarget] = useState<string>('');
  const [colOrderList, setColOrderList] = useState<string[]>([]);
  const [colMgmtPreview, setColMgmtPreview] = useState<CleanOperationResponse | null>(null);
  const [colMgmtOperating, setColMgmtOperating] = useState(false);
  const [colMgmtResult, setColMgmtResult] = useState<string | null>(null);

  // Calculated column state
  const [calcColName, setCalcColName] = useState('');
  const [calcExpression, setCalcExpression] = useState('');
  const [calcPreview, setCalcPreview] = useState<CleanOperationResponse | null>(null);
  const [calcOperating, setCalcOperating] = useState(false);
  const [calcResult, setCalcResult] = useState<string | null>(null);

  // ─── Module 4: Outlier Detection State ────────────────────────────────────
  const [outlierCol, setOutlierCol] = useState<string | null>(null);
  const [outlierMethod, setOutlierMethod] = useState<'iqr' | 'zscore'>('iqr');
  const [outlierMultiplier, setOutlierMultiplier] = useState<number>(1.5);
  const [outlierZscoreThreshold, setOutlierZscoreThreshold] = useState<number>(3.0);
  const [outlierAction, setOutlierAction] = useState<'remove' | 'cap' | 'keep'>('remove');
  const [outlierDetectRes, setOutlierDetectRes] = useState<OutlierDetectResponse | null>(null);
  const [outlierPreview, setOutlierPreview] = useState<CleanOperationResponse | null>(null);
  const [outlierDetecting, setOutlierDetecting] = useState(false);
  const [outlierApplying, setOutlierApplying] = useState(false);
  const [outlierResult, setOutlierResult] = useState<string | null>(null);

  // ─── Module 10: AI Dataset Analysis State ─────────────────────────
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<AIAnalysisResponse | null>(null);
  const [ignoredRecIds, setIgnoredRecIds] = useState<number[]>([]);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  const handleAnalyzeWithAI = async () => {
    if (!activeDatasetId) return;
    setAiLoading(true);
    setAiError(null);
    setShowAiModal(true);
    try {
      const res = await analyzeDatasetWithAI(activeDatasetId);
      setAiResponse(res);
    } catch (err: any) {
      setAiError(err.message || 'AI Analysis failed');
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyAiRecommendation = (rec: AIRecommendationItem) => {
    const { action_type, action_params, target_column } = rec;

    if (action_type === 'clean_missing') {
      setActiveTab('nulls-duplicates');
      if (target_column) setSelectedColumn(target_column);
      if (action_params?.strategy) {
        setFillMethod(action_params.strategy as FillMethod);
      }
    } else if (action_type === 'clean_duplicates') {
      setActiveTab('nulls-duplicates');
    } else if (action_type === 'convert_type') {
      setActiveTab('type-conversion');
      if (action_params?.column) setSelectedTypeCol(action_params.column);
      if (action_params?.target_type) setTargetType(action_params.target_type);
    } else if (action_type === 'outlier_handle') {
      setActiveTab('outliers');
      if (action_params?.column) setOutlierCol(action_params.column);
      if (action_params?.method) setOutlierMethod(action_params.method);
      if (action_params?.action) setOutlierAction(action_params.action);
      if (action_params?.multiplier) setOutlierMultiplier(action_params.multiplier);
    } else if (action_type === 'standardize_values') {
      setActiveTab('text-cleaning');
      if (action_params?.column) setClusterCol(action_params.column);
    } else if (action_type === 'text_transform') {
      setActiveTab('text-cleaning');
      if (action_params?.column) setTextCol(action_params.column);
    }

    setIgnoredRecIds((prev) => [...prev, rec.id]);
    setShowAiModal(false);
    setAiNotice(
      `✨ AI pre-filled parameters for "${rec.target_column || 'dataset'}". Review and click Preview/Apply below to confirm.`
    );
  };

  const handleIgnoreAiRecommendation = (id: number) => {
    setIgnoredRecIds((prev) => [...prev, id]);
  };

  const handleDetectOutliers = async () => {
    if (!activeDatasetId || !outlierCol) return;
    setOutlierDetecting(true);
    setOutlierResult(null);
    setOutlierPreview(null);
    try {
      const res = await detectOutliers(activeDatasetId, {
        column: outlierCol,
        method: outlierMethod,
        multiplier: outlierMultiplier,
        zscore_threshold: outlierZscoreThreshold,
      });
      setOutlierDetectRes(res);
    } catch (err: any) {
      setError(err.message || 'Outlier detection failed');
    } finally {
      setOutlierDetecting(false);
    }
  };

  const handleOutlierAction = async (previewMode: boolean) => {
    if (!activeDatasetId || !outlierCol) return;
    setOutlierApplying(true);
    setError(null);
    try {
      const res = await handleOutliers(
        activeDatasetId,
        {
          column: outlierCol,
          method: outlierMethod,
          action: outlierAction,
          multiplier: outlierMultiplier,
          zscore_threshold: outlierZscoreThreshold,
        },
        previewMode
      );
      if (previewMode) {
        setOutlierPreview(res);
      } else {
        setOutlierPreview(null);
        setOutlierResult(res.after_summary);
        const fresh = await getDatasetProfile(activeDatasetId);
        setProfile(fresh);
        const logs = await getOperationLog(activeDatasetId);
        setOpLog(logs.entries);
        setOutlierDetectRes(null);
      }
    } catch (err: any) {
      setError(err.message || 'Outlier handling failed');
    } finally {
      setOutlierApplying(false);
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

  // Load profile + dup preview + op log + suggestions when dataset changes
  useEffect(() => {
    if (!activeDatasetId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setMissingPreview(null);
      setMissingResult(null);
      setDupPreview(null);
      setDupResult(null);
      setSelectedColumn(null);
      setTypePreview(null);
      setTextPreview(null);
      setStandardizePreview(null);
      setCalcPreview(null);

      try {
        const [profileData, dupData, logData, typeData] = await Promise.all([
          getDatasetProfile(activeDatasetId),
          cleanDuplicates(activeDatasetId, true),
          getOperationLog(activeDatasetId),
          getTypeSuggestions(activeDatasetId).catch(() => ({ dataset_id: activeDatasetId, suggestions: [] })),
        ]);
        if (!cancelled) {
          setProfile(profileData);
          setDupPreview(dupData);
          setOpLog(logData.entries);
          setTypeSuggestions(typeData.suggestions);
          setColOrderList(profileData.columns.map((c) => c.name));
          if (profileData.columns.length > 0) {
            setSelectedTypeCol(profileData.columns[0].name);
            setTextCol(profileData.columns[0].name);
            setClusterCol(profileData.columns[0].name);
            setColRenameOld(profileData.columns[0].name);
            setColDeleteTarget(profileData.columns[0].name);
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

  const handleSelectDataset = (id: string) => {
    setActiveDatasetId(id);
    setSearchParams({ id });
  };

  // Refresh dataset and logs
  const refreshAll = async () => {
    if (!activeDatasetId) return;
    try {
      const [profileData, dupData, logData, typeData] = await Promise.all([
        getDatasetProfile(activeDatasetId),
        cleanDuplicates(activeDatasetId, true),
        getOperationLog(activeDatasetId),
        getTypeSuggestions(activeDatasetId).catch(() => ({ dataset_id: activeDatasetId, suggestions: [] })),
      ]);
      setProfile(profileData);
      setDupPreview(dupData);
      setOpLog(logData.entries);
      setTypeSuggestions(typeData.suggestions);
      setColOrderList(profileData.columns.map((c) => c.name));
    } catch {
      // silently fail refresh
    }
  };

  // ─── Missing Values Actions ──────────────────────────────────────────────

  const handlePreviewMissing = async () => {
    if (!activeDatasetId || !selectedColumn) return;
    setMissingLoading(true);
    setMissingPreview(null);
    setMissingResult(null);
    try {
      const val = fillMethod === 'custom' ? customValue : undefined;
      const result = await cleanMissing(activeDatasetId, selectedColumn, fillMethod, val, true);
      setMissingPreview(result);
    } catch (err: any) {
      setMissingResult(`Error: ${err.message}`);
    } finally {
      setMissingLoading(false);
    }
  };

  const handleApplyMissing = async () => {
    if (!activeDatasetId || !selectedColumn) return;
    setMissingApplying(true);
    try {
      const val = fillMethod === 'custom' ? customValue : undefined;
      const result = await cleanMissing(activeDatasetId, selectedColumn, fillMethod, val, false);
      setMissingResult(`✅ Applied: ${result.after_summary}`);
      setMissingPreview(null);
      await refreshAll();
    } catch (err: any) {
      setMissingResult(`❌ Failed: ${err.message}`);
    } finally {
      setMissingApplying(false);
    }
  };

  // ─── Duplicates Actions ──────────────────────────────────────────────────

  const handleApplyDuplicates = async () => {
    if (!activeDatasetId) return;
    setDupApplying(true);
    try {
      const result = await cleanDuplicates(activeDatasetId, false);
      setDupResult(`✅ ${result.after_summary}`);
      setDupPreview(null);
      await refreshAll();
    } catch (err: any) {
      setDupResult(`❌ Failed: ${err.message}`);
    } finally {
      setDupApplying(false);
    }
  };

  // ─── Module 1: Type Conversion Actions ───────────────────────────────────

  const handlePreviewTypeConversion = async () => {
    if (!activeDatasetId || !selectedTypeCol) return;
    setTypeOperating(true);
    setTypePreview(null);
    setTypeResult(null);
    try {
      const result = await convertColumnType(
        activeDatasetId,
        {
          column: selectedTypeCol,
          target_type: targetType,
          date_format: dateFormat.trim() || undefined,
        },
        true,
      );
      setTypePreview(result);
    } catch (err: any) {
      setTypeResult(`❌ Error: ${err.message}`);
    } finally {
      setTypeOperating(false);
    }
  };

  const handleApplyTypeConversion = async () => {
    if (!activeDatasetId || !selectedTypeCol) return;
    setTypeOperating(true);
    try {
      const result = await convertColumnType(
        activeDatasetId,
        {
          column: selectedTypeCol,
          target_type: targetType,
          date_format: dateFormat.trim() || undefined,
        },
        false,
      );
      setTypeResult(`✅ Applied: ${result.after_summary}`);
      setTypePreview(null);
      await refreshAll();
    } catch (err: any) {
      setTypeResult(`❌ Failed: ${err.message}`);
    } finally {
      setTypeOperating(false);
    }
  };

  // ─── Module 2: Text Cleaning & Standardization Actions ───────────────────

  const handlePreviewTextTransform = async () => {
    if (!activeDatasetId || !textCol) return;
    setTextOperating(true);
    setTextPreview(null);
    setTextResult(null);
    try {
      const result = await transformText(
        activeDatasetId,
        {
          column: textCol,
          operation: textOp,
          case_type: textOp === 'case' ? caseType : undefined,
          find_text: textOp === 'find_replace' ? findText : undefined,
          replace_text: textOp === 'find_replace' ? replaceText : undefined,
          regex: useRegex,
        },
        true,
      );
      setTextPreview(result);
    } catch (err: any) {
      setTextResult(`❌ Error: ${err.message}`);
    } finally {
      setTextOperating(false);
    }
  };

  const handleApplyTextTransform = async () => {
    if (!activeDatasetId || !textCol) return;
    setTextOperating(true);
    try {
      const result = await transformText(
        activeDatasetId,
        {
          column: textCol,
          operation: textOp,
          case_type: textOp === 'case' ? caseType : undefined,
          find_text: textOp === 'find_replace' ? findText : undefined,
          replace_text: textOp === 'find_replace' ? replaceText : undefined,
          regex: useRegex,
        },
        false,
      );
      setTextResult(`✅ Applied: ${result.after_summary}`);
      setTextPreview(null);
      await refreshAll();
    } catch (err: any) {
      setTextResult(`❌ Failed: ${err.message}`);
    } finally {
      setTextOperating(false);
    }
  };

  const handleFetchClusters = async () => {
    if (!activeDatasetId || !clusterCol) return;
    setClustersLoading(true);
    setStandardizePreview(null);
    setStandardizeResult(null);
    try {
      const res = await getCategoryClusters(activeDatasetId, clusterCol, 0.85);
      setClusters(res.clusters);
      const initialSelected: Record<string, boolean> = {};
      res.clusters.forEach((c) => {
        initialSelected[c.canonical] = true;
      });
      setSelectedMerges(initialSelected);
      if (res.clusters.length === 0) {
        setStandardizeResult('No near-duplicate category clusters found in this column.');
      }
    } catch (err: any) {
      setStandardizeResult(`❌ Error: ${err.message}`);
    } finally {
      setClustersLoading(false);
    }
  };

  const handlePreviewStandardize = async () => {
    if (!activeDatasetId || !clusterCol) return;
    const mergesToApply = clusters
      .filter((c) => selectedMerges[c.canonical])
      .map((c) => ({
        canonical: c.canonical,
        variants: c.variants.map((v) => v.value),
      }));

    if (mergesToApply.length === 0) {
      setStandardizeResult('Please select at least one cluster to merge.');
      return;
    }

    setStandardizeOperating(true);
    setStandardizePreview(null);
    try {
      const result = await standardizeCategories(
        activeDatasetId,
        {
          column: clusterCol,
          merges: mergesToApply,
        },
        true,
      );
      setStandardizePreview(result);
    } catch (err: any) {
      setStandardizeResult(`❌ Error: ${err.message}`);
    } finally {
      setStandardizeOperating(false);
    }
  };

  const handleApplyStandardize = async () => {
    if (!activeDatasetId || !clusterCol) return;
    const mergesToApply = clusters
      .filter((c) => selectedMerges[c.canonical])
      .map((c) => ({
        canonical: c.canonical,
        variants: c.variants.map((v) => v.value),
      }));

    setStandardizeOperating(true);
    try {
      const result = await standardizeCategories(
        activeDatasetId,
        {
          column: clusterCol,
          merges: mergesToApply,
        },
        false,
      );
      setStandardizeResult(`✅ Applied: ${result.after_summary}`);
      setStandardizePreview(null);
      setClusters([]);
      await refreshAll();
    } catch (err: any) {
      setStandardizeResult(`❌ Failed: ${err.message}`);
    } finally {
      setStandardizeOperating(false);
    }
  };

  // ─── Module 3: Column Management Actions ─────────────────────────────────

  const handleRenameColumn = async (preview: boolean) => {
    if (!activeDatasetId || !colRenameOld || !colRenameNew.trim()) return;
    setColMgmtOperating(true);
    setColMgmtResult(null);
    try {
      const res = await renameColumn(activeDatasetId, colRenameOld, colRenameNew.trim(), preview);
      if (preview) {
        setColMgmtPreview(res);
      } else {
        setColMgmtResult(`✅ ${res.after_summary}`);
        setColMgmtPreview(null);
        setColRenameNew('');
        await refreshAll();
      }
    } catch (err: any) {
      setColMgmtResult(`❌ Error: ${err.message}`);
    } finally {
      setColMgmtOperating(false);
    }
  };

  const handleDeleteColumn = async (preview: boolean) => {
    if (!activeDatasetId || !colDeleteTarget) return;
    setColMgmtOperating(true);
    setColMgmtResult(null);
    try {
      const res = await deleteColumn(activeDatasetId, colDeleteTarget, preview);
      if (preview) {
        setColMgmtPreview(res);
      } else {
        setColMgmtResult(`✅ ${res.after_summary}`);
        setColMgmtPreview(null);
        await refreshAll();
      }
    } catch (err: any) {
      setColMgmtResult(`❌ Error: ${err.message}`);
    } finally {
      setColMgmtOperating(false);
    }
  };

  const handleMoveColumn = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= colOrderList.length) return;
    const updated = [...colOrderList];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIdx, 0, moved);
    setColOrderList(updated);
  };

  const handleApplyReorder = async () => {
    if (!activeDatasetId) return;
    setColMgmtOperating(true);
    try {
      const res = await reorderColumns(activeDatasetId, colOrderList, false);
      setColMgmtResult(`✅ ${res.after_summary}`);
      await refreshAll();
    } catch (err: any) {
      setColMgmtResult(`❌ Failed: ${err.message}`);
    } finally {
      setColMgmtOperating(false);
    }
  };

  const handlePreviewCalculatedColumn = async () => {
    if (!activeDatasetId || !calcColName.trim() || !calcExpression.trim()) return;
    setCalcOperating(true);
    setCalcPreview(null);
    setCalcResult(null);
    try {
      const res = await createCalculatedColumn(activeDatasetId, calcColName.trim(), calcExpression.trim(), true);
      setCalcPreview(res);
    } catch (err: any) {
      setCalcResult(`❌ Calculation error: ${err.message}`);
    } finally {
      setCalcOperating(false);
    }
  };

  const handleApplyCalculatedColumn = async () => {
    if (!activeDatasetId || !calcColName.trim() || !calcExpression.trim()) return;
    setCalcOperating(true);
    try {
      const res = await createCalculatedColumn(activeDatasetId, calcColName.trim(), calcExpression.trim(), false);
      setCalcResult(`✅ Created: ${res.after_summary}`);
      setCalcPreview(null);
      setCalcColName('');
      setCalcExpression('');
      await refreshAll();
    } catch (err: any) {
      setCalcResult(`❌ Failed: ${err.message}`);
    } finally {
      setCalcOperating(false);
    }
  };

  // ─── Rollback ────────────────────────────────────────────────────────────

  const handleRollback = async () => {
    if (!activeDatasetId) return;
    try {
      await rollbackLastOperation(activeDatasetId);
      await refreshAll();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ─── Computed ────────────────────────────────────────────────────────────

  const columnsWithMissing = profile?.columns.filter((c) => c.missing_count > 0) || [];
  const selectedColProfile = profile?.columns.find((c) => c.name === selectedColumn);
  const isNumericCol = selectedColProfile?.type === 'numerical';

  if (!activeDatasetId && recentDatasets.length === 0) {
    return (
      <div className="empty-state-card max-w-4xl mx-auto py-12 text-center space-y-5">
        <div className="empty-state-icon w-16 h-16 rounded-[14px] bg-[#ff6a3d]/10 text-[#ff6a3d] mx-auto flex items-center justify-center border border-[#ff6a3d]/25">
          <Database className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white">No Dataset Loaded</h2>
        <p className="text-sm text-[#8a8a86] max-w-sm mx-auto">
          Upload a dataset first to start cleaning operations.
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
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#ff6a3d] font-semibold mb-1">
            <Wand2 className="w-3.5 h-3.5" />
            <span>Data Studio</span>
          </div>
          <h1 className="animate-hero-blur-in text-3xl font-extrabold text-white tracking-tight">
            Data Cleaning & Transformation
          </h1>
          <p className="text-sm text-[#8a8a86] mt-1">
            Preview every transformation safely before applying. Fully logged and reversible.
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
                    {d.filename} ({d.dataset_id.slice(0, 8)})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#8a8a86] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <ShieldCheck className="w-4 h-4" />
            <span>Preview Guard Active</span>
          </div>

          {opLog.length > 0 && (
            <button
              onClick={handleRollback}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.15)] hover:bg-white/5 text-[#f2f2f0] text-xs font-medium transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Undo Last ({opLog.length})</span>
            </button>
          )}

          <button
            onClick={handleAnalyzeWithAI}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#ff6a3d] hover:bg-[#ff7b50] text-[#0c0c0e] text-xs font-semibold transition-all shadow-none"
          >
            <Sparkles className="w-4 h-4 text-[#0c0c0e]" />
            <span>✨ Analyze with AI</span>
          </button>
        </div>
      </div>

      {aiNotice && (
        <div className="p-4 rounded-[14px] bg-[#ff6a3d]/10 border border-[#ff6a3d]/30 text-[#ffb08a] text-sm flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#ff6a3d] shrink-0" />
            <span>{aiNotice}</span>
          </div>
          <button
            onClick={() => setAiNotice(null)}
            className="text-xs text-[#ff6a3d] hover:text-white underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-[14px] bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* AI Analysis Modal Overlay */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0a0a0c]/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-2xl bg-[#0c0c0e] border border-[rgba(255,255,255,0.12)] rounded-[14px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-6 bg-white/[0.02] border-b border-[rgba(255,255,255,0.08)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#ff6a3d]/15 border border-[#ff6a3d]/30 flex items-center justify-center text-[#ff6a3d]">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white">✨ AI Dataset Recommendations</h3>
                    {aiResponse && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#ff6a3d]/15 text-[#ffb08a] border border-[#ff6a3d]/30">
                        {aiResponse.source === 'gemini' ? 'Gemini 2.5 Flash' : 'AI Analysis Engine'}
                      </span>
                    )}
                    {aiResponse?.cached && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                        <Zap className="w-3 h-3 text-emerald-400" /> Cached
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#8a8a86] mt-0.5">
                    Privacy Guarantee: Metadata profile evaluated (zero raw rows sent).
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAiModal(false)}
                className="p-2 rounded-xl text-[#8a8a86] hover:text-white hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
              {aiLoading && (
                <div className="py-12 text-center space-y-3">
                  <Loader2 className="w-8 h-8 text-[#ff6a3d] animate-spin mx-auto" />
                  <p className="text-sm font-medium text-slate-300">
                    Evaluating dataset shape, quality scores & column distributions...
                  </p>
                  <p className="text-xs text-[#8a8a86]">Generating optimal cleaning suggestions</p>
                </div>
              )}

              {aiError && (
                <div className="p-4 rounded-[14px] bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span>{aiError}</span>
                </div>
              )}

              {aiResponse && !aiLoading && (
                <div className="space-y-4">
                  {aiResponse.recommendations.filter((r) => !ignoredRecIds.includes(r.id)).length === 0 ? (
                    <div className="py-10 text-center space-y-3">
                      <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                      <p className="text-sm font-medium text-slate-200">
                        No active AI recommendations remaining.
                      </p>
                    </div>
                  ) : (
                    aiResponse.recommendations
                      .filter((r) => !ignoredRecIds.includes(r.id))
                      .map((rec) => (
                        <div
                          key={rec.id}
                          className="p-5 rounded-[14px] bg-white/[0.03] border border-[rgba(255,255,255,0.08)] hover:border-[#ff6a3d]/40 transition-all space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <span className="w-6 h-6 rounded-full bg-[#ff6a3d]/20 text-[#ff6a3d] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                                {rec.id}
                              </span>
                              <div>
                                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                  <span>{rec.issue}</span>
                                  {rec.target_column && (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-white/5 text-[#ffb08a] border border-white/10">
                                      {rec.target_column}
                                    </span>
                                  )}
                                </h4>
                                <p className="text-xs text-slate-300 mt-1 font-medium">
                                  👉 {rec.recommendation}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Reason / Rationale Box */}
                          <div className="p-3 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)] text-xs text-[#8a8a86] flex items-start gap-2">
                            <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <span>
                              <strong className="text-amber-300 font-semibold">Reason:</strong> {rec.reason}
                            </span>
                          </div>

                          {/* Action Buttons */}
                          <div className="pt-1 flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleIgnoreAiRecommendation(rec.id)}
                              className="px-3 py-1.5 rounded-xl border border-[rgba(255,255,255,0.15)] hover:bg-white/5 text-[#f2f2f0] text-xs font-medium transition-colors"
                            >
                              Ignore
                            </button>
                            <button
                              onClick={() => handleApplyAiRecommendation(rec)}
                              className="px-4 py-1.5 rounded-xl bg-[#ff6a3d] hover:bg-[#ff7b50] text-[#0c0c0e] text-xs font-semibold transition-all flex items-center gap-1.5"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Apply (Pre-fill Action)</span>
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Module Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[rgba(255,255,255,0.08)] pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('nulls-duplicates')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'nulls-duplicates'
              ? 'bg-[#ff6a3d]/15 text-[#ff6a3d] border border-[#ff6a3d]/30 font-semibold'
              : 'text-[#8a8a86] hover:text-[#f2f2f0] hover:bg-white/[0.04]'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Nulls & Duplicates</span>
          {columnsWithMissing.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px]">
              {columnsWithMissing.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('type-conversion')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'type-conversion'
              ? 'bg-[#ff6a3d]/15 text-[#ff6a3d] border border-[#ff6a3d]/30 font-semibold'
              : 'text-[#8a8a86] hover:text-[#f2f2f0] hover:bg-white/[0.04]'
          }`}
        >
          <Binary className="w-3.5 h-3.5" />
          <span>Type Conversion</span>
          {typeSuggestions.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-[#ff6a3d]/15 text-[#ffb08a] text-[10px]">
              {typeSuggestions.length} suggestions
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('text-cleaning')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'text-cleaning'
              ? 'bg-[#ff6a3d]/15 text-[#ff6a3d] border border-[#ff6a3d]/30 font-semibold'
              : 'text-[#8a8a86] hover:text-[#f2f2f0] hover:bg-white/[0.04]'
          }`}
        >
          <Type className="w-3.5 h-3.5" />
          <span>Text & Standardization</span>
        </button>

        <button
          onClick={() => setActiveTab('column-management')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'column-management'
              ? 'bg-[#ff6a3d]/15 text-[#ff6a3d] border border-[#ff6a3d]/30 font-semibold'
              : 'text-[#8a8a86] hover:text-[#f2f2f0] hover:bg-white/[0.04]'
          }`}
        >
          <Columns className="w-3.5 h-3.5" />
          <span>Column Management & Math</span>
        </button>

        <button
          onClick={() => setActiveTab('outliers')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'outliers'
              ? 'bg-[#ff6a3d]/15 text-[#ff6a3d] border border-[#ff6a3d]/30 font-semibold'
              : 'text-[#8a8a86] hover:text-[#f2f2f0] hover:bg-white/[0.04]'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Outlier Detection</span>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[#ff6a3d] animate-spin" />
        </div>
      ) : (
        <>
          {/* TAB 1: NULLS & DUPLICATES */}
          {activeTab === 'nulls-duplicates' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Missing Values Panel */}
              <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-white/[0.03] overflow-hidden flex flex-col">
                <div className="p-5 border-b border-[rgba(255,255,255,0.08)] flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      Missing Values
                    </h2>
                    <p className="text-xs text-[#8a8a86] mt-0.5">
                      {columnsWithMissing.length === 0
                        ? 'No missing values detected'
                        : `${columnsWithMissing.length} column(s) with missing data`}
                    </p>
                  </div>
                </div>

                <div className="p-5 space-y-4 flex-1">
                  {columnsWithMissing.length === 0 ? (
                    <div className="text-center py-8 space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                      <p className="text-sm text-emerald-400 font-medium">100% Complete</p>
                      <p className="text-xs text-[#8a8a86]">All columns are free of missing values</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {columnsWithMissing.map((col) => (
                          <button
                            key={col.name}
                            type="button"
                            onClick={() => {
                              setSelectedColumn(col.name);
                              setMissingPreview(null);
                              setMissingResult(null);
                              setFillMethod(col.type === 'numerical' ? 'mean' : 'mode');
                            }}
                            className={`w-full p-3 rounded-xl text-left transition-all flex items-center justify-between gap-3 ${
                              selectedColumn === col.name
                                ? 'bg-[#ff6a3d]/15 border border-[#ff6a3d]/30 text-white'
                                : 'bg-white/[0.02] border border-[rgba(255,255,255,0.06)] hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-sm font-semibold text-[#f2f2f0] truncate">{col.name}</span>
                              <span className="text-[10px] text-[#8a8a86] font-mono px-1.5 py-0.5 rounded bg-white/5">{col.type}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-mono font-bold text-amber-400">{col.missing_count}</span>
                              <span className="text-[10px] text-[#8a8a86]">({col.missing_percentage}%)</span>
                            </div>
                          </button>
                        ))}
                      </div>

                      {selectedColumn && (
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)] space-y-3">
                          <span className="text-xs text-[#8a8a86] font-semibold block">
                            Fill method for <span className="text-[#ff6a3d]">{selectedColumn}</span>
                          </span>

                          <div className="flex flex-wrap gap-2">
                            {(['remove', 'mean', 'median', 'mode', 'custom'] as FillMethod[]).map((m) => {
                              const disabled = (m === 'mean' || m === 'median') && !isNumericCol;
                              return (
                                <button
                                  key={m}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => {
                                    setFillMethod(m);
                                    setMissingPreview(null);
                                    setMissingResult(null);
                                  }}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                                    fillMethod === m
                                      ? 'bg-[#ff6a3d] text-[#0c0c0e] font-semibold'
                                      : disabled
                                      ? 'bg-white/5 text-slate-600 cursor-not-allowed'
                                      : 'border border-[rgba(255,255,255,0.12)] text-[#f2f2f0] hover:bg-white/5'
                                  }`}
                                >
                                  {m}
                                </button>
                              );
                            })}
                          </div>

                          {fillMethod === 'custom' && (
                            <input
                              type="text"
                              value={customValue}
                              onChange={(e) => setCustomValue(e.target.value)}
                              placeholder="Enter custom fill value..."
                              className="w-full px-3 py-2 bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-lg text-sm text-[#f2f2f0] placeholder-[#7a7a75] focus:outline-none focus:border-[#ff6a3d]"
                            />
                          )}

                          <button
                            type="button"
                            onClick={handlePreviewMissing}
                            disabled={missingLoading || (fillMethod === 'custom' && !customValue.trim())}
                            className="w-full px-4 py-2.5 rounded-xl border border-[rgba(255,255,255,0.15)] hover:bg-white/5 text-[#f2f2f0] text-xs font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {missingLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                            <span>Preview Effect</span>
                          </button>

                          {/* Preview Box: Distinct Orange-tinted fill & border */}
                          {missingPreview && (
                            <div className="preview-box-orange p-3.5 space-y-2">
                              <div className="text-xs text-slate-200 space-y-1">
                                <p><span className="text-[#8a8a86]">Before:</span> {missingPreview.before_summary}</p>
                                <p><span className="text-[#8a8a86]">After:</span> <span className="text-[#ffb08a] font-medium">{missingPreview.after_summary}</span></p>
                                <p className="text-[#8a8a86]">Affected rows: <span className="text-white font-mono font-bold">{missingPreview.affected_rows}</span></p>
                              </div>

                              <button
                                type="button"
                                onClick={handleApplyMissing}
                                disabled={missingApplying || missingPreview.affected_rows === 0}
                                className="w-full px-4 py-2.5 rounded-xl bg-[#ff6a3d] hover:bg-[#ff7b50] text-[#0c0c0e] text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                {missingApplying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                <span>Approve & Apply</span>
                              </button>
                            </div>
                          )}

                          {missingResult && (
                            <div className={`p-3 rounded-xl text-xs font-medium ${
                              missingResult.startsWith('✅')
                                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                            }`}>
                              {missingResult}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Duplicates Panel */}
              <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-white/[0.03] overflow-hidden flex flex-col">
                <div className="p-5 border-b border-[rgba(255,255,255,0.08)] flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Copy className="w-4 h-4 text-sky-400" />
                      Duplicate Rows
                    </h2>
                    <p className="text-xs text-[#8a8a86] mt-0.5">Detect and remove identical rows</p>
                  </div>
                  {dupPreview && dupPreview.affected_rows > 0 && (
                    <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold">
                      {dupPreview.affected_rows} found
                    </span>
                  )}
                </div>

                <div className="p-5 space-y-4 flex-1">
                  {dupPreview && dupPreview.affected_rows === 0 ? (
                    <div className="text-center py-8 space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                      <p className="text-sm text-emerald-400 font-medium">No Duplicates</p>
                      <p className="text-xs text-[#8a8a86]">All rows in this dataset are unique</p>
                    </div>
                  ) : dupPreview ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)] text-center space-y-1">
                          <div className="text-2xl font-bold text-white font-mono">{profile?.row_count.toLocaleString()}</div>
                          <div className="text-[11px] text-[#8a8a86]">Total Rows</div>
                        </div>
                        <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/15 text-center space-y-1">
                          <div className="text-2xl font-bold text-amber-400 font-mono">{dupPreview.affected_rows.toLocaleString()}</div>
                          <div className="text-[11px] text-amber-400/70">Duplicates</div>
                        </div>
                      </div>

                      {/* Preview Box: Orange Tinted */}
                      <div className="preview-box-orange p-3.5 text-xs text-slate-200 space-y-1">
                        <p><span className="text-[#8a8a86]">Before:</span> {dupPreview.before_summary}</p>
                        <p><span className="text-[#8a8a86]">After:</span> <span className="text-[#ffb08a] font-medium">{dupPreview.after_summary}</span></p>
                      </div>

                      {dupPreview.sample_rows && dupPreview.sample_rows.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs text-[#8a8a86] font-semibold">Sample Duplicate Rows</h4>
                          <div className="max-h-40 overflow-auto rounded-lg border border-[rgba(255,255,255,0.08)]">
                            <table className="w-full text-[11px] text-left">
                              <thead className="bg-[#0c0c0e] text-[#8a8a86] uppercase sticky top-0">
                                <tr>
                                  {Object.keys(dupPreview.sample_rows[0]).slice(0, 5).map((key) => (
                                    <th key={key} className="py-2 px-3 font-semibold">{key}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[rgba(255,255,255,0.05)]">
                                {dupPreview.sample_rows.slice(0, 5).map((row, i) => (
                                  <tr key={i} className="text-slate-300">
                                    {Object.values(row).slice(0, 5).map((val, j) => (
                                      <td key={j} className="py-1.5 px-3 truncate max-w-[120px]">
                                        {String(val)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handleApplyDuplicates}
                        disabled={dupApplying}
                        className="w-full px-4 py-2.5 rounded-xl bg-[#ff6a3d] hover:bg-[#ff7b50] text-[#0c0c0e] text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {dupApplying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        <span>Remove {dupPreview.affected_rows} Duplicate(s)</span>
                      </button>
                    </>
                  ) : null}

                  {dupResult && (
                    <div className={`p-3 rounded-xl text-xs font-medium ${
                      dupResult.startsWith('✅')
                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                        : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                    }`}>
                      {dupResult}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DATA TYPE CONVERSION */}
          {activeTab === 'type-conversion' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Suggestions List */}
              <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-white/[0.03] p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#ff6a3d]" />
                      Auto-Suggested Type Conversions
                    </h2>
                    <p className="text-xs text-[#8a8a86] mt-0.5">
                      Intelligent type inference with confidence metrics
                    </p>
                  </div>
                </div>

                {typeSuggestions.length === 0 ? (
                  <div className="text-center py-8 space-y-2 border border-dashed border-[rgba(255,255,255,0.08)] rounded-xl">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                    <p className="text-sm text-slate-300 font-medium">All columns have optimal types</p>
                    <p className="text-xs text-[#7a7a75]">You can still manually override types using the converter panel.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {typeSuggestions.map((sug) => (
                      <div
                        key={sug.column}
                        onClick={() => {
                          setSelectedTypeCol(sug.column);
                          setTargetType(sug.suggested_type);
                        }}
                        className={`p-4 rounded-xl border cursor-pointer transition-all space-y-2 ${
                          selectedTypeCol === sug.column
                            ? 'bg-[#ff6a3d]/15 border-[#ff6a3d]/30 text-white'
                            : 'bg-white/[0.02] border-[rgba(255,255,255,0.06)] hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">{sug.column}</span>
                            <span className="text-[10px] font-mono text-[#8a8a86] px-1.5 py-0.5 rounded bg-white/5">
                              {sug.current_type}
                            </span>
                            <ArrowRightLeft className="w-3 h-3 text-[#8a8a86]" />
                            <span className="text-xs font-bold text-[#ff6a3d] capitalize">
                              {sug.suggested_type}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold">
                            {Math.round(sug.confidence * 100)}% Confident
                          </span>
                        </div>

                        <p className="text-xs text-[#8a8a86]">{sug.reason}</p>

                        {sug.sample_from && sug.sample_from.length > 0 && (
                          <div className="text-[11px] font-mono text-[#8a8a86] bg-[#0c0c0e] p-2 rounded-lg flex items-center gap-2 border border-[rgba(255,255,255,0.05)]">
                            <span>Sample:</span>
                            <span>{sug.sample_from.slice(0, 3).join(', ')}</span>
                            <span className="text-[#ff6a3d]">→</span>
                            <span className="text-[#ffb08a] font-semibold">{sug.sample_to.slice(0, 3).join(', ')}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Converter Control Panel */}
              <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-white/[0.03] p-5 space-y-4">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Binary className="w-4 h-4 text-[#ff6a3d]" />
                  Confirm or Override Conversion
                </h2>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-[#8a8a86] block mb-1">Select Column</label>
                    <select
                      value={selectedTypeCol || ''}
                      onChange={(e) => setSelectedTypeCol(e.target.value)}
                      className="w-full px-3 py-2 bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-xl text-sm text-[#f2f2f0] focus:outline-none focus:border-[#ff6a3d]"
                    >
                      {profile?.columns.map((col) => (
                        <option key={col.name} value={col.name} className="bg-[#0c0c0e]">
                          {col.name} ({col.dtype})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#8a8a86] block mb-1">Target Data Type</label>
                    <select
                      value={targetType}
                      onChange={(e) => setTargetType(e.target.value)}
                      className="w-full px-3 py-2 bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-xl text-sm text-[#f2f2f0] focus:outline-none focus:border-[#ff6a3d]"
                    >
                      <option value="integer" className="bg-[#0c0c0e]">Integer (whole numbers, null-safe Int64)</option>
                      <option value="float" className="bg-[#0c0c0e]">Float (floating point decimal)</option>
                      <option value="datetime" className="bg-[#0c0c0e]">Datetime (timestamp format)</option>
                      <option value="boolean" className="bg-[#0c0c0e]">Boolean (true / false flags)</option>
                      <option value="string" className="bg-[#0c0c0e]">String (text representation)</option>
                    </select>
                  </div>

                  {targetType === 'datetime' && (
                    <div>
                      <label className="text-xs font-semibold text-[#8a8a86] block mb-1">Optional Date Format</label>
                      <input
                        type="text"
                        value={dateFormat}
                        onChange={(e) => setDateFormat(e.target.value)}
                        placeholder="e.g. %Y-%m-%d or %d/%m/%Y (leave blank for auto)"
                        className="w-full px-3 py-2 bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-xl text-sm text-[#f2f2f0] focus:outline-none focus:border-[#ff6a3d] placeholder-[#7a7a75]"
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handlePreviewTypeConversion}
                    disabled={typeOperating}
                    className="w-full px-4 py-2.5 rounded-xl border border-[rgba(255,255,255,0.15)] hover:bg-white/5 text-[#f2f2f0] text-xs font-medium transition-all flex items-center justify-center gap-2"
                  >
                    {typeOperating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                    <span>Preview Conversion</span>
                  </button>

                  {/* Preview Box: Orange Tinted */}
                  {typePreview && (
                    <div className="preview-box-orange p-3.5 space-y-2">
                      <div className="text-xs text-slate-200 space-y-1">
                        <p><span className="text-[#8a8a86]">Before:</span> {typePreview.before_summary}</p>
                        <p><span className="text-[#8a8a86]">After:</span> <span className="text-[#ffb08a] font-medium">{typePreview.after_summary}</span></p>
                        <p className="text-[#8a8a86]">Affected cells: <span className="text-white font-mono font-bold">{typePreview.affected_rows}</span></p>
                      </div>

                      <button
                        type="button"
                        onClick={handleApplyTypeConversion}
                        disabled={typeOperating}
                        className="w-full px-4 py-2.5 rounded-xl bg-[#ff6a3d] hover:bg-[#ff7b50] text-[#0c0c0e] text-xs font-bold transition-all flex items-center justify-center gap-2"
                      >
                        {typeOperating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span>Approve & Apply Conversion</span>
                      </button>
                    </div>
                  )}

                  {typeResult && (
                    <div className={`p-3 rounded-xl text-xs font-medium ${
                      typeResult.startsWith('✅')
                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                        : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                    }`}>
                      {typeResult}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TEXT CLEANING & STANDARDIZATION */}
          {activeTab === 'text-cleaning' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Text Transforms */}
              <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-white/[0.03] p-5 space-y-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Type className="w-4 h-4 text-[#ff6a3d]" />
                    Text Transformations
                  </h2>
                  <p className="text-xs text-[#8a8a86] mt-0.5">Trim whitespace, convert casing, remove symbols, find & replace</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-[#8a8a86] block mb-1">Target Column</label>
                    <select
                      value={textCol || ''}
                      onChange={(e) => setTextCol(e.target.value)}
                      className="w-full px-3 py-2 bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-xl text-sm text-[#f2f2f0] focus:outline-none focus:border-[#ff6a3d]"
                    >
                      {profile?.columns.map((col) => (
                        <option key={col.name} value={col.name} className="bg-[#0c0c0e]">
                          {col.name} ({col.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#8a8a86] block mb-1">Operation</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'trim', label: 'Trim Whitespace' },
                        { id: 'case', label: 'Case Convert' },
                        { id: 'remove_special', label: 'Remove Symbols' },
                        { id: 'find_replace', label: 'Find & Replace' },
                      ].map((op) => (
                        <button
                          key={op.id}
                          type="button"
                          onClick={() => setTextOp(op.id as any)}
                          className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                            textOp === op.id
                              ? 'bg-[#ff6a3d] text-[#0c0c0e] font-semibold'
                              : 'border border-[rgba(255,255,255,0.12)] text-[#f2f2f0] hover:bg-white/5'
                          }`}
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {textOp === 'case' && (
                    <div>
                      <label className="text-xs font-semibold text-[#8a8a86] block mb-1">Casing Style</label>
                      <select
                        value={caseType}
                        onChange={(e) => setCaseType(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-xl text-sm text-[#f2f2f0] focus:outline-none focus:border-[#ff6a3d]"
                      >
                        <option value="lower" className="bg-[#0c0c0e]">lowercase (all characters lowercase)</option>
                        <option value="upper" className="bg-[#0c0c0e]">UPPERCASE (all characters uppercase)</option>
                        <option value="title" className="bg-[#0c0c0e]">Title Case (capitalize every word)</option>
                      </select>
                    </div>
                  )}

                  {textOp === 'find_replace' && (
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs font-semibold text-[#8a8a86] block mb-1">Find Text / Pattern</label>
                        <input
                          type="text"
                          value={findText}
                          onChange={(e) => setFindText(e.target.value)}
                          placeholder="Text to find..."
                          className="w-full px-3 py-2 bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-xl text-sm text-[#f2f2f0] focus:outline-none focus:border-[#ff6a3d]"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-[#8a8a86] block mb-1">Replace With</label>
                        <input
                          type="text"
                          value={replaceText}
                          onChange={(e) => setReplaceText(e.target.value)}
                          placeholder="Replacement text..."
                          className="w-full px-3 py-2 bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-xl text-sm text-[#f2f2f0] focus:outline-none focus:border-[#ff6a3d]"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs text-[#8a8a86] cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={useRegex}
                          onChange={(e) => setUseRegex(e.target.checked)}
                          className="rounded bg-white/5 border-[rgba(255,255,255,0.1)] text-[#ff6a3d] focus:ring-0"
                        />
                        <span>Treat search text as Regular Expression (Regex)</span>
                      </label>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handlePreviewTextTransform}
                    disabled={textOperating || (textOp === 'find_replace' && !findText)}
                    className="w-full px-4 py-2.5 rounded-xl border border-[rgba(255,255,255,0.15)] hover:bg-white/5 text-[#f2f2f0] text-xs font-medium transition-all flex items-center justify-center gap-2"
                  >
                    {textOperating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                    <span>Preview Text Transform</span>
                  </button>

                  {/* Preview Box: Orange Tinted */}
                  {textPreview && (
                    <div className="preview-box-orange p-3.5 space-y-2">
                      <div className="text-xs text-slate-200 space-y-1">
                        <p><span className="text-[#8a8a86]">Before:</span> {textPreview.before_summary}</p>
                        <p><span className="text-[#8a8a86]">After:</span> <span className="text-[#ffb08a] font-medium">{textPreview.after_summary}</span></p>
                        <p className="text-[#8a8a86]">Affected cells: <span className="text-white font-mono font-bold">{textPreview.affected_rows}</span></p>
                      </div>

                      <button
                        type="button"
                        onClick={handleApplyTextTransform}
                        disabled={textOperating || textPreview.affected_rows === 0}
                        className="w-full px-4 py-2.5 rounded-xl bg-[#ff6a3d] hover:bg-[#ff7b50] text-[#0c0c0e] text-xs font-bold transition-all flex items-center justify-center gap-2"
                      >
                        {textOperating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span>Approve & Apply Text Transform</span>
                      </button>
                    </div>
                  )}

                  {textResult && (
                    <div className={`p-3 rounded-xl text-xs font-medium ${
                      textResult.startsWith('✅')
                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                        : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                    }`}>
                      {textResult}
                    </div>
                  )}
                </div>
              </div>

              {/* Standardize Values Clustering */}
              <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-white/[0.03] p-5 space-y-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#ff6a3d]" />
                    Standardize Values (Near-Duplicate Clustering)
                  </h2>
                  <p className="text-xs text-[#8a8a86] mt-0.5">
                    Detects near-duplicates and allows user confirmation before merging.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex gap-2">
                    <select
                      value={clusterCol || ''}
                      onChange={(e) => setClusterCol(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-xl text-sm text-[#f2f2f0] focus:outline-none focus:border-[#ff6a3d]"
                    >
                      {profile?.columns.map((col) => (
                        <option key={col.name} value={col.name} className="bg-[#0c0c0e]">
                          {col.name} ({col.type})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleFetchClusters}
                      disabled={clustersLoading}
                      className="px-4 py-2 rounded-xl bg-[#ff6a3d] hover:bg-[#ff7b50] text-[#0c0c0e] text-xs font-semibold transition-all flex items-center gap-2 shrink-0"
                    >
                      {clustersLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      <span>Find Clusters</span>
                    </button>
                  </div>

                  {clusters.length > 0 && (
                    <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                      <div className="text-xs font-semibold text-slate-300">
                        Proposed Merges ({clusters.length} clusters found):
                      </div>
                      {clusters.map((cluster) => (
                        <div
                          key={cluster.canonical}
                          className="p-3 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)] space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!selectedMerges[cluster.canonical]}
                                onChange={(e) =>
                                  setSelectedMerges({
                                    ...selectedMerges,
                                    [cluster.canonical]: e.target.checked,
                                  })
                                }
                                className="rounded bg-white/5 border-[rgba(255,255,255,0.1)] text-[#ff6a3d]"
                              />
                              <span className="text-sm font-bold text-white">
                                Merge into: <span className="text-[#ffb08a]">&quot;{cluster.canonical}&quot;</span>
                              </span>
                            </label>
                            <span className="text-xs text-amber-400 font-mono font-bold">
                              {cluster.total_affected} affected rows
                            </span>
                          </div>

                          <div className="text-xs text-[#8a8a86] flex flex-wrap gap-1.5 pl-6">
                            <span>Variants to replace:</span>
                            {cluster.variants.map((v) => (
                              <span
                                key={v.value}
                                className="px-2 py-0.5 rounded bg-white/5 text-slate-300 font-mono text-[11px] border border-[rgba(255,255,255,0.06)]"
                              >
                                &quot;{v.value}&quot; ({v.count})
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={handlePreviewStandardize}
                        disabled={standardizeOperating}
                        className="w-full px-4 py-2.5 rounded-xl border border-[rgba(255,255,255,0.15)] hover:bg-white/5 text-[#f2f2f0] text-xs font-medium transition-all flex items-center justify-center gap-2"
                      >
                        {standardizeOperating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                        <span>Preview Cluster Merge</span>
                      </button>

                      {/* Preview Box: Orange Tinted */}
                      {standardizePreview && (
                        <div className="preview-box-orange p-3.5 space-y-2">
                          <div className="text-xs text-slate-200 space-y-1">
                            <p><span className="text-[#8a8a86]">Before:</span> {standardizePreview.before_summary}</p>
                            <p><span className="text-[#8a8a86]">After:</span> <span className="text-[#ffb08a] font-medium">{standardizePreview.after_summary}</span></p>
                            <p className="text-[#8a8a86]">Total modified rows: <span className="text-white font-mono font-bold">{standardizePreview.affected_rows}</span></p>
                          </div>

                          <button
                            type="button"
                            onClick={handleApplyStandardize}
                            disabled={standardizeOperating || standardizePreview.affected_rows === 0}
                            className="w-full px-4 py-2.5 rounded-xl bg-[#ff6a3d] hover:bg-[#ff7b50] text-[#0c0c0e] text-xs font-bold transition-all flex items-center justify-center gap-2"
                          >
                            {standardizeOperating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            <span>Confirm & Merge Values</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {standardizeResult && (
                    <div className={`p-3 rounded-xl text-xs font-medium ${
                      standardizeResult.startsWith('✅')
                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                        : 'bg-white/5 text-slate-300 border border-[rgba(255,255,255,0.06)]'
                    }`}>
                      {standardizeResult}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: COLUMN MANAGEMENT & CALCULATED COLUMNS */}
          {activeTab === 'column-management' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Column Structure Operations */}
              <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-white/[0.03] p-5 space-y-5">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Columns className="w-4 h-4 text-[#ff6a3d]" />
                    Rename, Delete & Reorder Columns
                  </h2>
                  <p className="text-xs text-[#8a8a86] mt-0.5">Manage schema architecture and column sequence</p>
                </div>

                {/* Rename */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)] space-y-3">
                  <span className="text-xs font-bold text-slate-200 block">Rename Column</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                      value={colRenameOld}
                      onChange={(e) => setColRenameOld(e.target.value)}
                      className="px-3 py-2 bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-xl text-sm text-[#f2f2f0] focus:outline-none focus:border-[#ff6a3d]"
                    >
                      {profile?.columns.map((c) => (
                        <option key={c.name} value={c.name} className="bg-[#0c0c0e]">{c.name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={colRenameNew}
                      onChange={(e) => setColRenameNew(e.target.value)}
                      placeholder="New column name..."
                      className="px-3 py-2 bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-xl text-sm text-[#f2f2f0] focus:outline-none focus:border-[#ff6a3d]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleRenameColumn(true)}
                      disabled={colMgmtOperating || !colRenameNew.trim()}
                      className="flex-1 px-3 py-2 rounded-xl border border-[rgba(255,255,255,0.15)] hover:bg-white/5 text-[#f2f2f0] text-xs font-medium transition-all"
                    >
                      Preview Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRenameColumn(false)}
                      disabled={colMgmtOperating || !colRenameNew.trim()}
                      className="flex-1 px-3 py-2 rounded-xl bg-[#ff6a3d] hover:bg-[#ff7b50] text-[#0c0c0e] text-xs font-bold transition-all"
                    >
                      Apply Rename
                    </button>
                  </div>
                </div>

                {/* Delete */}
                <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 space-y-3">
                  <span className="text-xs font-bold text-rose-300 block">Delete Column</span>
                  <div className="flex gap-2">
                    <select
                      value={colDeleteTarget}
                      onChange={(e) => setColDeleteTarget(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-xl text-sm text-[#f2f2f0] focus:outline-none focus:border-rose-500"
                    >
                      {profile?.columns.map((c) => (
                        <option key={c.name} value={c.name} className="bg-[#0c0c0e]">{c.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleDeleteColumn(false)}
                      disabled={colMgmtOperating || (profile?.columns.length || 0) <= 1}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shrink-0 flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                {/* Reorder */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">Reorder Columns Sequence</span>
                    <button
                      type="button"
                      onClick={handleApplyReorder}
                      disabled={colMgmtOperating}
                      className="px-3 py-1.5 rounded-lg bg-[#ff6a3d] hover:bg-[#ff7b50] text-[#0c0c0e] text-xs font-bold transition-all"
                    >
                      Save Order
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {colOrderList.map((col, idx) => (
                      <div
                        key={col}
                        className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/5 border border-[rgba(255,255,255,0.05)] text-xs"
                      >
                        <span className="text-slate-200 font-medium truncate">{idx + 1}. {col}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveColumn(idx, 'up')}
                            className="p-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 text-slate-300"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === colOrderList.length - 1}
                            onClick={() => handleMoveColumn(idx, 'down')}
                            className="p-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 text-slate-300"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Preview Box: Orange Tinted */}
                {colMgmtPreview && (
                  <div className="preview-box-orange p-3.5 text-xs text-slate-200 space-y-1">
                    <p><span className="text-[#8a8a86]">Preview Effect:</span> {colMgmtPreview.after_summary}</p>
                  </div>
                )}

                {colMgmtResult && (
                  <div className={`p-3 rounded-xl text-xs font-medium ${
                    colMgmtResult.startsWith('✅')
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                  }`}>
                    {colMgmtResult}
                  </div>
                )}
              </div>

              {/* Calculated Column Studio */}
              <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-white/[0.03] p-5 space-y-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-[#ff6a3d]" />
                    Calculated Column Studio (Safe AST Evaluator)
                  </h2>
                  <p className="text-xs text-[#8a8a86] mt-0.5">
                    Compute columns safely without eval(). Restricted to arithmetic and math whitelist.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-[#8a8a86] block mb-1">New Column Name</label>
                    <input
                      type="text"
                      value={calcColName}
                      onChange={(e) => setCalcColName(e.target.value)}
                      placeholder="e.g. total_revenue or profit_margin"
                      className="w-full px-3 py-2 bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-xl text-sm text-[#f2f2f0] focus:outline-none focus:border-[#ff6a3d]"
                    />
                  </div>

                  {/* Column Chips */}
                  <div>
                    <span className="text-[11px] text-[#8a8a86] font-semibold block mb-1.5">Click column to insert into formula:</span>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {profile?.columns.map((c) => (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => {
                            const insert = c.name.includes(' ') ? `[${c.name}]` : c.name;
                            setCalcExpression((prev) => (prev ? `${prev} ${insert}` : insert));
                          }}
                          className="px-2 py-1 rounded-md bg-white/5 hover:bg-[#ff6a3d]/20 text-slate-300 text-[11px] font-mono border border-[rgba(255,255,255,0.08)] hover:border-[#ff6a3d]/40 transition-colors"
                        >
                          +{c.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Math Operator Helpers */}
                  <div>
                    <span className="text-[11px] text-[#8a8a86] font-semibold block mb-1.5">Safe operators & functions:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {['+', '-', '*', '/', '%', 'abs()', 'round(, 2)', 'sqrt()', 'min(, )', 'max(, )'].map((op) => (
                        <button
                          key={op}
                          type="button"
                          onClick={() => setCalcExpression((prev) => `${prev} ${op}`)}
                          className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-mono border border-[rgba(255,255,255,0.08)]"
                        >
                          {op}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#8a8a86] block mb-1">Expression Formula</label>
                    <textarea
                      rows={2}
                      value={calcExpression}
                      onChange={(e) => setCalcExpression(e.target.value)}
                      placeholder="e.g. price * quantity or round(val / 100, 2)"
                      className="w-full px-3 py-2 bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-xl text-sm font-mono text-[#f2f2f0] focus:outline-none focus:border-[#ff6a3d]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handlePreviewCalculatedColumn}
                    disabled={calcOperating || !calcColName.trim() || !calcExpression.trim()}
                    className="w-full px-4 py-2.5 rounded-xl border border-[rgba(255,255,255,0.15)] hover:bg-white/5 text-[#f2f2f0] text-xs font-medium transition-all flex items-center justify-center gap-2"
                  >
                    {calcOperating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                    <span>Preview Calculated Column</span>
                  </button>

                  {/* Preview Box: Orange Tinted */}
                  {calcPreview && (
                    <div className="preview-box-orange p-3.5 space-y-2">
                      <div className="text-xs text-slate-200 space-y-1">
                        <p><span className="text-[#8a8a86]">Preview:</span> <span className="text-[#ffb08a] font-medium">{calcPreview.after_summary}</span></p>
                      </div>

                      {calcPreview.sample_rows && calcPreview.sample_rows.length > 0 && (
                        <div className="max-h-32 overflow-auto rounded-lg border border-[rgba(255,255,255,0.08)]">
                          <table className="w-full text-[10px] text-left">
                            <thead className="bg-[#0c0c0e] text-[#8a8a86] uppercase">
                              <tr>
                                {Object.keys(calcPreview.sample_rows[0]).slice(-4).map((k) => (
                                  <th key={k} className="py-1.5 px-2">{k}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[rgba(255,255,255,0.05)]">
                              {calcPreview.sample_rows.slice(0, 4).map((r, i) => (
                                <tr key={i} className="text-slate-300 font-mono">
                                  {Object.values(r).slice(-4).map((v, j) => (
                                    <td key={j} className="py-1 px-2">{String(v)}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handleApplyCalculatedColumn}
                        disabled={calcOperating}
                        className="w-full px-4 py-2.5 rounded-xl bg-[#ff6a3d] hover:bg-[#ff7b50] text-[#0c0c0e] text-xs font-bold transition-all flex items-center justify-center gap-2"
                      >
                        {calcOperating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span>Approve & Create Column</span>
                      </button>
                    </div>
                  )}

                  {calcResult && (
                    <div className={`p-3 rounded-xl text-xs font-medium ${
                      calcResult.startsWith('✅')
                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                        : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                    }`}>
                      {calcResult}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: OUTLIER DETECTION */}
          {activeTab === 'outliers' && (
            <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-white/[0.03] p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] pb-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Statistical Outlier Detection & Handling
                  </h2>
                  <p className="text-xs text-[#8a8a86] mt-1">
                    Detect extreme values using IQR or Z-score methods. Preview flagged rows before applying actions.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-[#8a8a86] uppercase tracking-wider mb-2">
                    Numerical Column
                  </label>
                  <select
                    value={outlierCol || ''}
                    onChange={(e) => setOutlierCol(e.target.value)}
                    className="w-full bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#ff6a3d]"
                  >
                    <option value="" className="bg-[#0c0c0e]">Select column...</option>
                    {profile?.columns
                      .filter((c) => c.type === 'numerical')
                      .map((c) => (
                        <option key={c.name} value={c.name} className="bg-[#0c0c0e]">
                          {c.name} ({c.dtype})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#8a8a86] uppercase tracking-wider mb-2">
                    Detection Method
                  </label>
                  <select
                    value={outlierMethod}
                    onChange={(e) => setOutlierMethod(e.target.value as 'iqr' | 'zscore')}
                    className="w-full bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#ff6a3d]"
                  >
                    <option value="iqr" className="bg-[#0c0c0e]">IQR (Interquartile Range)</option>
                    <option value="zscore" className="bg-[#0c0c0e]">Z-Score (Standard Deviations)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#8a8a86] uppercase tracking-wider mb-2">
                    {outlierMethod === 'iqr' ? 'IQR Multiplier (e.g., 1.5)' : 'Z-Score Threshold (e.g., 3.0)'}
                  </label>
                  {outlierMethod === 'iqr' ? (
                    <input
                      type="number"
                      step="0.1"
                      value={outlierMultiplier}
                      onChange={(e) => setOutlierMultiplier(parseFloat(e.target.value) || 1.5)}
                      className="w-full bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#ff6a3d]"
                    />
                  ) : (
                    <input
                      type="number"
                      step="0.1"
                      value={outlierZscoreThreshold}
                      onChange={(e) => setOutlierZscoreThreshold(parseFloat(e.target.value) || 3.0)}
                      className="w-full bg-white/5 border border-[rgba(255,255,255,0.1)] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#ff6a3d]"
                    />
                  )}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleDetectOutliers}
                  disabled={!outlierCol || outlierDetecting}
                  className="px-5 py-2.5 rounded-xl bg-[#ff6a3d] hover:bg-[#ff7b50] text-[#0c0c0e] text-xs font-semibold transition-all flex items-center gap-2 disabled:opacity-40"
                >
                  {outlierDetecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span>Scan & Detect Outliers</span>
                </button>
              </div>

              {/* Detection Results Box */}
              {outlierDetectRes && (
                <div className="p-5 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)] space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <span>Detection Summary for <strong className="text-[#ff6a3d]">{outlierDetectRes.column}</strong></span>
                        <span className="px-2 py-0.5 rounded-full bg-white/5 text-xs font-mono text-slate-300 uppercase">
                          {outlierDetectRes.method}
                        </span>
                      </div>
                      <p className="text-xs text-[#8a8a86] mt-1">
                        Found <strong className="text-amber-400">{outlierDetectRes.outlier_count}</strong> outlier(s) out of{' '}
                        {outlierDetectRes.total_rows} total rows ({outlierDetectRes.percentage}% of data)
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={outlierAction}
                        onChange={(e) => setOutlierAction(e.target.value as 'remove' | 'cap' | 'keep')}
                        className="bg-white/5 border border-[rgba(255,255,255,0.1)] text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-[#ff6a3d]"
                      >
                        <option value="remove" className="bg-[#0c0c0e]">Action: Remove Outlier Rows</option>
                        <option value="cap" className="bg-[#0c0c0e]">Action: Cap at Lower/Upper Bounds</option>
                        <option value="keep" className="bg-[#0c0c0e]">Action: Keep (Flag only)</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleOutlierAction(true)}
                        disabled={outlierApplying}
                        className="px-4 py-2 rounded-xl border border-[rgba(255,255,255,0.15)] hover:bg-white/5 text-[#f2f2f0] text-xs font-medium transition-all"
                      >
                        Preview Action
                      </button>
                    </div>
                  </div>

                  {outlierDetectRes.sample_outliers.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-[#8a8a86]">Sample Flagged Outliers (first 20):</div>
                      <div className="flex flex-wrap gap-2">
                        {outlierDetectRes.sample_outliers.map((s) => (
                          <div key={s.index} className="px-2.5 py-1 rounded-lg bg-white/5 border border-[rgba(255,255,255,0.06)] text-xs font-mono text-slate-300">
                            Row #{s.index}: <strong className="text-amber-300">{s.value}</strong>
                            {s.zscore !== undefined && s.zscore !== null && (
                              <span className="text-[#8a8a86] text-[10px] ml-1">(z: {s.zscore.toFixed(1)})</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Preview Box: Orange Tinted */}
                  {outlierPreview && (
                    <div className="preview-box-orange p-4 space-y-3">
                      <div className="text-xs text-slate-200">
                        <strong>Preview:</strong> {outlierPreview.after_summary}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOutlierAction(false)}
                        disabled={outlierApplying}
                        className="px-4 py-2 rounded-xl bg-[#ff6a3d] hover:bg-[#ff7b50] text-[#0c0c0e] text-xs font-bold transition-all flex items-center gap-2"
                      >
                        {outlierApplying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span>Approve & Apply Action</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {outlierResult && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                  {outlierResult}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* OPERATION LOG */}
      {opLog.length > 0 && (
        <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-white/[0.03] overflow-hidden">
          <div className="p-5 border-b border-[rgba(255,255,255,0.08)] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white">Recent Operations History</h2>
              <p className="text-xs text-[#8a8a86] mt-0.5">{opLog.length} cleaning operation(s) logged</p>
            </div>
            <button
              onClick={handleRollback}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-[rgba(255,255,255,0.15)] hover:bg-white/5 text-[#f2f2f0] text-xs font-medium transition-colors"
            >
              <Undo2 className="w-3 h-3" />
              <span>Rollback Last</span>
            </button>
          </div>
          <div className="divide-y divide-[rgba(255,255,255,0.06)] max-h-48 overflow-y-auto">
            {opLog.slice().reverse().map((entry, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-[#ff6a3d]" />
                  <div>
                    <span className="font-semibold text-slate-200 capitalize">
                      {entry.operation.replace('clean_', '').replace('column_', '').replace('_', ' ')}
                    </span>
                    {entry.column && (
                      <span className="text-[#8a8a86] ml-1.5">
                        on <span className="text-slate-300 font-mono">{entry.column}</span>
                      </span>
                    )}
                    {entry.method && (
                      <span className="text-[#7a7a75] ml-1.5">({entry.method})</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[#8a8a86] font-mono">{entry.affected_rows} rows</span>
                  <span className="text-[10px] text-[#7a7a75]">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LIVE DATASET TABLE WITH AFFECTED CELL HIGHLIGHTING */}
      {activeDatasetId && (
        <div className="space-y-3 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Live Dataset Preview</h2>
              <p className="text-xs text-[#8a8a86] mt-0.5">
                Yellow cells highlight missing/null data. Blue cells highlight recently modified columns.
              </p>
            </div>
          </div>
          <DataTable
            datasetId={activeDatasetId}
            operationLog={opLog}
            refreshKey={opLog.length}
          />
        </div>
      )}
    </div>
  );
}

export default Cleaning;
