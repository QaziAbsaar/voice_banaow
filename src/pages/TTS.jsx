import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import {
  MessageSquareText, Volume2, Download, RotateCcw,
  Loader2, Play, Upload, RefreshCw, Languages
} from 'lucide-react';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ur', label: 'Urdu' },
  { code: 'hi', label: 'Hindi' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ar', label: 'Arabic' },
  { code: 'bn', label: 'Bengali' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ru', label: 'Russian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh-cn', label: 'Chinese (Simplified)' },
];

export default function TTSPage({ api, addToast }) {
  const [text, setText] = useState('');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [ttsBackend, setTtsBackend] = useState('auto');
  const [language, setLanguage] = useState('en');
  const [referenceFile, setReferenceFile] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);

  // RVC params
  const [pitchShift, setPitchShift] = useState(0);
  const [indexRate, setIndexRate] = useState(0.75);
  const [filterRadius, setFilterRadius] = useState(3);
  const [f0Method, setF0Method] = useState('rmvpe');

  const fetchModels = useCallback(async () => {
    try {
      const res = await axios.get(`${api}/models/list`);
      setModels(res.data.models);
    } catch { /* silent */ }
  }, [api]);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const handleGenerate = async () => {
    if (!text.trim() || !selectedModel) return;
    setGenerating(true);
    setResult(null);

    const formData = new FormData();
    formData.append('text', text);
    formData.append('model_name', selectedModel);
    formData.append('tts_backend', ttsBackend);
    formData.append('language', language);
    formData.append('pitch_shift', pitchShift.toString());
    formData.append('index_rate', indexRate.toString());
    formData.append('filter_radius', filterRadius.toString());
    formData.append('f0_method', f0Method);
    if (referenceFile) {
      formData.append('reference_audio', referenceFile);
    }

    try {
      const res = await axios.post(`${api}/tts/synthesize`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });

      const filename = res.data.output_path.split('/').pop();
      const audioRes = await axios.get(`${api}/audio/${filename}`, {
        responseType: 'blob',
      });
      const audioUrl = URL.createObjectURL(audioRes.data);

      setResult({ audioUrl, duration: res.data.duration, text: res.data.text });
      addToast('Speech generated!', 'success');
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      addToast(`Generation failed: ${msg}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!result?.audioUrl) return;
    const a = document.createElement('a');
    a.href = result.audioUrl;
    a.download = 'tts_output.wav';
    a.click();
  };

  const handleReset = () => {
    setResult(null);
    setText('');
  };

  const sliderFill = (val, min, max) => {
    const pct = ((val - min) / (max - min)) * 100;
    return { '--fill': `${pct}%` };
  };

  return (
    <div className="p-8 h-full">
      <h1 className="text-2xl font-bold mb-1">Text to Speech</h1>
      <p className="text-forge-text-secondary mb-6">
        Type text → generate speech → convert to any trained voice
      </p>

      <div className="flex gap-6 h-[calc(100%-5rem)]">
        {/* ── Left Column ── */}
        <div className="w-1/2 space-y-4 overflow-y-auto pr-2">
          {/* Text Input */}
          <div className="bg-forge-card border border-forge-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquareText size={16} className="text-forge-accent" />
              <h3 className="font-semibold">Text</h3>
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Type the text you want to speak in the target voice..."
              rows={5}
              className="w-full bg-forge-input border border-forge-border rounded-lg p-3
                         text-sm text-forge-text placeholder-forge-text-secondary/50
                         focus:outline-none focus:border-forge-accent resize-none"
            />
            <div className="flex justify-between text-xs text-forge-text-secondary mt-1">
              <span>{text.length} characters</span>
              <span>{text.split(/\s+/).filter(Boolean).length} words</span>
            </div>
          </div>

          {/* TTS Settings */}
          <div className="bg-forge-card border border-forge-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Volume2 size={16} className="text-forge-accent" />
              <h3 className="font-semibold">Speech Settings</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm block mb-1">TTS Engine</label>
                <select value={ttsBackend} onChange={e => setTtsBackend(e.target.value)}
                        className="w-full bg-forge-input border border-forge-border rounded-lg px-3 py-2
                                   text-sm text-forge-text focus:outline-none focus:border-forge-accent">
                  <option value="auto">Auto-detect</option>
                  <option value="gtts">gTTS (fast, needs internet)</option>
                  <option value="xtts">XTTS (high quality, voice clone)</option>
                </select>
              </div>
              <div>
                <label className="text-sm block mb-1">Language</label>
                <select value={language} onChange={e => setLanguage(e.target.value)}
                        className="w-full bg-forge-input border border-forge-border rounded-lg px-3 py-2
                                   text-sm text-forge-text focus:outline-none focus:border-forge-accent">
                  {LANGUAGES.map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Reference audio for XTTS */}
            {ttsBackend === 'xtts' && (
              <div className="mt-3">
                <label className="text-sm block mb-1">Reference Audio (for voice cloning)</label>
                <div className="dropzone py-3 px-4"
                     onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setReferenceFile(f); }}
                     onDragOver={e => e.preventDefault()}>
                  {referenceFile ? (
                    <div className="flex items-center gap-2">
                      <Volume2 size={16} className="text-forge-success" />
                      <span className="text-sm truncate">{referenceFile.name}</span>
                      <button onClick={() => setReferenceFile(null)}
                              className="ml-auto text-forge-text-secondary hover:text-forge-error text-xs">
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 justify-center">
                      <Upload size={16} className="text-forge-text-secondary" />
                      <span className="text-sm text-forge-text-secondary">
                        Drop a short audio clip for voice cloning
                      </span>
                      <input type="file" accept=".mp3,.wav"
                             onChange={e => { if (e.target.files[0]) setReferenceFile(e.target.files[0]); }}
                             className="hidden" id="ref-audio-input" />
                      <button onClick={() => document.getElementById('ref-audio-input').click()}
                              className="text-xs bg-forge-accent text-white px-2 py-1 rounded">
                        Browse
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Voice Model */}
          <div className="bg-forge-card border border-forge-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Target Voice</h3>
              <button onClick={fetchModels}
                      className="text-forge-text-secondary hover:text-forge-accent transition-colors">
                <RefreshCw size={16} />
              </button>
            </div>
            <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                    className="w-full bg-forge-input border border-forge-border rounded-lg px-3 py-2.5
                               text-sm text-forge-text focus:outline-none focus:border-forge-accent">
              <option value="">Select a voice model...</option>
              {models.map(m => (
                <option key={m.name} value={m.name}>
                  {m.name} {m.has_index ? '✓' : '(no index)'}
                </option>
              ))}
            </select>
            {models.length === 0 && (
              <p className="text-xs text-yellow-500 mt-2">
                No models found. Train one on the Train page first.
              </p>
            )}
          </div>

          {/* RVC Params */}
          <div className="bg-forge-card border border-forge-border rounded-xl p-5">
            <h3 className="font-semibold mb-3">Voice Conversion Params</h3>

            <div className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <label>Pitch Shift</label>
                <span className="text-forge-accent font-mono">{pitchShift > 0 ? '+' : ''}{pitchShift}</span>
              </div>
              <input type="range" min="-24" max="24" value={pitchShift}
                     onChange={e => setPitchShift(Number(e.target.value))}
                     className="w-full range-fill" style={sliderFill(pitchShift, -24, 24)} />
            </div>
            <div className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <label>Index Rate</label>
                <span className="text-forge-accent font-mono">{indexRate.toFixed(2)}</span>
              </div>
              <input type="range" min="0" max="1" step="0.05" value={indexRate}
                     onChange={e => setIndexRate(Number(e.target.value))}
                     className="w-full range-fill" style={sliderFill(indexRate, 0, 1)} />
            </div>
            <div className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <label>Filter Radius</label>
                <span className="text-forge-accent font-mono">{filterRadius}</span>
              </div>
              <input type="range" min="1" max="7" value={filterRadius}
                     onChange={e => setFilterRadius(Number(e.target.value))}
                     className="w-full range-fill" style={sliderFill(filterRadius, 1, 7)} />
            </div>
            <div>
              <label className="text-sm block mb-1">F0 Method</label>
              <select value={f0Method} onChange={e => setF0Method(e.target.value)}
                      className="w-full bg-forge-input border border-forge-border rounded-lg px-3 py-2
                                 text-sm text-forge-text focus:outline-none focus:border-forge-accent">
                <option value="rmvpe">rmvpe (best for speech)</option>
                <option value="crepe">crepe</option>
                <option value="harvest">harvest</option>
                <option value="pm">pm</option>
              </select>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={!text.trim() || !selectedModel || generating}
            className="w-full py-3.5 bg-forge-accent text-white rounded-lg font-semibold
                       hover:bg-forge-accent-hover disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 flex items-center justify-center gap-2 text-lg"
          >
            {generating ? (
              <><Loader2 size={20} className="animate-spin" /> Generating...</>
            ) : (
              <><Play size={20} /> Generate Speech</>
            )}
          </button>
        </div>

        {/* ── Right Column: Output ── */}
        <div className="w-1/2 bg-forge-card border border-forge-border rounded-xl p-6
                        flex flex-col items-center justify-center">
          {!result ? (
            <div className="text-center text-forge-text-secondary">
              <Volume2 size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">Speech will appear here</p>
              <p className="text-sm mt-1">Type text, select a voice model, and generate</p>
              <div className="mt-6 bg-forge-input rounded-lg p-4 text-left text-xs text-forge-text-secondary">
                <p className="font-medium text-forge-text mb-2">How it works:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Type your text</li>
                  <li>TTS engine generates speech</li>
                  <li>RVC converts it to target voice</li>
                  <li>Download the result</li>
                </ol>
              </div>
            </div>
          ) : (
            <div className="w-full space-y-5">
              <h3 className="font-semibold text-lg">Generated Speech</h3>

              <audio src={result.audioUrl} controls className="w-full"
                     style={{ filter: 'invert(0.85)' }} />

              <div className="bg-forge-input rounded-lg p-4">
                <p className="text-xs text-forge-text-secondary mb-1">Spoken text:</p>
                <p className="text-sm italic text-forge-text-secondary/80">{result.text}</p>
              </div>

              <div className="flex gap-3">
                <button onClick={handleDownload}
                        className="flex-1 py-3 bg-forge-accent text-white rounded-lg font-medium
                                   hover:bg-forge-accent-hover transition-colors flex items-center justify-center gap-2">
                  <Download size={18} /> Download
                </button>
                <button onClick={handleReset}
                        className="flex-1 py-3 bg-forge-input border border-forge-border text-forge-text
                                   rounded-lg font-medium hover:bg-forge-border/50 transition-colors
                                   flex items-center justify-center gap-2">
                  <RotateCcw size={18} /> Generate New
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
