import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';

const BrainrotToastContext = createContext();

export function BrainrotToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const showToast = useCallback((gif, label) => {
    setToast({ gif, label, key: Date.now() });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const dismissToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  return (
    <BrainrotToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div key={toast.key} className="brainrot-toast" onClick={dismissToast}>
          <button className="brainrot-toast-close" onClick={(e) => { e.stopPropagation(); dismissToast(); }}>
            <X size={16} />
          </button>
          <img src={`/brainrot/${toast.gif}`} alt={toast.label || 'brainrot'} />
          {toast.label && <div className="brainrot-toast-label">{toast.label}</div>}
        </div>
      )}
    </BrainrotToastContext.Provider>
  );
}

export function useBrainrotToast() {
  const context = useContext(BrainrotToastContext);
  if (!context) {
    throw new Error('useBrainrotToast must be used within a BrainrotToastProvider');
  }
  return context;
}
