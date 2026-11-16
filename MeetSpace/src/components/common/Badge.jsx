export function Badge({ children, variant = 'neutral', className = '' }) {
  return (
    <span className={`ms-badge ms-badge--${variant} ${className}`.trim()}>
      {children}
    </span>
  );
}

