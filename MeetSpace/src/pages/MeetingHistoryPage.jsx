import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Calendar,
  Clock,
  Users,
  Video,
  Info,
  Copy,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Film,
} from 'lucide-react';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { RecordingsModal } from '../components/meeting/RecordingsModal';
import { useToast } from '../hooks/useAppContext';
import { meetingService } from '../services/meetingService';
import {
  formatDuration,
  formatMeetingDate,
  formatMeetingTime,
} from '../utils/formatters';
import { buildMeetingLink, copyTextToClipboard } from '../utils/meetingHelpers';
import './pages.css';

export function MeetingHistoryPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [roleFilter, setRoleFilter] = useState('all'); // 'all' | 'hosted' | 'attended'
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const limit = 6;

  const [history, setHistory] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [selectedRecordingsMeeting, setSelectedRecordingsMeeting] = useState(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await meetingService.getMeetingHistory({
        role: roleFilter,
        search: searchQuery.trim() || undefined,
        page,
        limit,
        sortBy: 'endedAt',
        sortOrder,
      });
      setHistory(data.history);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.message || 'Failed to load meeting history.');
    } finally {
      setLoading(false);
    }
  }, [roleFilter, searchQuery, page, sortOrder]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadHistory();
    }, 180);
    return () => clearTimeout(timer);
  }, [loadHistory]);

  return (
    <DashboardLayout>
      <div className="ms-page-header">
        <div>
          <h1>Meeting History</h1>
          <p>
            Review past and cancelled sessions, durations, hosts, and participation records.
          </p>
        </div>
        <Button variant="primary" onClick={() => navigate('/create-meeting')}>
          <Video size={16} />
          <span>New Meeting</span>
        </Button>
      </div>

      <div className="ms-filter-bar">
        <div className="ms-pill-group" role="tablist" aria-label="Filter meetings">
          {[
            { id: 'all', label: 'All Meetings' },
            { id: 'hosted', label: 'Hosted by Me' },
            { id: 'attended', label: 'Attended' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={roleFilter === tab.id}
              className={`ms-pill-btn ${roleFilter === tab.id ? 'ms-pill-btn--active' : ''}`}
              onClick={() => {
                setRoleFilter(tab.id);
                setPage(1);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            aria-label="Sort order"
            className="ms-select"
            style={{ width: 'auto', paddingTop: 8, paddingBottom: 8 }}
            value={sortOrder}
            onChange={(e) => {
              setSortOrder(e.target.value);
              setPage(1);
            }}
          >
            <option value="desc">Newest First</option>
            <option value="asc">Oldest First</option>
          </select>

          <div style={{ position: 'relative', minWidth: 250 }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              id="historySearch"
              name="historySearch"
              type="text"
              className="ms-input ms-input--with-left"
              placeholder="Search by title or Meeting ID..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              aria-label="Search meeting history"
            />
          </div>
        </div>
      </div>

      <div className="ms-meeting-list">
        {loading ? (
          <Card>
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0' }}>
              Loading meeting history...
            </p>
          </Card>
        ) : error ? (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--color-danger)' }}>
                <AlertCircle size={16} /> {error}
              </span>
              <Button variant="outline" size="sm" onClick={loadHistory}>
                Retry
              </Button>
            </div>
          </Card>
        ) : history.length > 0 ? (
          history.map((meeting) => {
            const isHost = Boolean(meeting.userParticipation?.isHost);
            const displayDate = meeting.startedAt || meeting.endedAt || meeting.scheduledAt;
            return (
              <Card key={meeting._id || meeting.meetingId} style={{ padding: '18px 22px' }}>
                <div className="ms-meeting-card__top">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h3 className="ms-meeting-card__title" style={{ marginBottom: 0 }}>
                        {meeting.title}
                      </h3>
                      <Badge variant={isHost ? 'primary' : 'neutral'}>
                        {isHost ? 'Hosted' : 'Attended'}
                      </Badge>
                      <Badge variant={meeting.status === 'cancelled' ? 'danger' : 'neutral'}>
                        {meeting.status === 'cancelled' ? 'Cancelled' : 'Ended'}
                      </Badge>
                    </div>
                    {meeting.description && (
                      <p className="ms-meeting-card__desc" style={{ marginTop: 4 }}>
                        {meeting.description}
                      </p>
                    )}
                  </div>
                  <span className="ms-code-chip">{meeting.meetingId}</span>
                </div>

                <div className="ms-meeting-card__meta" style={{ marginTop: 12 }}>
                  <span className="ms-meeting-card__meta-item">
                    <Calendar size={14} />
                    {formatMeetingDate(displayDate)} · {formatMeetingTime(displayDate)}
                  </span>
                  <span className="ms-meeting-card__meta-item">
                    <Clock size={14} />
                    {formatDuration(meeting.durationMinutes)}
                  </span>
                  <span className="ms-meeting-card__meta-item">
                    <Users size={14} />
                    Host: {meeting.host?.name || 'Unknown'} ({meeting.participantsCount} participants)
                  </span>
                </div>

                <div className="ms-meeting-card__footer" style={{ marginTop: 14 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                    {meeting.endedAt
                      ? `Ended ${formatMeetingDate(meeting.endedAt)} at ${formatMeetingTime(
                          meeting.endedAt
                        )}`
                      : 'Session recorded'}
                  </span>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedRecordingsMeeting(meeting)}
                      title="View meeting recordings"
                    >
                      <Film size={14} />
                      <span>Recordings</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedMeeting(meeting)}
                    >
                      <Info size={14} />
                      <span>Details</span>
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })
        ) : (
          <Card>
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '16px 0' }}>
              No meeting history records match your current filter.
            </p>
          </Card>
        )}
      </div>

      {pagination.totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 20,
          }}
        >
          <span style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} records)
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasPrevPage}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={15} /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasNextPage}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}

      <Modal
        isOpen={Boolean(selectedMeeting)}
        onClose={() => setSelectedMeeting(null)}
        title={selectedMeeting?.title || 'Past Meeting Details'}
        footer={
          <Button variant="primary" onClick={() => setSelectedMeeting(null)}>
            Close
          </Button>
        }
      >
        {selectedMeeting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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

            <div style={{ display: 'grid', gap: 8, fontSize: 13.5, color: 'var(--text-secondary)' }}>
              <div>
                <strong>Meeting ID:</strong> {selectedMeeting.meetingId}
              </div>
              <div>
                <strong>Status:</strong> {selectedMeeting.status}
              </div>
              <div>
                <strong>Started:</strong>{' '}
                {selectedMeeting.startedAt
                  ? `${formatMeetingDate(selectedMeeting.startedAt)} at ${formatMeetingTime(
                      selectedMeeting.startedAt
                    )}`
                  : 'Never started'}
              </div>
              <div>
                <strong>Ended:</strong>{' '}
                {selectedMeeting.endedAt
                  ? `${formatMeetingDate(selectedMeeting.endedAt)} at ${formatMeetingTime(
                      selectedMeeting.endedAt
                    )}`
                  : '—'}
              </div>
              <div>
                <strong>Duration:</strong> {formatDuration(selectedMeeting.durationMinutes)}
              </div>
              <div>
                <strong>Host:</strong> {selectedMeeting.host?.name || 'Unknown'}
              </div>
              <div>
                <strong>Total Participants:</strong> {selectedMeeting.participantsCount}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <RecordingsModal
        isOpen={Boolean(selectedRecordingsMeeting)}
        onClose={() => setSelectedRecordingsMeeting(null)}
        meetingId={selectedRecordingsMeeting?.meetingId}
        meetingTitle={selectedRecordingsMeeting?.title}
      />
    </DashboardLayout>
  );
}
