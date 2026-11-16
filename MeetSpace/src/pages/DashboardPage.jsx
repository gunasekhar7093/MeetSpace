import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Video,
  Plus,
  Calendar,
  History,
  Settings,
  User,
  Copy,
  ArrowRight,
  Clock,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { QuickJoinBar } from '../components/dashboard/QuickJoinBar';
import { MeetingCard } from '../components/dashboard/MeetingCard';
import { useAuth, useMeetings, useToast } from '../hooks/useAppContext';
import {
  formatDuration,
  formatMeetingDate,
  formatMeetingTime,
} from '../utils/formatters';
import { buildMeetingLink, copyTextToClipboard } from '../utils/meetingHelpers';
import './pages.css';

export function DashboardPage() {
  const { user } = useAuth();
  const {
    meetings,
    upcomingMeetings,
    recentHistory,
    loadingMeetings,
    meetingsError,
    fetchDashboardMeetings,
    createMeeting,
    cancelMeetingByCode,
  } = useMeetings();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [meetingFilter, setMeetingFilter] = useState('upcoming'); // 'upcoming' | 'active' | 'hosted' | 'joined'
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [creatingInstant, setCreatingInstant] = useState(false);

  const displayedMeetings = meetings.filter((m) => {
    const hostId = m.host?._id || m.host?.id || m.host;
    const isHost = Boolean(user?.id && hostId && String(hostId) === String(user.id));

    if (meetingFilter === 'active') return m.status === 'active';
    if (meetingFilter === 'hosted') return isHost;
    if (meetingFilter === 'joined') return !isHost;
    return m.status === 'scheduled' || m.status === 'active';
  });

  const activeCount = meetings.filter((m) => m.status === 'active').length;

  const handleInstantMeeting = async () => {
    setCreatingInstant(true);
    try {
      const created = await createMeeting({
        title: `${(user?.fullName || 'My').split(' ')[0]}’s Instant Meeting`,
        isInstant: true,
      });
      showToast(`Room ${created.meetingId} is ready.`, 'success');
      navigate(`/room/${created.meetingId}`, {
        state: { preloadedMeeting: created },
      });
    } catch (err) {
      showToast(err.message || 'Unable to start instant meeting.', 'error');
    } finally {
      setCreatingInstant(false);
    }
  };

  const handleCancelMeeting = async (meeting) => {
    try {
      await cancelMeetingByCode(meeting.meetingId);
      showToast(`Meeting "${meeting.title}" cancelled.`, 'info');
    } catch (err) {
      showToast(err.message || 'Could not cancel meeting.', 'error');
    }
  };

  return (
    <DashboardLayout>
      <section className="ms-hero-grid">
        <div className="ms-hero-card">
          <div>
            <Badge variant="primary" style={{ marginBottom: 12 }}>
              MeetSpace Workspace
            </Badge>
            <h1>Video calls and team collaboration, simplified.</h1>
            <p>
              Welcome back, <strong>{user?.fullName || user?.name}</strong>. Launch an instant meeting,
              schedule a session, or join using a Meeting ID or link.
            </p>
          </div>

          <div className="ms-hero-actions">
            <Button
              variant="primary"
              size="lg"
              onClick={handleInstantMeeting}
              loading={creatingInstant}
            >
              <Video size={18} />
              <span>Start Instant Meeting</span>
            </Button>

            <Button
              variant="secondary"
              size="lg"
              onClick={() => navigate('/create-meeting')}
            >
              <Plus size={18} />
              <span>Schedule / Create</span>
            </Button>

            <QuickJoinBar />
          </div>
        </div>

        <div className="ms-stats-card">
          <div className="ms-stat-box">
            <span className="ms-stat-box__label">Upcoming &amp; Scheduled</span>
            <span className="ms-stat-box__value">{upcomingMeetings.length}</span>
            <Link to="/create-meeting" style={{ fontSize: 13, fontWeight: 500 }}>
              Schedule new →
            </Link>
          </div>

          <div className="ms-stat-box">
            <span className="ms-stat-box__label">Active Live Rooms</span>
            <span className="ms-stat-box__value">{activeCount}</span>
            <Link to="/join-meeting" style={{ fontSize: 13, fontWeight: 500 }}>
              Join a room →
            </Link>
          </div>

          <div className="ms-stat-box">
            <span className="ms-stat-box__label">Past Sessions</span>
            <span className="ms-stat-box__value">{recentHistory.length}</span>
            <Link to="/history" style={{ fontSize: 13, fontWeight: 500 }}>
              View history →
            </Link>
          </div>

          <div className="ms-stat-box">
            <span className="ms-stat-box__label">Account &amp; Devices</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Link
                to="/profile"
                style={{
                  fontSize: 13.5,
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <User size={14} /> Profile
              </Link>
              <Link
                to="/settings"
                style={{
                  fontSize: 13.5,
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Settings size={14} /> Audio &amp; Video Settings
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="ms-dashboard-columns">
        <div>
          <div className="ms-section-header" style={{ flexWrap: 'wrap' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={19} color="var(--color-primary)" />
              Your Meetings
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div className="ms-pill-group">
                {[
                  { id: 'upcoming', label: 'Upcoming' },
                  { id: 'active', label: 'Active' },
                  { id: 'hosted', label: 'Hosted' },
                  { id: 'joined', label: 'Joined' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`ms-pill-btn ${
                      meetingFilter === tab.id ? 'ms-pill-btn--active' : ''
                    }`}
                    onClick={() => setMeetingFilter(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchDashboardMeetings}
                disabled={loadingMeetings}
                title="Refresh meetings"
              >
                <RefreshCw size={14} />
              </Button>
            </div>
          </div>

          <div className="ms-meeting-list">
            {loadingMeetings ? (
              <Card>
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '14px 0' }}>
                  Loading meetings from MeetSpace server...
                </p>
              </Card>
            ) : meetingsError ? (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--color-danger)', fontSize: 14 }}>
                    <AlertCircle size={16} /> {meetingsError}
                  </span>
                  <Button variant="outline" size="sm" onClick={fetchDashboardMeetings}>
                    Retry
                  </Button>
                </div>
              </Card>
            ) : displayedMeetings.length > 0 ? (
              displayedMeetings.map((meeting) => (
                <MeetingCard
                  key={meeting._id || meeting.meetingId}
                  meeting={meeting}
                  onViewDetails={setSelectedMeeting}
                  onCancelMeeting={handleCancelMeeting}
                />
              ))
            ) : (
              <Card>
                <p style={{ color: 'var(--text-secondary)' }}>
                  No {meetingFilter} meetings found. Click &ldquo;Schedule / Create&rdquo; or start an instant meeting.
                </p>
              </Card>
            )}
          </div>
        </div>

        <div>
          <div className="ms-section-header">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <History size={19} color="var(--color-secondary)" />
              Recent Meetings
            </h2>
            <Link
              to="/history"
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              All history <ArrowRight size={14} />
            </Link>
          </div>

          <div className="ms-meeting-list">
            {loadingMeetings ? (
              <Card>
                <p style={{ color: 'var(--text-secondary)' }}>Loading recent sessions...</p>
              </Card>
            ) : recentHistory.length > 0 ? (
              recentHistory.map((item) => {
                const dateVal = item.endedAt || item.startedAt || item.scheduledAt;
                return (
                  <Card key={item._id || item.meetingId} style={{ padding: '16px 18px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 10,
                        marginBottom: 8,
                      }}
                    >
                      <h3 style={{ fontSize: 15, fontWeight: 600 }}>{item.title}</h3>
                      <span className="ms-code-chip">{item.meetingId}</span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: 14,
                        fontSize: 12.5,
                        color: 'var(--text-muted)',
                        marginBottom: 10,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>
                        {formatMeetingDate(dateVal)} · {formatMeetingTime(dateVal)}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} /> {formatDuration(item.durationMinutes)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                        Host: {item.host?.name || 'Unknown'}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedMeeting(item)}
                      >
                        View summary
                      </Button>
                    </div>
                  </Card>
                );
              })
            ) : (
              <Card>
                <p style={{ color: 'var(--text-secondary)' }}>
                  No completed or cancelled meetings yet.
                </p>
              </Card>
            )}
          </div>
        </div>
      </section>

      <Modal
        isOpen={Boolean(selectedMeeting)}
        onClose={() => setSelectedMeeting(null)}
        title={selectedMeeting?.title || 'Meeting Details'}
        footer={
          selectedMeeting && (
            <>
              <Button variant="outline" onClick={() => setSelectedMeeting(null)}>
                Close
              </Button>
              {(selectedMeeting.status === 'active' ||
                selectedMeeting.status === 'scheduled') && (
                <Button
                  variant="primary"
                  onClick={() => {
                    const id = selectedMeeting.meetingId;
                    setSelectedMeeting(null);
                    navigate(`/room/${id}`);
                  }}
                >
                  Enter Meeting Room
                </Button>
              )}
            </>
          )
        }
      >
        {selectedMeeting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              {selectedMeeting.description || 'No description provided.'}
            </p>
            <div className="ms-copy-box">
              <code>
                {selectedMeeting.meetingLink ||
                  buildMeetingLink(selectedMeeting.meetingId)}
              </code>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const ok = await copyTextToClipboard(
                    selectedMeeting.meetingLink ||
                      buildMeetingLink(selectedMeeting.meetingId)
                  );
                  if (ok) showToast('Meeting link copied.', 'success');
                }}
              >
                <Copy size={14} /> Copy
              </Button>
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', display: 'grid', gap: 6 }}>
              <div>
                <strong>Meeting ID:</strong> {selectedMeeting.meetingId}
              </div>
              <div>
                <strong>Status:</strong> {selectedMeeting.status}
              </div>
              <div>
                <strong>Host:</strong> {selectedMeeting.host?.name || 'Unknown'}
              </div>
              {(selectedMeeting.scheduledAt || selectedMeeting.startedAt) && (
                <div>
                  <strong>Time:</strong>{' '}
                  {formatMeetingDate(
                    selectedMeeting.scheduledAt || selectedMeeting.startedAt
                  )}{' '}
                  {formatMeetingTime(
                    selectedMeeting.scheduledAt || selectedMeeting.startedAt
                  )}
                </div>
              )}
              {typeof selectedMeeting.durationMinutes === 'number' && (
                <div>
                  <strong>Duration:</strong>{' '}
                  {formatDuration(selectedMeeting.durationMinutes)}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
