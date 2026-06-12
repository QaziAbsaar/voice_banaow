import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useBackend } from '../BackendContext';
import { Mic, Music, Cpu, ArrowRight, Upload, Download, Volume2, Shield } from 'lucide-react';

export default function HomePage() {
  const navigate = useNavigate();
  const { status } = useBackend();

  const howItWorks = [
    { icon: Upload, title: 'Upload MP3s', desc: 'Drop songs of your target singer into the app' },
    { icon: Cpu, title: 'Extract Vocals', desc: 'Demucs AI separates vocals from background music' },
    { icon: Download, title: 'Train Model', desc: 'Train on Google Colab free GPU — 30-60 min' },
    { icon: Volume2, title: 'Convert', desc: 'Transform any vocal recording into that voice' },
  ];

  const features = [
    { icon: Music, title: 'Singing Voice Conversion', desc: 'RVC v2 — the same tech used by AI cover creators. High-quality real-time voice conversion.' },
    { icon: Cpu, title: 'Vocal Separation', desc: 'Demucs by Meta AI. Separate vocals from any song with a single click.' },
    { icon: Shield, title: 'Local & Private', desc: 'Runs entirely on your machine. No data sent to the cloud. No internet needed after setup.' },
  ];

  return (
    <div className="min-h-screen bg-forge-bg">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center py-24 px-6 text-center">
        <h1 className="text-5xl md:text-6xl font-bold mb-4 tracking-tight">
          Clone Any <span className="text-forge-accent">Singer's Voice</span>
        </h1>
        <p className="text-lg text-forge-text-secondary max-w-xl mx-auto mb-8">
          Train on any MP3. Convert any vocal. Powered by RVC v2.
        </p>
        <div className="flex gap-4">
          <button onClick={() => navigate('/convert')}
                  className="px-6 py-3 bg-forge-accent text-white rounded-lg font-semibold
                             hover:bg-forge-accent-hover transition-colors flex items-center gap-2 text-lg">
            <Music size={20} />
            Start Converting
          </button>
          <button onClick={() => navigate('/train')}
                  className="px-6 py-3 bg-forge-input border border-forge-border text-forge-text
                             rounded-lg font-semibold hover:bg-forge-border/50 transition-colors
                             flex items-center gap-2 text-lg">
            <Mic size={20} />
            Train a Voice
          </button>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-center mb-12">How It Works</h2>
        <div className="grid grid-cols-4 gap-6">
          {howItWorks.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="text-center">
                <div className="w-14 h-14 rounded-full bg-forge-accent/10 flex items-center justify-center mx-auto mb-4">
                  <Icon className="text-forge-accent" size={26} />
                </div>
                <div className="text-xs text-forge-accent font-semibold mb-1">Step {i + 1}</div>
                <h3 className="font-semibold text-sm mb-1">{s.title}</h3>
                <p className="text-xs text-forge-text-secondary leading-relaxed">{s.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-center mb-12">Powered By</h2>
        <div className="grid grid-cols-3 gap-5">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <div key={i} className="bg-forge-card border border-forge-border rounded-xl p-6">
                <Icon className="text-forge-accent mb-4" size={28} />
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-forge-text-secondary leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Backend Status Bar */}
      <footer className="border-t border-forge-border py-3 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-xs text-forge-text-secondary">
            VoiceForge v0.1.0
          </span>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              status === 'ready' ? 'bg-forge-success' :
              status === 'offline' ? 'bg-forge-error' :
              'bg-yellow-500 animate-pulse'
            }`} />
            <span className="text-xs text-forge-text-secondary">
              {status === 'ready' ? 'Backend running on port 8765' :
               status === 'offline' ? 'Backend offline — run python backend/main.py' :
               'Checking backend...'}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
