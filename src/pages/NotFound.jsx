import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home } from 'lucide-react';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <h1 className="text-7xl font-bold text-forge-accent mb-4">404</h1>
      <p className="text-xl text-forge-text-secondary mb-8">Page not found</p>
      <button onClick={() => navigate('/')}
              className="px-5 py-2.5 bg-forge-accent text-white rounded-lg font-medium
                         hover:bg-forge-accent-hover transition-colors flex items-center gap-2">
        <Home size={18} />
        Back to Home
      </button>
    </div>
  );
}
