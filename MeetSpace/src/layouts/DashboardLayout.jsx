import { useEffect, useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import {
  Video,
  LayoutDashboard,
  PlusCircle,
  LogIn,
  History,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { Avatar } from '../components/common/Avatar';
import { useAuth, useToast } from '../hooks/useAppContext';
import './layouts.css';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/create-meeting', label: 'Create Meeting', icon: PlusCircle },
  { to: '/join-meeting', label: 'Join Meeting', icon: LogIn },
  { to: '/history', label: 'History', icon: History },
];

export function DashboardLayout({ children }) {
  const { user, isAuthenticated, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const formattedClock = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(now);

  const handleSignOut = async () => {
    await logout();
    showToast('Signed out of MeetSpace.', 'info');
    navigate('/login');
  };

  return (
    <div className="ms-app-shell">
      <header className="ms-topbar">
        <div className="ms-topbar__left">
          <Link to="/dashboard" className="ms-brand">
            <span className="ms-brand__icon">
              <Video size={19} />
            </span>
            <span>MeetSpace</span>
          </Link>

          <nav className="ms-nav" aria-label="Main navigation">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `ms-nav__link ${isActive ? 'ms-nav__link--active' : ''}`
                }
              >
                <Icon size={16} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="ms-topbar__right">
          <span className="ms-topbar__clock">{formattedClock}</span>

          <Link
            to="/settings"
            className="ms-icon-link"
            title="Settings"
            aria-label="Settings"
          >
            <Settings size={18} />
          </Link>

          <Link to="/profile" className="ms-user-pill" title="View profile">
            <Avatar
              name={user?.fullName || user?.name || 'User'}
              color={user?.avatarColor || '#1a73e8'}
              size="sm"
            />
            <span>{(user?.fullName || user?.name || 'User').split(' ')[0]}</span>
          </Link>

          {isAuthenticated ? (
            <button
              type="button"
              className="ms-icon-link"
              onClick={handleSignOut}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={18} />
            </button>
          ) : (
            <Link to="/login" className="ms-nav__link">
              Sign in
            </Link>
          )}

          <button
            type="button"
            className="ms-mobile-menu-btn"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <div className={`ms-mobile-drawer ${mobileOpen ? 'ms-mobile-drawer--open' : ''}`}>
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `ms-nav__link ${isActive ? 'ms-nav__link--active' : ''}`
            }
          >
            <Icon size={16} />
            <span>{label}</span>
          </NavLink>
        ))}
        <NavLink
          to="/profile"
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            `ms-nav__link ${isActive ? 'ms-nav__link--active' : ''}`
          }
        >
          <span>Profile</span>
        </NavLink>
        <NavLink
          to="/settings"
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            `ms-nav__link ${isActive ? 'ms-nav__link--active' : ''}`
          }
        >
          <span>Settings</span>
        </NavLink>
      </div>

      <main className="ms-main-content">{children}</main>
    </div>
  );
}

