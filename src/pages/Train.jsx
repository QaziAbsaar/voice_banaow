import React, { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import {
  Upload, X, FileAudio, CheckCircle, AlertTriangle,
  ExternalLink, Loader2, Music, Download,
  Cloud, LogIn, RefreshCw, ChevronRight, User,
} from 'lucide-react';

export default function TrainPage({ api, addToast }) {
  const [files, setFiles] = useState([]);
  const [modelName, setModelName] = useState('');
  const [hasBackgroundMusic, setHasBackgroundMusic] = useState(true);
  const [step, setStep] = useState('upload'); // upload | drive-auth | training | colab | import | done

  const [preparing, setPreparing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [trainResult, setTrainResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [driveStatus, setDriveStatus] = useState(null); // null | true | false

  const dropRef = useRef(null);

  // Check Drive auth on mount
  useEffect(() => {
    axios.get(`${api}/auth/google/status`, { timeout: 5000 })
      .then(r => setDriveStatus(r.data.authenticated))
      .catch(() => setDriveStatus(false));
  }, [api]);

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

  const handleStartTraining = async () => {
    if (files.length === 0) return;
    const finalName = modelName.trim() || `model_${Date.now().toString(36)}`;

    // Step 1 — Check Drive auth
    if (!driveStatus) {
      setStep('drive-auth');
      return;
    }

    setStep('training');
    setPreparing(true);
    setProgressMsg('Uploading files...');
    setTrainResult(null);
    setImportResult(null);

    const formData = new FormData();
    files.forEach(f => formData.append('source_files', f));
    formData.append('model_name', finalName);
    formData.append('has_background_music', hasBackgroundMusic);

    try {
      // Kick off background training — get task_id immediately (short timeout)
      const res = await axios.post(`${api}/training/start`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000, // just needs to upload files, not whole pipeline
      });
      const taskId = res.data.task_id;

      // Poll for completion
      const poll = async () => {
        try {
          const pollRes = await axios.get(`${api}/training/start/status/${taskId}`, { timeout: 5000 });
          const { status, progress, result, error } = pollRes.data;

          if (progress) setProgressMsg(progress);

          if (status === 'done') {
            setTrainResult(result);
            setStep('colab');
            addToast('Data uploaded to Drive! Open Colab to train.', 'success');
            setPreparing(false);
            return;
          }
          if (status === 'error') {
            addToast(`Training failed: ${error}`, 'error');
            setStep('upload');
            setPreparing(false);
            return;
          }
          // Still processing — poll again
          setTimeout(poll, 2000);
        } catch (err) {
          addToast(`Status check failed: ${err.message}`, 'error');
          setStep('upload');
          setPreparing(false);
        }
      };
      setTimeout(poll, 2000);

    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      addToast(`Training setup failed: ${msg}`, 'error');
      if (err.response?.status === 401) {
        setStep('drive-auth');
      } else {
        setStep('upload');
      }
      setPreparing(false);
    }
  };

  const handleGoogleAuth = () => {
    axios.get(`${api}/auth/google/url`, { timeout: 5000 })
      .then(r => {
        window.location.href = r.data.url;
      })
      .catch(err => {
        addToast(`Failed to get auth URL: ${err.message}`, 'error');
      });
  };

  const handleImportModel = async () => {
    if (!trainResult?.model_name) return;
    setImporting(true);
    setProgressMsg('Checking Google Drive for trained model...');

    try {
      const res = await axios.post(`${api}/training/import-model`,
        new URLSearchParams({ model_name: trainResult.model_name }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 }
      );
      setImportResult(res.data);
      setStep('done');
      addToast(`Model "${res.data.model_name}" imported!`, 'success');
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      if (err.response?.status === 404) {
        addToast('Training not finished yet. Open Colab and check if it completed.', 'info');
      } else {
        addToast(`Import failed: ${msg}`, 'error');
      }
    } finally {
      setImporting(false);
    }
  };

  const handleNewTraining = () => {
    setFiles([]);
    setModelName('');
    setTrainResult(null);
    setImportResult(null);
    setStep('upload');
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Train a Voice</h1>
      <p className="text-forge-text-secondary mb-8">
        Upload a voice — we handle the rest. Your audio goes to Google Drive, trains on Colab (free GPU),
        then comes back as a model ready to use.
      </p>

      {/* ── Step indicator ── */}
      <div className="flex items-center gap-2 mb-8 text-sm">
        {['upload', 'drive-auth', 'colab', 'done'].map((s, i) => (
          <React.Fragment key={s}>
            {i > 0 && <ChevronRight size={14} className="text-forge-border" />}
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              step === s ? 'bg-forge-accent/20 text-forge-accent border border-forge-accent/50'
              : ['done', 'colab'].includes(step) && ['upload', 'drive-auth'].includes(s)
                ? 'text-forge-success'
                : 'text-forge-text-secondary'
            }`}>
              {s === 'upload' ? '1. Upload' : s === 'drive-auth' ? '2. Connect' : s === 'colab' ? '3. Train' : '4. Done'}
            </span>
          </React.Fragment>
        ))}
      </div>

      {/* ── STEP: Upload ── */}
      {step === 'upload' && (
        <>
          {/* Upload + Model Name form */}
          <div className="bg-forge-card border border-forge-border rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Upload Voice &amp; Name Your Model</h2>

            {/* Model name input */}
            <div className="mb-4">
              <label className="block text-sm text-forge-text-secondary mb-1.5">Model Name</label>
              <input
                type="text"
                value={modelName}
                onChange={e => setModelName(e.target.value)}
                placeholder="e.g. Taylor Swift, My Voice, etc."
                className="w-full bg-forge-input border border-forge-border rounded-lg px-3 py-2.5
                           text-forge-text placeholder:text-forge-text-secondary/50
                           focus:outline-none focus:border-forge-accent transition-colors"
              />
            </div>

            {/* Audio source toggle */}
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => setHasBackgroundMusic(true)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                  hasBackgroundMusic
                    ? 'bg-forge-accent/10 border-forge-accent text-forge-accent'
                    : 'bg-forge-input border-forge-border text-forge-text-secondary'
                }`}
              >
                <span className="block text-xs opacity-70 mb-0.5">Source</span>
                Full songs (has music)
              </button>
              <button
                onClick={() => setHasBackgroundMusic(false)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                  !hasBackgroundMusic
                    ? 'bg-forge-accent/10 border-forge-accent text-forge-accent'
                    : 'bg-forge-input border-forge-border text-forge-text-secondary'
                }`}
              >
                <span className="block text-xs opacity-70 mb-0.5">Source</span>
                Clean vocals only
              </button>
            </div>
            {hasBackgroundMusic ? (
              <p className="text-xs text-forge-text-secondary mb-3 flex items-center gap-1">
                <Music size={12} /> Demucs strips background music — ~2-5 min per song on CPU
              </p>
            ) : (
              <p className="text-xs text-forge-success mb-3 flex items-center gap-1">
                <CheckCircle size={12} /> No separation needed — instant processing
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
              <p className="text-forge-text font-medium">Drop audio files here</p>
              <p className="text-sm text-forge-text-secondary mt-1">MP3, WAV, M4A — 5-20 min total recommended</p>
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
                <p className="text-sm text-forge-text-secondary">{files.length} file(s)</p>
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

            {/* Start Training button */}
            <button
              onClick={handleStartTraining}
              disabled={files.length === 0}
              className="w-full py-3 bg-forge-accent text-white rounded-lg font-medium
                         hover:bg-forge-accent-hover disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200 flex items-center justify-center gap-2 text-base"
            >
              <Cloud size={20} />
              Start Training
            </button>
            <p className="text-xs text-forge-text-secondary text-center mt-2">
              Audio is packaged and uploaded to Google Drive, then trains on Colab's free GPU
            </p>
          </div>

          {/* Manual alternative (collapsed) */}
          <details className="bg-forge-card border border-forge-border rounded-xl p-4">
            <summary className="text-sm text-forge-text-secondary cursor-pointer hover:text-forge-text font-medium">
              Advanced: Manual Colab training
            </summary>
            <p className="text-xs text-forge-text-secondary mt-3">
              Prefer the standard RVC Colab notebook?
              {' '}
              <button
                onClick={() => window.open(
                  'https://colab.research.google.com/github/RVC-Project/Retrieval-based-Voice-Conversion-WebUI/blob/main/Retrieval_based_Voice_Conversion_WebUI_v2.ipynb',
                  '_blank'
                )}
                className="text-forge-accent hover:underline"
              >
                Open Standard RVC Notebook
              </button>
              — requires manual file uploads and cell-by-cell execution.
            </p>
          </details>
        </>
      )}

      {/* ── STEP: Drive Auth ── */}
      {step === 'drive-auth' && (
        <div className="bg-forge-card border border-forge-border rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-forge-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Cloud size={32} className="text-forge-accent" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Connect Google Drive</h2>
          <p className="text-forge-text-secondary mb-2 max-w-md mx-auto">
            VoiceForge needs access to your Google Drive to:
          </p>
          <ul className="text-sm text-forge-text-secondary text-left max-w-sm mx-auto mb-6 space-y-1.5">
            <li className="flex items-start gap-2">
              <CheckCircle size={14} className="text-forge-success shrink-0 mt-0.5" />
              Upload your voice data for Colab training
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle size={14} className="text-forge-success shrink-0 mt-0.5" />
              Download the trained model back to VoiceForge
            </li>
          </ul>
          <button
            onClick={handleGoogleAuth}
            className="px-8 py-3 bg-white text-gray-900 rounded-lg font-medium
                       hover:bg-gray-100 transition-colors flex items-center justify-center gap-2 mx-auto
                       shadow-lg"
          >
            <LogIn size={18} />
            Sign in with Google
          </button>
          <p className="text-xs text-forge-text-secondary mt-4">
            Only accesses VoiceForge folder — not your entire Drive. Cancel anytime.
          </p>
          <button
            onClick={() => setStep('upload')}
            className="text-sm text-forge-text-secondary hover:text-forge-text mt-4 underline"
          >
            Back to upload
          </button>
        </div>
      )}

      {/* ── STEP: Training in progress ── */}
      {step === 'training' && (
        <div className="bg-forge-card border border-forge-border rounded-xl p-8 text-center">
          <Loader2 size={40} className="animate-spin text-forge-accent mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Preparing Your Data</h2>
          <p className="text-forge-text-secondary mb-2">{progressMsg}</p>
          <div className="max-w-xs mx-auto">
            <div className="h-1.5 bg-forge-input rounded-full overflow-hidden">
              <div className="h-full bg-forge-accent rounded-full animate-pulse"
                   style={{ width: '60%' }} />
            </div>
          </div>
          <p className="text-xs text-forge-text-secondary mt-4">
            This may take several minutes — models directory is not needed
          </p>
        </div>
      )}

      {/* ── STEP: Colab training ── */}
      {step === 'colab' && trainResult && (
        <>
          <div className="bg-forge-card border border-forge-border rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CheckCircle size={20} className="text-forge-success" />
              Data Uploaded!
            </h2>

            <div className="bg-forge-input border border-forge-border rounded-lg p-4 mb-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xl font-bold text-forge-accent">{trainResult.total_duration_minutes.toFixed(1)}</p>
                  <p className="text-xs text-forge-text-secondary">Minutes</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-forge-accent">{trainResult.total_size_mb.toFixed(1)}</p>
                  <p className="text-xs text-forge-text-secondary">MB</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-forge-accent">{trainResult.prepared_files}</p>
                  <p className="text-xs text-forge-text-secondary">Files</p>
                </div>
              </div>
            </div>

            {/* Open Colab */}
            <div className="bg-forge-accent/5 border border-forge-accent/20 rounded-lg p-5 mb-4">
              <h3 className="font-semibold mb-2 text-sm">Step 1: Start Colab Training</h3>
              <p className="text-sm text-forge-text-secondary mb-4">
                Click the button below to open Google Colab. It auto-detects your model <strong>"{trainResult.model_name}"</strong> from Drive.
                Just click <strong>Runtime → Run all</strong> (takes 30-60 minutes on a T4 GPU).
              </p>
              <button
                onClick={() => window.open(trainResult.colab_url, '_blank')}
                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium
                           transition-colors flex items-center justify-center gap-2"
              >
                <ExternalLink size={18} />
                Open Colab — "{trainResult.model_name}"
              </button>
              <p className="text-xs text-forge-text-secondary mt-2 flex items-center gap-1">
                <AlertTriangle size={12} className="text-yellow-500" />
                In Colab: Runtime → Change runtime type → T4 GPU (if not selected)
              </p>
            </div>

            {/* Import model */}
            <div className="bg-forge-input border border-forge-border rounded-lg p-5">
              <h3 className="font-semibold mb-2 text-sm">Step 2: Import Trained Model</h3>
              <p className="text-sm text-forge-text-secondary mb-4">
                Once training is done in Colab, click here to download the model from Drive.
              </p>
              <button
                onClick={handleImportModel}
                disabled={importing}
                className="w-full py-3 bg-forge-accent text-white rounded-lg font-medium
                           hover:bg-forge-accent-hover disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all flex items-center justify-center gap-2"
              >
                {importing ? (
                  <><Loader2 size={18} className="animate-spin" /> Checking Drive...</>
                ) : (
                  <><Download size={18} /> Import Model from Drive</>
                )}
              </button>
            </div>
          </div>

          <button
            onClick={handleNewTraining}
            className="text-sm text-forge-text-secondary hover:text-forge-text underline block mx-auto"
          >
            Start new training
          </button>
        </>
      )}

      {/* ── STEP: Done ── */}
      {step === 'done' && importResult && (
        <div className="bg-forge-card border border-forge-border rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-forge-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-forge-success" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Model Ready!</h2>
          <p className="text-forge-text-secondary mb-6">
            <strong className="text-forge-text">{importResult.model_name}</strong> is now available
            on Convert and TTS pages.
          </p>

          <div className="bg-forge-input border border-forge-border rounded-lg p-4 mb-6 max-w-sm mx-auto">
            <p className="text-sm text-forge-text-secondary">Imported files:</p>
            {importResult.imported?.map((f, i) => (
              <p key={i} className="text-sm text-forge-text font-mono mt-1">{f}</p>
            ))}
          </div>

          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.href = '/convert'}
              className="px-6 py-3 bg-forge-accent text-white rounded-lg font-medium
                         hover:bg-forge-accent-hover transition-colors"
            >
              Go to Convert
            </button>
            <button
              onClick={handleNewTraining}
              className="px-6 py-3 bg-forge-input border border-forge-border text-forge-text rounded-lg font-medium
                         hover:bg-forge-border/50 transition-colors"
            >
              Train Another
            </button>
          </div>
        </div>
      )}

      {/* ── Import progress overlay (during import check) ── */}
      {step === 'colab' && importing && (
        <div className="bg-forge-card border border-forge-border rounded-xl p-6 text-center mt-4">
          <Loader2 size={28} className="animate-spin text-forge-accent mx-auto mb-3" />
          <p className="text-sm text-forge-text-secondary">{progressMsg}</p>
        </div>
      )}
    </div>
  );
}
