import { useEffect } from 'react';
import { X } from 'lucide-react';
import './common.css';

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="ms-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={`ms-modal ${size === 'lg' ? 'ms-modal--lg' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ms-modal__header">
          <h3 className="ms-modal__title">{title}</h3>
          <button
            type="button"
            className="ms-modal__close"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>
        <div className="ms-modal__body">{children}</div>
        {footer && <div className="ms-modal__footer">{footer}</div>}
      </div>
    </div>
  );
}

