import { Calendar, Copy, Users, Video, Info, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { formatMeetingDate, formatMeetingTime } from '../../utils/formatters';
import { buildMeetingLink, copyTextToClipboard } from '../../utils/meetingHelpers';
import { useAuth, useToast } from '../../hooks/useAppContext';

export function MeetingCard({ meeting, onViewDetails, onCancelMeeting }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const hostName = meeting.host?.name || meeting.hostName || 'Unknown Host';
  const hostId = meeting.host?._id || meeting.host?.id || meeting.hostId;
  const isHost = Boolean(user?.id && hostId && String(hostId) === String(user.id));
  const displayDate = meeting.scheduledAt || meeting.startedAt || meeting.createdAt;
  const link = meeting.meetingLink || buildMeetingLink(meeting.meetingId);
  const participantCount = meeting.participants?.length ?? meeting.participantsCount ?? 0;

  const handleCopyLink = async () => {
    const copied = await copyTextToClipboard(link);
    if (copied) {
      showToast('Meeting link copied to clipboard.', 'success');
    } else {
      showToast(`Link: ${link}`, 'info');
    }
  };

  const statusVariant =
    meeting.status === 'active'
      ? 'success'
      : meeting.status === 'scheduled'
      ? 'primary'
      : meeting.status === 'cancelled'
      ? 'danger'
      : 'neutral';

  const statusLabel =
    meeting.status === 'active'
      ? 'Active Now'
      : meeting.status === 'scheduled'
      ? 'Scheduled'
      : meeting.status === 'cancelled'
      ? 'Cancelled'
      : 'Ended';

  const canJoin = meeting.status === 'active' || meeting.status === 'scheduled';

  return (
    <article className="ms-meeting-card">
      <div className="ms-meeting-card__top">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 className="ms-meeting-card__title" style={{ marginBottom: 0 }}>
              {meeting.title}
            </h3>
            {isHost && <Badge variant="neutral">Host</Badge>}
          </div>
          {meeting.description && (
            <p className="ms-meeting-card__desc" style={{ marginTop: 4 }}>
              {meeting.description}
            </p>
          )}
        </div>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </div>

      <div className="ms-meeting-card__meta">
        <span className="ms-meeting-card__meta-item">
          <Calendar size={14} />
          {meeting.isInstant && !meeting.scheduledAt
            ? `Started ${formatMeetingTime(displayDate)}`
            : `${formatMeetingDate(displayDate)} · ${formatMeetingTime(displayDate)}`}
        </span>
        <span className="ms-meeting-card__meta-item">
          <Users size={14} />
          Host: {hostName} ({participantCount})
        </span>
      </div>

      <div className="ms-meeting-card__footer">
        <span className="ms-code-chip" title="Meeting ID">
          {meeting.meetingId}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" size="sm" onClick={handleCopyLink} title="Copy meeting link">
            <Copy size={14} />
            <span>Copy Link</span>
          </Button>

          {onViewDetails && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewDetails(meeting)}
            >
              <Info size={14} />
              <span>Details</span>
            </Button>
          )}

          {isHost && canJoin && onCancelMeeting && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCancelMeeting(meeting)}
              title="Cancel meeting"
              style={{ color: 'var(--color-danger)' }}
            >
              <XCircle size={14} />
              <span>Cancel</span>
            </Button>
          )}

          {canJoin && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate(`/room/${meeting.meetingId}`)}
            >
              <Video size={14} />
              <span>Join</span>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
