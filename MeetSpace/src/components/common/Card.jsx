import './common.css';

export function Card({ children, padded = true, className = '', ...props }) {
  return (
    <div
      className={`ms-card ${padded ? 'ms-card--padded' : ''} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

