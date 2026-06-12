import React, { useState, useCallback } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { BackendProvider, useBackend } from './BackendContext';
import {
  Home, Mic, Music, Box, MessageSquareText,
  AlertCircle, RefreshCw
} from 'lucide-react';
import HomePage from './pages/Home';
import TrainPage from './pages/Train';
import ConvertPage from './pages/Convert';
import ModelsPage from './pages/Models';
import TTSPage from './pages/TTS';
import NotFound from './pages/NotFound';

const navItems = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/train', label: 'Train', icon: Mic },
  { path: '/convert', label: 'Convert', icon: Music },
  { path: '/tts', label: 'TTS', icon: MessageSquareText },
  { path: '/models', label: 'Models', icon: Box },
];

const API = 'http://localhost:8765';

function AppContent() {
  const [toasts, setToasts] = useState([]);
  const location = useLocation();
  const { status, checkHealth } = useBackend();

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const statusDot = {
    ready: 'bg-forge-success',
    offline: 'bg-forge-error',
    checking: 'bg-yellow-500 animate-pulse',
    error: 'bg-forge-error',
  }[status] || 'bg-yellow-500 animate-pulse';

  const statusLabel = {
    ready: 'Online',
    offline: 'Offline',
    checking: 'Checking...',
    error: 'Error',
  }[status] || '...';

  const needsBackend = ['/train', '/convert', '/tts'].some(p =>
    location.pathname.startsWith(p)
  );
  const showOfflineOverlay = needsBackend && status === 'offline';

  return (
    <div className="min-h-screen bg-forge-bg text-forge-text">
      {/* Top Navbar */}
      <nav className="sticky top-0 z-40 h-[60px] bg-forge-bg border-b border-forge-border
                      flex items-center px-6 gap-6">
        {/* Logo */}
        <NavLink to="/" className="text-xl font-bold text-forge-accent shrink-0 tracking-tight">
          VoiceForge
        </NavLink>

        {/* Nav Links */}
        <div className="flex items-center gap-1 flex-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-forge-accent/10 text-forge-accent'
                    : 'text-forge-text-secondary hover:text-forge-text hover:bg-forge-border/30'
                }`}
              >
                <Icon size={16} />
                {item.label}
              </NavLink>
            );
          })}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`w-2 h-2 rounded-full ${statusDot}`} />
          <span className="text-xs text-forge-text-secondary">{statusLabel}</span>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative">
        {/* Offline overlay for protected pages */}
        {showOfflineOverlay && (
          <div className="fixed inset-0 z-30 bg-forge-bg/95 flex items-center justify-center px-6"
               style={{ top: '60px' }}>
            <div className="bg-forge-card border border-forge-border rounded-xl p-10 max-w-md text-center">
              <AlertCircle size={48} className="mx-auto mb-4 text-forge-error" />
              <h2 className="text-xl font-bold mb-2">Backend is not running</h2>
              <div className="text-left text-sm text-forge-text-secondary space-y-2 mb-6">
                <p>1. Open a terminal in your VoiceForge folder</p>
                <p className="bg-forge-bg rounded px-2 py-1 font-mono text-xs">
                  python backend/main.py
                </p>
                <p>2. Wait for: <span className="text-forge-accent font-mono text-xs">Uvicorn running on http://0.0.0.0:8765</span></p>
                <p>3. Refresh this page</p>
              </div>
              <button onClick={checkHealth}
                      className="px-5 py-2.5 bg-forge-accent text-white rounded-lg font-medium
                                 hover:bg-forge-accent-hover transition-colors flex items-center gap-2 mx-auto">
                <RefreshCw size={16} />
                Check Again
              </button>
            </div>
          </div>
        )}

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/train" element={<TrainPage api={API} addToast={addToast} />} />
          <Route path="/convert" element={<ConvertPage api={API} addToast={addToast} />} />
          <Route path="/tts" element={<TTSPage api={API} addToast={addToast} />} />
          <Route path="/models" element={<ModelsPage api={API} addToast={addToast} />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map(t => (
          <div key={t.id}
               className={`toast px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
                 t.type === 'success' ? 'bg-forge-success text-white' :
                 t.type === 'error' ? 'bg-forge-error text-white' :
                 'bg-forge-card border border-forge-border text-forge-text'
               }`}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BackendProvider>
      <AppContent />
    </BackendProvider>
  );
}
