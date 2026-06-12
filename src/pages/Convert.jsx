import React, { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import {
  Upload, Music, Download, RefreshCw, Loader2, Play,
  RotateCcw, AlertCircle, Settings, Sliders
} from 'lucide-react';

export default function ConvertPage({ api, addToast }) {
  const [sourceFile, setSourceFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState(null);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [separateFirst, setSeparateFirst] = useState(false);
  const [converting, setConverting] = useState(false);
  const [result, setResult] = useState(null);

  // Params
  const [pitchShift, setPitchShift] = useState(0);
  const [indexRate, setIndexRate] = useState(0.75);
  const [filterRadius, setFilterRadius] = useState(3);
  const [f0Method, setF0Method] = useState('rmvpe');

  const dropRef = useRef(null);

  // Fetch models
  const fetchModels = useCallback(async () => {
    try {
      const res = await axios.get(`${api}/models/list`);
      setModels(res.data.models);
    } catch {
      // silent
    }
  }, [api]);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  // Handle audio file drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|m4a|flac|ogg)$/i))) {
      setSourceFile(file);
      setSourceUrl(URL.createObjectURL(file));
      setResult(null);
    }
  }, []);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSourceFile(file);
      setSourceUrl(URL.createObjectURL(file));
      setResult(null);
    }
  };

  const handleConvert = async () => {
    if (!sourceFile || !selectedModel) return;
    setConverting(true);
    setResult(null);

    const formData = new FormData();
    formData.append('source_audio', sourceFile);
    formData.append('model_name', selectedModel);
    formData.append('pitch_shift', pitchShift.toString());
    formData.append('index_rate', indexRate.toString());
    formData.append('filter_radius', filterRadius.toString());
    formData.append('f0_method', f0Method);

    // If separate first, do Demucs separation upfront
    let audioToConvert = sourceFile;
    if (separateFirst) {
      try {
        addToast('Separating vocals from music...', 'info');
        const sepForm = new FormData();
        sepForm.append('source_audio', sourceFile);
        const sepRes = await axios.post(`${api}/vocals/separate`, sepForm, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000,
        });
        // Fetch the separated vocals as a blob
        const vocalsResp = await axios.get(`${api}/audio/${sepRes.data.vocals_path.split('/').pop()}`, {
          responseType: 'blob',
        });
        audioToConvert = new File([vocalsResp.data], 'vocals.wav', { type: 'audio/wav' });
        formData.set('source_audio', audioToConvert);
        addToast('Vocals separated, now converting...', 'success');
      } catch (err) {
        const msg = err.response?.data?.detail || err.message;
        addToast(`Separation failed: ${msg}`, 'error');
        setConverting(false);
        return;
      }
    }

    try {
      const res = await axios.post(`${api}/singing/convert`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000,
        responseType: 'json',
      });

      // Get audio URL
      const filename = res.data.output_path.split('/').pop();
      const audioRes = await axios.get(`${api}/audio/${filename}`, {
        responseType: 'blob',
      });
      const audioUrl = URL.createObjectURL(audioRes.data);

      setResult({
        audioUrl,
        duration: res.data.duration,
        modelUsed: res.data.model_used,
        pitchShift: res.data.pitch_shift,
        filename,
      });
      addToast('Conversion complete!', 'success');
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      addToast(`Conversion failed: ${msg}`, 'error');
    } finally {
      setConverting(false);
    }
  };

  const handleDownload = () => {
    if (!result?.audioUrl) return;
    const a = document.createElement('a');
    a.href = result.audioUrl;
    a.download = `converted_${result.filename || 'output.wav'}`;
    a.click();
  };

  const handleReset = () => {
    setSourceFile(null);
    setSourceUrl(null);
    setResult(null);
  };

  const refreshModels = () => {
    fetchModels();
    addToast('Models list refreshed', 'info');
  };

  // Fill slider style
  const sliderFill = (val, min, max) => {
    const pct = ((val - min) / (max - min)) * 100;
    return { '--fill': `${pct}%` };
  };

  return (
    <div className="p-8 h-full">
      <h1 className="text-2xl font-bold mb-6">Convert Audio</h1>

      <div className="flex gap-6 h-[calc(100%-4rem)]">
        {/* ── Left Column ── */}
        <div className="w-1/2 space-y-5 overflow-y-auto pr-2">
          {/* Source Audio */}
          <div className="bg-forge-card border border-forge-border rounded-xl p-5">
            <h3 className="font-semibold mb-1">Source Audio</h3>
            <p className="text-xs text-forge-text-secondary mb-3">
              Your vocals, any singer's recording, or use Demucs output
            </p>

            <div
              ref={dropRef}
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              className={`dropzone ${sourceFile ? 'has-file' : ''}`}
            >
              {sourceFile ? (
                <div className="flex items-center gap-3">
                  <Music size={20} className="text-forge-success" />
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{sourceFile.name}</p>
                    <p className="text-xs text-forge-text-secondary">
                      {(sourceFile.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleReset(); }}
                          className="text-forge-text-secondary hover:text-forge-error transition-colors">
                    <RotateCcw size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="mx-auto mb-2 text-forge-text-secondary" size={28} />
                  <p className="text-sm font-medium">Drop your vocals here</p>
                  <p className="text-xs text-forge-text-secondary mt-1">or click to browse</p>
                  <input
                    type="file"
                    accept=".mp3,.wav,.m4a,.flac,.ogg"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="convert-file-input"
                  />
                </>
              )}
              <button
                onClick={() => document.getElementById('convert-file-input').click()}
                className="mt-2 px-3 py-1.5 bg-forge-accent text-white rounded-lg text-xs font-medium
                           hover:bg-forge-accent-hover transition-colors"
              >
                {sourceFile ? 'Change File' : 'Browse'}
              </button>
            </div>

            {sourceUrl && (
              <div className="mt-3">
                <audio src={sourceUrl} controls className="w-full h-8"
                       style={{ filter: 'invert(0.85)' }} />
              </div>
            )}

            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={separateFirst}
                onChange={e => setSeparateFirst(e.target.checked)}
                className="accent-forge-accent"
              />
              <span className="text-sm text-forge-text-secondary">Separate vocals first (Demucs)</span>
            </label>
          </div>

          {/* Voice Model */}
          <div className="bg-forge-card border border-forge-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Voice Model</h3>
              <button onClick={refreshModels}
                      className="text-forge-text-secondary hover:text-forge-accent transition-colors">
                <RefreshCw size={16} />
              </button>
            </div>

            {models.length === 0 ? (
              <p className="text-sm text-yellow-500">
                No models found. Go to Train page to add models.
              </p>
            ) : (
              <select
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                className="w-full bg-forge-input border border-forge-border rounded-lg px-3 py-2.5
                           text-sm text-forge-text focus:outline-none focus:border-forge-accent"
              >
                <option value="">Select a model...</option>
                {models.map(m => (
                  <option key={m.name} value={m.name}>
                    {m.name} {m.has_index ? '✓' : '(no index)'}
                  </option>
                ))}
              </select>
            )}

            {selectedModel && (() => {
              const model = models.find(m => m.name === selectedModel);
              return model ? (
                <div className="flex gap-4 mt-3 text-xs text-forge-text-secondary">
                  <span>{model.size_mb.toFixed(1)} MB</span>
                  <span className={model.has_index ? 'text-forge-success' : 'text-yellow-500'}>
                    {model.has_index ? 'Index ready' : 'No index'}
                  </span>
                </div>
              ) : null;
            })()}
          </div>

          {/* Parameters */}
          <div className="bg-forge-card border border-forge-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sliders size={16} className="text-forge-accent" />
              <h3 className="font-semibold">Parameters</h3>
            </div>

            {/* Pitch Shift */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <label>Pitch Shift</label>
                <span className="text-forge-accent font-mono">{pitchShift > 0 ? '+' : ''}{pitchShift} semitones</span>
              </div>
              <input type="range" min="-24" max="24" value={pitchShift}
                     onChange={e => setPitchShift(Number(e.target.value))}
                     className="w-full range-fill" style={sliderFill(pitchShift, -24, 24)} />
              <p className="text-xs text-forge-text-secondary mt-1">
                For male→NFAK style: try +8 to +12
              </p>
            </div>

            {/* Index Rate */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <label>Index Rate</label>
                <span className="text-forge-accent font-mono">{indexRate.toFixed(2)}</span>
              </div>
              <input type="range" min="0" max="1" step="0.05" value={indexRate}
                     onChange={e => setIndexRate(Number(e.target.value))}
                     className="w-full range-fill" style={sliderFill(indexRate, 0, 1)} />
              <p className="text-xs text-forge-text-secondary mt-1">
                Higher = more like target voice, lower = more expressive
              </p>
            </div>

            {/* Filter Radius */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <label>Filter Radius</label>
                <span className="text-forge-accent font-mono">{filterRadius}</span>
              </div>
              <input type="range" min="1" max="7" value={filterRadius}
                     onChange={e => setFilterRadius(Number(e.target.value))}
                     className="w-full range-fill" style={sliderFill(filterRadius, 1, 7)} />
              <p className="text-xs text-forge-text-secondary mt-1">
                Higher = smoother pitch, lower = more natural
              </p>
            </div>

            {/* F0 Method */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <label>Pitch Detection</label>
              </div>
              <select value={f0Method} onChange={e => setF0Method(e.target.value)}
                      className="w-full bg-forge-input border border-forge-border rounded-lg px-3 py-2
                                 text-sm text-forge-text focus:outline-none focus:border-forge-accent">
                <option value="rmvpe">rmvpe (best for singing)</option>
                <option value="crepe">crepe (accurate, slow)</option>
                <option value="harvest">harvest (fast)</option>
                <option value="pm">pm (lightweight)</option>
              </select>
            </div>
          </div>

          {/* Convert Button */}
          <button
            onClick={handleConvert}
            disabled={!sourceFile || !selectedModel || converting}
            className="w-full py-3.5 bg-forge-accent text-white rounded-lg font-semibold
                       hover:bg-forge-accent-hover disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 flex items-center justify-center gap-2 text-lg"
          >
            {converting ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Converting...
              </>
            ) : (
              <>
                <Play size={20} />
                Convert
              </>
            )}
          </button>
        </div>

        {/* ── Right Column: Output ── */}
        <div className="w-1/2 bg-forge-card border border-forge-border rounded-xl p-6
                        flex flex-col items-center justify-center">
          {!result ? (
            <div className="text-center text-forge-text-secondary">
              <Music size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">Output will appear here</p>
              <p className="text-sm mt-1">Select a model and audio, then click Convert</p>
            </div>
          ) : (
            <div className="w-full space-y-5">
              <h3 className="font-semibold text-lg">Conversion Result</h3>

              <audio src={result.audioUrl} controls className="w-full"
                     style={{ filter: 'invert(0.85)' }} />

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="bg-forge-input rounded-lg p-3 text-center">
                  <p className="text-forge-text-secondary text-xs">Duration</p>
                  <p className="font-medium">{result.duration.toFixed(1)}s</p>
                </div>
                <div className="bg-forge-input rounded-lg p-3 text-center">
                  <p className="text-forge-text-secondary text-xs">Model</p>
                  <p className="font-medium truncate">{result.modelUsed}</p>
                </div>
                <div className="bg-forge-input rounded-lg p-3 text-center">
                  <p className="text-forge-text-secondary text-xs">Pitch</p>
                  <p className="font-medium">{result.pitchShift > 0 ? '+' : ''}{result.pitchShift}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={handleDownload}
                        className="flex-1 py-3 bg-forge-accent text-white rounded-lg font-medium
                                   hover:bg-forge-accent-hover transition-colors flex items-center justify-center gap-2">
                  <Download size={18} />
                  Download
                </button>
                <button onClick={handleReset}
                        className="flex-1 py-3 bg-forge-input border border-forge-border text-forge-text
                                   rounded-lg font-medium hover:bg-forge-border/50 transition-colors
                                   flex items-center justify-center gap-2">
                  <RotateCcw size={18} />
                  Convert Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
