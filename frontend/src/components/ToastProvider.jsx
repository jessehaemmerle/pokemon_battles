import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter(x => x.id !== id));
  }, []);

  const show = useCallback((msg, opts = {}) => {
    const id = ++idRef.current;
    const toast = {
      id,
      msg,
      type: opts.type || 'info', // info | success | warn | error
      duration: opts.duration ?? 2200,
    };
    setToasts((t) => [...t, toast]);
    if (toast.duration > 0) {
      setTimeout(() => remove(id), toast.duration);
    }
  }, [remove]);

  const api = useMemo(() => ({
    show,
    info: (m, o) => show(m, { ...o, type: 'info' }),
    success: (m, o) => show(m, { ...o, type: 'success' }),
    warn: (m, o) => show(m, { ...o, type: 'warn' }),
    error: (m, o) => show(m, { ...o, type: 'error' }),
  }), [show]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-wrap" aria-live="polite" aria-atomic="true">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`} role="status">
            <span className="toast-dot" aria-hidden />
            <span>{t.msg}</span>
            <button className="toast-x" onClick={() => remove(t.id)} aria-label="Meldung schließen">×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
