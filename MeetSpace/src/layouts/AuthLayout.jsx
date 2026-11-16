import { Video, ShieldCheck, Users, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import './layouts.css';

export function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="ms-auth-shell">
      <aside className="ms-auth-brand-pane">
        <Link to="/dashboard" className="ms-auth-logo">
          <span className="ms-auth-logo__mark">
            <Video size={20} />
          </span>
          <span>MeetSpace</span>
        </Link>

        <div className="ms-auth-hero">
          <h1>Video meetings built for effortless team collaboration.</h1>
          <p>
            Start instant rooms, schedule team syncs, manage participants, and collaborate in real time from anywhere.
          </p>
          <div className="ms-auth-highlights">
            <div className="ms-auth-highlight">
              <span className="ms-auth-highlight__icon">
                <Video size={17} />
              </span>
              <span>One-click instant rooms & scheduled meeting links</span>
            </div>
            <div className="ms-auth-highlight">
              <span className="ms-auth-highlight__icon">
                <Users size={17} />
              </span>
              <span>Host moderation controls & live participant roster</span>
            </div>
            <div className="ms-auth-highlight">
              <span className="ms-auth-highlight__icon">
                <MessageSquare size={17} />
              </span>
              <span>Built-in meeting chat and device readiness checks</span>
            </div>
            <div className="ms-auth-highlight">
              <span className="ms-auth-highlight__icon">
                <ShieldCheck size={17} />
              </span>
              <span>Frontend architecture ready for secure API integration</span>
            </div>
          </div>
        </div>

        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.68)' }}>
          MeetSpace Capstone — Frontend Phase (Mock Data Enabled)
        </p>
      </aside>

      <main className="ms-auth-form-pane">
        <div className="ms-auth-card">
          <div className="ms-auth-card__header">
            <h2 className="ms-auth-card__title">{title}</h2>
            {subtitle && <p className="ms-auth-card__subtitle">{subtitle}</p>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

