import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Upload, X, FileAudio, CheckCircle, AlertTriangle,
  ExternalLink, FolderOpen, Loader2, Music
} from 'lucide-react';

export default function TrainPage({ api, addToast }) {
  const [files, setFiles] = useState([]);
  const [preparing, setPreparing] = useState(false);
  const [prepResult, setPrepResult] = useState(null);
  const [currentFile, setCurrentFile] = useState('');
  const dropRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter(
      f => f.type.startsWith('audio/') || f.name.match(/\.(mp3|wav|m4a|flac|ogg)$/i)
    );
    setFiles(prev => [...prev, ...dropped]);
  }, []);

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files);
    setFiles(prev => [...prev, ...selected]);
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handlePrepare = async () => {
    if (files.length === 0) return;
    setPreparing(true);
    setPrepResult(null);

    const formData = new FormData();
    files.forEach(f => formData.append('source_files', f));

    try {
      const res = await axios.post(`${api}/training/prepare`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000,
      });
      setPrepResult(res.data);
      addToast(`Prepared ${res.data.prepared_files.length} vocal files`, 'success');
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      addToast(`Preparation failed: ${msg}`, 'error');
    } finally {
      setPreparing(false);
      setCurrentFile('');
    }
  };

  const formatDuration = (minutes) => {
    if (minutes < 1) return '< 1 minute';
    const m = Math.floor(minutes);
    const s = Math.round((minutes - m) * 60);
    return `${m}m ${s}s`;
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Train a Voice</h1>
      <p className="text-forge-text-secondary mb-8">
        Upload MP3s of your target singer, extract clean vocals, then train on Google Colab.
      </p>

      {/* ── Section 1: Upload & Prepare ── */}
      <div className="bg-forge-card border border-forge-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-1">1. Upload Training Audio</h2>
        <p className="text-sm text-forge-text-secondary mb-4">
          Upload 5-20 minutes of audio for best results. Full songs with music are fine —
          we'll extract the vocals automatically.
        </p>

        {/* Dropzone */}
        <div
          ref={dropRef}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onDragEnter={() => dropRef.current?.classList.add('active')}
          onDragLeave={() => dropRef.current?.classList.remove('active')}
          className="dropzone mb-4"
        >
          <Upload className="mx-auto mb-3 text-forge-text-secondary" size={32} />
          <p className="text-forge-text font-medium">Drop MP3 files here</p>
          <p className="text-sm text-forge-text-secondary mt-1">or click to browse</p>
          <input
            type="file"
            multiple
            accept=".mp3,.wav,.m4a,.flac,.ogg"
            onChange={handleFileSelect}
            className="hidden"
            id="train-file-input"
          />
          <button
            onClick={() => document.getElementById('train-file-input').click()}
            className="mt-3 px-4 py-2 bg-forge-accent text-white rounded-lg text-sm font-medium
                       hover:bg-forge-accent-hover transition-colors"
          >
            Select Files
          </button>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-sm text-forge-text-secondary">{files.length} file(s) selected</p>
            {files.map((f, i) => (
              <div key={i}
                   className="flex items-center justify-between bg-forge-input rounded-lg px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <FileAudio size={16} className="text-forge-accent" />
                  <span className="text-sm">{f.name}</span>
                  <span className="text-xs text-forge-text-secondary">
                    {(f.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
                <button onClick={() => removeFile(i)}
                        className="text-forge-text-secondary hover:text-forge-error transition-colors">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Prepare button */}
        <button
          onClick={handlePrepare}
          disabled={files.length === 0 || preparing}
          className="w-full py-3 bg-forge-accent text-white rounded-lg font-medium
                     hover:bg-forge-accent-hover disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-200 flex items-center justify-center gap-2"
        >
          {preparing ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              {currentFile ? `Extracting: ${currentFile}` : 'Preparing vocals...'}
            </>
          ) : (
            <>
              <Music size={18} />
              Prepare Vocals
            </>
          )}
        </button>
      </div>

      {/* Preparation results */}
      {prepResult && (
        <div className="bg-forge-card border border-forge-border rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Preparation Complete</h2>

          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl font-bold text-forge-accent">
              {prepResult.total_duration_minutes.toFixed(1)}
            </span>
            <span className="text-forge-text-secondary">minutes of clean vocals</span>
          </div>

          {prepResult.ready_for_training ? (
            <div className="flex items-center gap-2 text-forge-success mb-4">
              <CheckCircle size={18} />
              <span className="font-medium">Ready for training! Sufficient vocal data.</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-yellow-500 mb-4">
              <AlertTriangle size={18} />
              <span className="font-medium">More data recommended. Aim for 5+ minutes.</span>
            </div>
          )}

          {prepResult.prepared_files.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-forge-text-secondary mb-2">Extracted vocal files:</p>
              <div className="space-y-1">
                {prepResult.prepared_files.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-forge-text-secondary">
                    <CheckCircle size={12} className="text-forge-success" />
                    <span className="truncate">{p}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {prepResult.errors?.length > 0 && (
            <div className="mt-4 p-3 bg-forge-error/10 border border-forge-error/30 rounded-lg">
              <p className="text-sm font-medium text-forge-error mb-1">Errors:</p>
              {prepResult.errors.map((e, i) => (
                <p key={i} className="text-xs text-forge-text-secondary">{e}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Section 2: Colab Training ── */}
      <div className="bg-forge-card border border-forge-border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-1">2. Train on Google Colab</h2>
        <p className="text-sm text-forge-text-secondary mb-4">
          Your vocals are ready. Now train the RVC model on Google Colab's free GPU.
          This takes 30-60 minutes.
        </p>

        <div className="bg-forge-input border border-forge-border rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-yellow-500 mt-0.5 shrink-0" />
            <div className="text-sm text-forge-text-secondary">
              <p className="mb-2">
                After training completes on Colab, download the <code className="text-forge-accent bg-forge-bg px-1 rounded">.pth</code> and{' '}
                <code className="text-forge-accent bg-forge-bg px-1 rounded">.index</code> files.
              </p>
              <p>
                Drop them into your models folder and they'll appear in the app automatically.
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => window.open(
              'https://colab.research.google.com/github/RVC-Project/Retrieval-based-Voice-Conversion-WebUI/blob/main/Colab_train.ipynb',
              '_blank'
            )}
            className="flex-1 py-3 bg-forge-accent text-white rounded-lg font-medium
                       hover:bg-forge-accent-hover transition-colors flex items-center justify-center gap-2"
          >
            <ExternalLink size={18} />
            Open Training Notebook
          </button>

          <button
            onClick={() => window.electronAPI?.openModelsFolder()}
            className="flex-1 py-3 bg-forge-input border border-forge-border text-forge-text
                       rounded-lg font-medium hover:bg-forge-border/50 transition-colors
                       flex items-center justify-center gap-2"
          >
            <FolderOpen size={18} />
            Open Models Folder
          </button>
        </div>
      </div>
    </div>
  );
}
