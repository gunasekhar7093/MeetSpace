import { CheckCircle2, Info, AlertCircle, X } from 'lucide-react';
import { useToast } from '../../hooks/useAppContext';
import './common.css';

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="ms-toast-container" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`ms-toast ms-toast--${toast.type}`}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {toast.type === 'success' && <CheckCircle2 size={16} color="#34a853" />}
            {toast.type === 'error' && <AlertCircle size={16} color="#f28b82" />}
            {toast.type === 'info' && <Info size={16} color="#8ab4f8" />}
            {toast.message}
          </span>
          <button
            type="button"
            className="ms-toast__close"
            onClick={() => removeToast(toast.id)}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

