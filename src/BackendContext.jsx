import React, { createContext, useState, useEffect, useCallback, useContext } from 'react';
import axios from 'axios';

const API = 'http://localhost:8765';
const BackendContext = createContext(null);

export function BackendProvider({ children }) {
  const [status, setStatus] = useState('checking');

  const checkHealth = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/health`, { timeout: 3000 });
      setStatus(res.data.status === 'ok' ? 'ready' : 'error');
      return res.data.status === 'ok';
    } catch {
      setStatus('offline');
      return false;
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  return (
    <BackendContext.Provider value={{ status, checkHealth, api: API }}>
      {children}
    </BackendContext.Provider>
  );
}

export function useBackend() {
  const ctx = useContext(BackendContext);
  if (!ctx) throw new Error('useBackend must be inside BackendProvider');
  return ctx;
}

export default BackendContext;
