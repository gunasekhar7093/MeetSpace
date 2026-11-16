import './common.css';

export function Input({
  label,
  id,
  error,
  helperText,
  leftIcon,
  rightElement,
  className = '',
  ...props
}) {
  const inputId = id || props.name;
  const inputClasses = [
    'ms-input',
    leftIcon ? 'ms-input--with-left' : '',
    rightElement ? 'ms-input--with-right' : '',
    error ? 'ms-input--error' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="ms-field">
      {label && (
        <label htmlFor={inputId} className="ms-field__label">
          {label}
        </label>
      )}
      <div className="ms-field__control">
        {leftIcon && <span className="ms-field__icon-left">{leftIcon}</span>}
        <input id={inputId} className={inputClasses} {...props} />
        {rightElement && <span className="ms-field__icon-right">{rightElement}</span>}
      </div>
      {error ? (
        <span className="ms-field__error" role="alert">
          {error}
        </span>
      ) : helperText ? (
        <span className="ms-field__helper">{helperText}</span>
      ) : null}
    </div>
  );
}

