import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Music, Box, ArrowRight, Upload, Cpu, Download, Volume2 } from 'lucide-react';

const features = [
  {
    icon: Mic,
    title: 'Train a Voice',
    desc: 'Upload MP3s, extract vocals, prepare for training on Google Colab',
    path: '/train',
    color: 'text-forge-accent',
  },
  {
    icon: Music,
    title: 'Convert Audio',
    desc: 'Transform any vocals into your trained singer\'s voice',
    path: '/convert',
    color: 'text-forge-accent',
  },
  {
    icon: Box,
    title: 'Manage Models',
    desc: 'View and manage your trained voice models',
    path: '/models',
    color: 'text-forge-accent',
  },
];

const steps = [
  { icon: Upload, title: 'Upload MP3s', desc: 'Drop songs of your target singer' },
  { icon: Cpu, title: 'Extract Vocals', desc: 'Demucs separates vocals from music' },
  { icon: Download, title: 'Train on Colab', desc: 'Free GPU training with prepared notebook' },
  { icon: Volume2, title: 'Convert', desc: 'Transform any recording to that voice' },
];

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Hero */}
      <div className="text-center py-12">
        <h1 className="text-5xl font-bold mb-4">
          Clone any{' '}
          <span className="text-forge-accent">singer's voice</span>
          {' '}with AI
        </h1>
        <p className="text-forge-text-secondary text-lg max-w-2xl mx-auto">
          Train on MP3s of any singer using RVC v2, then convert any vocal recording
          to sound like them — all running locally on your machine.
        </p>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-3 gap-5 mb-12">
        {features.map(f => {
          const Icon = f.icon;
          return (
            <button
              key={f.path}
              onClick={() => navigate(f.path)}
              className="text-left bg-forge-card border border-forge-border rounded-xl p-6
                         hover:border-forge-accent/50 transition-all duration-200 group"
            >
              <Icon className={`${f.color} mb-4`} size={28} />
              <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-forge-text-secondary mb-4">{f.desc}</p>
              <span className="text-sm text-forge-accent flex items-center gap-1
                               opacity-0 group-hover:opacity-100 transition-opacity">
                Get started <ArrowRight size={14} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Quick Start */}
      <div className="bg-forge-card border border-forge-border rounded-xl p-8">
        <h2 className="text-xl font-semibold mb-6">Quick Start</h2>
        <div className="grid grid-cols-4 gap-6">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="text-center">
                <div className="w-12 h-12 rounded-full bg-forge-accent/10 flex items-center justify-center mx-auto mb-3">
                  <Icon className="text-forge-accent" size={22} />
                </div>
                <div className="text-xs text-forge-accent font-medium mb-1">Step {i + 1}</div>
                <h4 className="font-medium text-sm mb-1">{s.title}</h4>
                <p className="text-xs text-forge-text-secondary">{s.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
