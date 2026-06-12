import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import axios from 'axios';
import {
  Home,
  Mic,
  Music,
  Box,
  Github,
  Settings
} from 'lucide-react';
import HomePage from './pages/Home';
import TrainPage from './pages/Train';
import ConvertPage from './pages/Convert';
import ModelsPage from './pages/Models';

const API = 'http://localhost:8765';

const navItems = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/train', label: 'Train Voice', icon: Mic },
  { path: '/convert', label: 'Convert', icon: Music },
  { path: '/models', label: 'Models', icon: Box },
];

export default function App() {
  const [backendStatus, setBackendStatus] = useState('checking');
  const [toasts, setToasts] = useState([]);
  const location = useLocation();

  const checkHealth = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/health`, { timeout: 3000 });
      if (res.data.status === 'ok') {
        setBackendStatus('ready');
        return true;
      }
      setBackendStatus('error');
      return false;
    } catch {
      setBackendStatus('starting');
      return false;
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 3000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const statusColor = {
    ready: 'bg-forge-success',
    starting: 'bg-yellow-500',
    checking: 'bg-yellow-500',
    error: 'bg-forge-error',
  }[backendStatus];

  const statusLabel = {
    ready: 'Backend Ready',
    starting: 'Starting...',
    checking: 'Checking...',
    error: 'Connection Error',
  }[backendStatus];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-forge-bg">
      {/* Sidebar */}
      <aside className="flex flex-col w-[220px] min-w-[220px] h-full border-r border-forge-border bg-forge-card">
        {/* Logo */}
        <div className="px-5 py-6 border-b border-forge-border">
          <h1 className="text-2xl font-bold text-forge-accent tracking-tight">VoiceForge</h1>
          <p className="text-xs text-forge-text-secondary mt-1">AI Voice Cloning</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-forge-accent/10 text-forge-accent'
                    : 'text-forge-text-secondary hover:text-forge-text hover:bg-forge-border/30'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Status */}
        <div className="px-4 py-4 border-t border-forge-border">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${statusColor} ${backendStatus === 'starting' ? 'animate-pulse' : ''}`} />
            <span className="text-xs text-forge-text-secondary">{statusLabel}</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/train" element={<TrainPage api={API} addToast={addToast} />} />
          <Route path="/convert" element={<ConvertPage api={API} addToast={addToast} />} />
          <Route path="/models" element={<ModelsPage api={API} addToast={addToast} />} />
        </Routes>
      </main>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`toast px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
              t.type === 'success'
                ? 'bg-forge-success text-white'
                : t.type === 'error'
                ? 'bg-forge-error text-white'
                : 'bg-forge-card border border-forge-border text-forge-text'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
