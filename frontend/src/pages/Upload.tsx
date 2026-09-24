import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  X,
  ArrowRight,
  ShieldCheck,
  FileCode,
} from 'lucide-react';
import { uploadDataset, saveRecentDataset } from '../services/api';

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const ALLOWED_EXTENSIONS = ['.csv', '.tsv', '.xlsx', '.xls'];

export function Upload() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);

  const validateFile = (file: File): string | null => {
    const name = file.name.toLowerCase();
    const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
    if (!hasValidExt) {
      return `Unsupported file format. Please upload a ${ALLOWED_EXTENSIONS.join(', ')} file.`;
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `File exceeds maximum allowed size of 50MB (${(file.size / (1024 * 1024)).toFixed(1)}MB).`;
    }
    return null;
  };

  const handleFile = async (file: File) => {
    setError(null);
    const validationError = validateFile(file);
    if (validationError) {
      setError({ message: validationError });
      return;
    }

    setSelectedFile(file);
    setUploading(true);
    setProgress(15);
    setStatusMessage('Reading and transferring file...');

    try {
      const response = await uploadDataset(file, (pct) => {
        setProgress(pct);
        if (pct >= 85) {
          setStatusMessage('Validating magic bytes & parsing tabular data...');
        }
      });

      setProgress(100);
      setStatusMessage('Dataset parsed! Opening Dataset Explorer...');

      // Save to recent datasets in localStorage
      saveRecentDataset({
        dataset_id: response.dataset_id,
        filename: response.filename,
        row_count: response.row_count,
        column_count: response.column_count,
        file_size_bytes: response.file_size_bytes,
        uploaded_at: response.created_at,
      });

      // Brief pause so user sees 100% completion before redirection
      setTimeout(() => {
        navigate(`/dataset?id=${encodeURIComponent(response.dataset_id)}`);
      }, 700);
    } catch (err: any) {
      setUploading(false);
      setProgress(0);
      setStatusMessage('');
      setError({
        code: err.code || 'UPLOAD_FAILED',
        message: err.message || 'File upload failed. Please verify file integrity and try again.',
      });
    }
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#ff6a3d]/10 border border-[#ff6a3d]/25 text-[#ffb08a] text-xs font-semibold mb-3">
          <FileCode className="w-3.5 h-3.5 text-[#ff6a3d]" />
          <span>Step 1: Dataset Ingestion</span>
        </div>
        <h1 className="animate-hero-blur-in text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
          Upload Dataset
        </h1>
        <p className="text-[#8a8a86] text-sm mt-2 max-w-2xl leading-relaxed">
          Upload your tabular data to begin an auditable cleaning session. File contents are verified via
          magic-byte inspection to ensure schema integrity before loading into memory.
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-[14px] bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">Upload Rejected</p>
              <p className="text-xs text-rose-300/90 mt-0.5">{error.message}</p>
              {error.code && (
                <span className="inline-block mt-2 font-mono text-[10px] uppercase px-2 py-0.5 rounded bg-rose-950/60 border border-rose-800 text-rose-400">
                  Code: {error.code}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setError(null)}
            className="p-1 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-500/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Drag & Drop Zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`relative group rounded-[14px] border-2 border-dashed transition-all duration-200 p-12 text-center cursor-pointer overflow-hidden ${
          isDragging
            ? 'border-[#ff6a3d] bg-[#ff6a3d]/10 scale-[1.01]'
            : 'border-[rgba(255,255,255,0.08)] hover:border-[#ff6a3d]/50 bg-white/[0.02] hover:bg-white/[0.04]'
        } ${uploading ? 'pointer-events-none opacity-80' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.xlsx,.xls"
          onChange={onFileInputChange}
          className="hidden"
        />

        <div className="relative z-10 max-w-md mx-auto space-y-5">
          {/* Icon */}
          <div className="w-20 h-20 rounded-2xl bg-[#ff6a3d]/10 text-[#ff6a3d] mx-auto flex items-center justify-center border border-[#ff6a3d]/25 shadow-xl group-hover:scale-105 transition-transform">
            <UploadCloud className="w-10 h-10" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">
              {isDragging ? 'Drop file to upload' : 'Drag & drop dataset, or click to browse'}
            </h3>
            <p className="text-xs text-[#8a8a86] mt-1.5 leading-relaxed">
              Accepts <span className="text-[#f2f2f0] font-medium">.csv, .xlsx, .xls, .tsv</span> up to{' '}
              <span className="text-[#f2f2f0] font-medium">50MB</span>
            </p>
          </div>

          {/* Action button */}
          <div>
            <button
              type="button"
              disabled={uploading}
              className="btn-primary inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold"
            >
              <span>Choose File from Computer</span>
              <ArrowRight className="w-4 h-4 ml-0.5" />
            </button>
          </div>
        </div>

        {/* Upload Progress Bar */}
        {uploading && (
          <div className="mt-8 max-w-md mx-auto p-4 rounded-xl bg-[#0c0c0e] border border-[rgba(255,255,255,0.08)] shadow-2xl space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-300 truncate font-medium">
                <FileSpreadsheet className="w-4 h-4 text-[#ff6a3d] shrink-0" />
                <span className="truncate">{selectedFile?.name}</span>
              </div>
              <span className="font-mono text-[#ff6a3d] font-semibold">{progress}%</span>
            </div>

            <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full bg-[#ff6a3d] transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            <p className="text-[11px] text-[#8a8a86] text-left animate-pulse">
              {statusMessage || 'Processing dataset...'}
            </p>
          </div>
        )}
      </div>

      {/* Safety & Session Information */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-[14px] bg-white/[0.03] border border-[rgba(255,255,255,0.08)] flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-semibold text-[#f2f2f0]">Content-Inspected Parsing</p>
            <p className="text-[#8a8a86] leading-relaxed">
              Files are parsed with fallback encoding and magic-byte signature validation. No files are accepted on file extension alone.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-[14px] bg-white/[0.03] border border-[rgba(255,255,255,0.08)] flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-[#ff6a3d] shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-semibold text-[#f2f2f0]">24-Hour In-Memory Session</p>
            <p className="text-[#8a8a86] leading-relaxed">
              Your dataset is held in an active pandas DataFrame session with automatic TTL cleanup after 24h of inactivity.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
