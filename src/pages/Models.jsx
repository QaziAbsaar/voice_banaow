import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Box, Trash2, RefreshCw, FolderOpen, AlertTriangle,
  CheckCircle, FileAudio, Loader2
} from 'lucide-react';

export default function ModelsPage({ api, addToast }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${api}/models/list`);
      setModels(res.data.models);
    } catch {
      addToast('Failed to fetch models', 'error');
    } finally {
      setLoading(false);
    }
  }, [api, addToast]);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const handleDelete = async (name) => {
    setDeleting(name);
    try {
      const res = await axios.delete(`${api}/models/${name}`);
      if (res.data.deleted) {
        addToast(`Deleted ${name}`, 'success');
        setModels(prev => prev.filter(m => m.name !== name));
      }
    } catch (err) {
      addToast(`Failed to delete: ${err.response?.data?.detail || err.message}`, 'error');
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  const openModelsFolder = async () => {
    try {
      const res = await axios.get(`${api}/models/path`);
      navigator.clipboard.writeText(res.data.path);
      addToast('Models folder path copied to clipboard', 'info');
    } catch {
      addToast('Could not fetch models path', 'error');
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Models</h1>
          <p className="text-forge-text-secondary text-sm mt-1">
            {models.length} model{models.length !== 1 ? 's' : ''} available
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchModels}
                  className="px-4 py-2 bg-forge-input border border-forge-border text-forge-text
                             rounded-lg text-sm font-medium hover:bg-forge-border/50 transition-colors
                             flex items-center gap-2">
            <RefreshCw size={16} />
            Refresh
          </button>
          <button onClick={openModelsFolder}
                  className="px-4 py-2 bg-forge-input border border-forge-border text-forge-text
                             rounded-lg text-sm font-medium hover:bg-forge-border/50 transition-colors
                             flex items-center gap-2">
            <FolderOpen size={16} />
            Open Folder
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-forge-accent" />
        </div>
      ) : models.length === 0 ? (
        /* Empty state */
        <div className="bg-forge-card border border-forge-border rounded-xl p-12 text-center">
          <Box size={48} className="mx-auto mb-4 text-forge-text-secondary opacity-40" />
          <h2 className="text-xl font-semibold mb-2">No models yet</h2>
          <p className="text-forge-text-secondary mb-6 max-w-md mx-auto text-sm">
            Train a voice model or add existing .pth and .index files to your models folder.
          </p>

          <div className="bg-forge-input rounded-lg p-4 mb-6 inline-block text-left">
            <div className="flex items-start gap-3">
              <AlertTriangle size={16} className="text-yellow-500 mt-0.5 shrink-0" />
              <ol className="text-sm text-forge-text-secondary space-y-1 list-decimal list-inside">
                <li>Go to Train page and prepare your vocal data</li>
                <li>Train on Google Colab (free GPU)</li>
                <li>Download the .pth and .index files</li>
                <li>Drop them into your models folder</li>
              </ol>
            </div>
          </div>

          <button onClick={openModelsFolder}
                  className="px-6 py-3 bg-forge-accent text-white rounded-lg font-medium
                             hover:bg-forge-accent-hover transition-colors">
            Open Models Folder
          </button>
        </div>
      ) : (
        /* Model grid */
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {models.map(m => (
            <div key={m.name}
                 className="bg-forge-card border border-forge-border rounded-xl p-5
                            hover:border-forge-border/70 transition-colors">
              {/* Icon + Name */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-forge-accent/10 flex items-center justify-center">
                    <FileAudio size={20} className="text-forge-accent" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{m.name}</p>
                    <p className="text-xs text-forge-text-secondary">{m.size_mb.toFixed(1)} MB</p>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center gap-2 mb-4">
                {m.has_index ? (
                  <span className="flex items-center gap-1 text-xs text-forge-success">
                    <CheckCircle size={12} />
                    Index ready
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-yellow-500">
                    <AlertTriangle size={12} />
                    No index (lower quality)
                  </span>
                )}
              </div>

              {/* Delete */}
              {confirmDelete === m.name ? (
                <div className="flex gap-2">
                  <button onClick={() => handleDelete(m.name)}
                          disabled={deleting === m.name}
                          className="flex-1 py-2 bg-forge-error text-white rounded-lg text-xs font-medium
                                     hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                    {deleting === m.name ? <Loader2 size={14} className="animate-spin" /> : null}
                    Confirm
                  </button>
                  <button onClick={() => setConfirmDelete(null)}
                          className="flex-1 py-2 bg-forge-input text-forge-text rounded-lg text-xs font-medium
                                     hover:bg-forge-border/50 transition-colors">
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(m.name)}
                        className="w-full py-2 bg-forge-input border border-forge-border text-forge-text-secondary
                                   rounded-lg text-xs font-medium hover:border-forge-error/50 hover:text-forge-error
                                   transition-colors flex items-center justify-center gap-1">
                  <Trash2 size={14} />
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
