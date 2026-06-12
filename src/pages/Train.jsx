import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Upload, X, FileAudio, CheckCircle, AlertTriangle,
  ExternalLink, Loader2, Music, Download,
  Package, Cloud, Copy
} from 'lucide-react';

export default function TrainPage({ api, addToast }) {
  const [files, setFiles] = useState([]);
  const [preparing, setPreparing] = useState(false);
  const [hasBackgroundMusic, setHasBackgroundMusic] = useState(true);
  const [prepResult, setPrepResult] = useState(null);
  const [currentFile, setCurrentFile] = useState('');
  const [packaging, setPackaging] = useState(false);
  const [colabPackage, setColabPackage] = useState(null);
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
    formData.append('has_background_music', hasBackgroundMusic);

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

  const handlePackage = async () => {
    setPackaging(true);
    try {
      const res = await axios.post(`${api}/training/package`, {}, { timeout: 30000 });
      setColabPackage(res.data);
      addToast('Training package created!', 'success');
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      addToast(`Packaging failed: ${msg}`, 'error');
    } finally {
      setPackaging(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    addToast('Copied to clipboard', 'info');
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
          Upload 5-20 minutes of audio for best results.
        </p>

        {/* Audio source toggle */}
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => setHasBackgroundMusic(true)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border ${
              hasBackgroundMusic
                ? 'bg-forge-accent/10 border-forge-accent text-forge-accent'
                : 'bg-forge-input border-forge-border text-forge-text-secondary hover:border-forge-border/70'
            }`}
          >
            <span className="block text-xs opacity-70 mb-0.5">Source</span>
            Full songs with music
          </button>
          <button
            onClick={() => setHasBackgroundMusic(false)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border ${
              !hasBackgroundMusic
                ? 'bg-forge-accent/10 border-forge-accent text-forge-accent'
                : 'bg-forge-input border-forge-border text-forge-text-secondary hover:border-forge-border/70'
            }`}
          >
            <span className="block text-xs opacity-70 mb-0.5">Source</span>
            Clean vocals only
          </button>
        </div>
        {hasBackgroundMusic ? (
          <p className="text-xs text-forge-text-secondary mb-3 flex items-center gap-1">
            <Music size={12} /> Demucs will strip background music — takes 2-5 min per song on CPU
          </p>
        ) : (
          <p className="text-xs text-forge-success mb-3 flex items-center gap-1">
            <CheckCircle size={12} /> No separation needed — files used as-is, instant processing
          </p>
        )}

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

      {/* ── Section 2: Package for Colab ── */}
      {prepResult && (
        <div className="bg-forge-card border border-forge-border rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-1">2. Package for Colab</h2>
          <p className="text-sm text-forge-text-secondary mb-4">
            Package your vocal data into a zip file, upload to Google Drive, then train
            with one click — no manual cell-by-cell execution.
          </p>

          {/* Package button */}
          <button
            onClick={handlePackage}
            disabled={packaging}
            className="w-full py-3 bg-forge-accent text-white rounded-lg font-medium
                       hover:bg-forge-accent-hover disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 flex items-center justify-center gap-2 mb-4"
          >
            {packaging ? (
              <><Loader2 size={18} className="animate-spin" /> Packaging...</>
            ) : (
              <><Package size={18} /> Package for Colab</>
            )}
          </button>

          {/* Package result */}
          {colabPackage && (
            <div className="space-y-4">
              <div className="bg-forge-input border border-forge-border rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xl font-bold text-forge-accent">{colabPackage.total_files}</p>
                    <p className="text-xs text-forge-text-secondary">Vocal files</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-forge-accent">{colabPackage.total_size_mb.toFixed(1)}</p>
                    <p className="text-xs text-forge-text-secondary">MB</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-forge-accent">{colabPackage.total_duration_minutes.toFixed(1)}</p>
                    <p className="text-xs text-forge-text-secondary">Minutes</p>
                  </div>
                </div>
              </div>

              {/* Download zip */}
              <div className="flex gap-2">
                <a
                  href={`${api}/training/package/download`}
                  download
                  className="flex-1 py-2.5 bg-forge-input border border-forge-border text-forge-text
                             rounded-lg text-sm font-medium hover:bg-forge-border/50 transition-colors
                             flex items-center justify-center gap-2"
                >
                  <Download size={16} />
                  Download .zip
                </a>
              </div>

              {/* Step-by-step instructions */}
              <div className="bg-forge-border/20 border border-forge-border rounded-lg p-4">
                <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                  <Cloud size={16} className="text-forge-accent" />
                  Upload to Google Drive
                </h3>
                <ol className="text-sm text-forge-text-secondary space-y-2 list-decimal list-inside">
                  <li>
                    Upload the zip to
                    {' '}<a href="https://drive.google.com" target="_blank"
                           className="text-forge-accent hover:underline" rel="noreferrer">Google Drive</a>
                  </li>
                  <li>
                    Right-click the file → <span className="text-forge-text font-medium">Share</span> →
                    <span className="text-forge-text font-medium"> General access → Anyone with the link</span>
                  </li>
                  <li>
                    Copy the file ID from the link:
                    <br />
                    <code className="text-xs bg-forge-bg px-2 py-1 rounded mt-1 block break-all">
                      drive.google.com/file/d/<span className="text-forge-accent">FILE_ID</span>/view
                    </code>
                  </li>
                  <li>
                    Click <span className="text-forge-text font-medium">Open Custom Notebook</span> below
                  </li>
                  <li>
                    In Colab: paste FILE_ID + set model name →
                    <span className="text-forge-text font-medium"> Runtime → Run all</span>
                  </li>
                </ol>
              </div>

              {/* Colab + models buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => window.open(colabPackage.colab_url, '_blank')}
                  className="flex-1 py-3 bg-forge-accent text-white rounded-lg font-medium
                             hover:bg-forge-accent-hover transition-colors flex items-center justify-center gap-2"
                >
                  <ExternalLink size={18} />
                  Open Custom Notebook
                </button>
              </div>

              <div className="bg-forge-input border border-forge-border rounded-lg p-3 mt-3">
                <p className="text-xs text-forge-text-secondary">
                  After training on Colab, download your <span className="text-forge-accent font-mono">.pth</span> and
                  <span className="text-forge-accent font-mono"> .index</span> files.
                  Drop them into the <span className="text-forge-text font-mono text-[10px]">/models</span> folder
                  inside your VoiceForge directory. Then go to the Models page and click Refresh.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Section 3: Legacy / Manual Colab ── */}
      <div className="bg-forge-card border border-forge-border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-1">3. Manual Training (Alternative)</h2>
        <p className="text-sm text-forge-text-secondary mb-4">
          Prefer the standard RVC Colab notebook? Open it directly and run cells manually.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => window.open(
              'https://colab.research.google.com/github/RVC-Project/Retrieval-based-Voice-Conversion-WebUI/blob/main/Retrieval_based_Voice_Conversion_WebUI_v2.ipynb',
              '_blank'
            )}
            className="flex-1 py-3 bg-forge-input border border-forge-border text-forge-text
                       rounded-lg text-sm font-medium hover:bg-forge-border/50 transition-colors
                       flex items-center justify-center gap-2"
          >
            <ExternalLink size={16} />
            Standard RVC Notebook
          </button>
        </div>
        <p className="text-xs text-forge-text-secondary mt-3 text-center">
          After training, download .pth + .index from Google Drive and drop into
          the <span className="text-forge-text font-mono text-[10px]">/models</span> folder.
        </p>
      </div>
    </div>
  );
}
