import './common.css';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  type = 'button',
  disabled = false,
  loading = false,
  className = '',
  ...props
}) {
  const classes = [
    'ms-btn',
    `ms-btn--${variant}`,
    `ms-btn--${size}`,
    fullWidth ? 'ms-btn--full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? 'Please wait...' : children}
    </button>
  );
}

