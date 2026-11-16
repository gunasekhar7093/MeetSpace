import { getInitials } from '../../utils/formatters';
import './common.css';

export function Avatar({ name, color = '#1a73e8', size = 'md', className = '' }) {
  return (
    <span
      className={`ms-avatar ms-avatar--${size} ${className}`.trim()}
      style={{ backgroundColor: color }}
      aria-label={name}
    >
      {getInitials(name)}
    </span>
  );
}

