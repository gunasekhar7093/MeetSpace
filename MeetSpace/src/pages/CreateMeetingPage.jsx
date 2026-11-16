import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Video,
  Calendar,
  Copy,
  Check,
  ArrowRight,
  Sparkles,
  Shield,
  AlertCircle,
} from 'lucide-react';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { Card } from '../components/common/Card';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { useAuth, useMeetings, useToast } from '../hooks/useAppContext';
import { validateRequired } from '../utils/validators';
import { copyTextToClipboard } from '../utils/meetingHelpers';
import { formatMeetingDate, formatMeetingTime } from '../utils/formatters';
import './pages.css';

function getDefaultScheduleDate() {
  const future = new Date(Date.now() + 60 * 60 * 1000);
  const year = future.getFullYear();
  const month = String(future.getMonth() + 1).padStart(2, '0');
  const day = String(future.getDate()).padStart(2, '0');
  const hours = String(future.getHours()).padStart(2, '0');
  const mins = String(future.getMinutes()).padStart(2, '0');
  return { date: `${year}-${month}-${day}`, time: `${hours}:${mins}` };
}

export function CreateMeetingPage() {
  const { user } = useAuth();
  const { createMeeting } = useMeetings();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const defaultSchedule = getDefaultScheduleDate();
  const [mode, setMode] = useState('instant'); // 'instant' | 'scheduled'
  const [form, setForm] = useState({
    title: '',
    description: '',
    date: defaultSchedule.date,
    time: defaultSchedule.time,
    participantLimit: 50,
    waitingRoomEnabled: false,
    chatEnabled: true,
    allowParticipantScreenShare: true,
  });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdMeeting, setCreatedMeeting] = useState(null);
  const [copiedField, setCopiedField] = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setErrors((prev) => ({ ...prev, [name]: '' }));
    setApiError('');
  };

  const validate = () => {
    const nextErrors = {};
    if (mode === 'scheduled') {
      nextErrors.title = validateRequired(form.title, 'Meeting title');
      nextErrors.date = validateRequired(form.date, 'Meeting date');
      nextErrors.time = validateRequired(form.time, 'Start time');
    } else if (form.title.trim() && form.title.trim().length < 2) {
      nextErrors.title = 'Meeting title must be at least 2 characters.';
    }
    setErrors(nextErrors);
    return !Object.values(nextErrors).some(Boolean);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsCreating(true);
    setApiError('');
    try {
      const isInstant = mode === 'instant';
      const scheduledAt = !isInstant
        ? new Date(`${form.date}T${form.time}:00`).toISOString()
        : undefined;

      const created = await createMeeting({
        title:
          form.title.trim() ||
          `${(user?.fullName || 'MeetSpace').split(' ')[0]}’s Instant Meeting`,
        description: form.description.trim(),
        isInstant,
        scheduledAt,
        settings: {
          waitingRoomEnabled: form.waitingRoomEnabled,
          chatEnabled: form.chatEnabled,
          screenShareEnabled: true,
          allowParticipantScreenShare: form.allowParticipantScreenShare,
          participantLimit: Number(form.participantLimit) || 50,
        },
      });

      setCreatedMeeting(created);
      showToast('Meeting created and saved to MeetSpace.', 'success');
    } catch (err) {
      if (Array.isArray(err.errors)) {
        const fieldErrors = {};
        for (const item of err.errors) {
          if (item.field === 'scheduledAt') fieldErrors.date = item.message;
          else if (item.field) fieldErrors[item.field] = item.message;
        }
        setErrors((prev) => ({ ...prev, ...fieldErrors }));
      }
      setApiError(err.message || 'Failed to create meeting.');
      showToast(err.message || 'Failed to create meeting.', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async (text, field) => {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedField(field);
      showToast(`${field === 'id' ? 'Meeting ID' : 'Meeting link'} copied!`, 'success');
      setTimeout(() => setCopiedField(''), 2000);
    }
  };

  return (
    <DashboardLayout>
      <div className="ms-page-header">
        <div>
          <h1>Create a Meeting</h1>
          <p>
            Launch an instant video room or schedule a future meeting with backend-generated links.
          </p>
        </div>
      </div>

      <div className="ms-two-col">
        <Card>
          <div className="ms-mode-tabs">
            <button
              type="button"
              className={`ms-mode-tab ${mode === 'instant' ? 'ms-mode-tab--active' : ''}`}
              onClick={() => {
                setMode('instant');
                setErrors({});
                setApiError('');
              }}
            >
              <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={16} color="var(--color-primary)" />
                Instant Meeting
              </strong>
              <span>Generate a room link and start immediately</span>
            </button>

            <button
              type="button"
              className={`ms-mode-tab ${mode === 'scheduled' ? 'ms-mode-tab--active' : ''}`}
              onClick={() => {
                setMode('scheduled');
                setApiError('');
              }}
            >
              <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={16} color="var(--color-primary)" />
                Schedule for Later
              </strong>
              <span>Pick a future date and start time</span>
            </button>
          </div>

          <form
            onSubmit={handleCreate}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            noValidate
          >
            {apiError && (
              <div
                role="alert"
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-danger-light)',
                  color: 'var(--color-danger)',
                  fontSize: 13.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <AlertCircle size={16} />
                <span>{apiError}</span>
              </div>
            )}

            <Input
              label={mode === 'instant' ? 'Meeting Title (Optional)' : 'Meeting Title'}
              name="title"
              placeholder="e.g., Weekly Product & Engineering Sync"
              value={form.title}
              onChange={handleChange}
              error={errors.title}
            />

            <div className="ms-field">
              <label htmlFor="description" className="ms-field__label">
                Agenda / Notes (Optional)
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                className="ms-textarea"
                placeholder="Share topics or notes for participants..."
                value={form.description}
                onChange={handleChange}
              />
            </div>

            {mode === 'scheduled' && (
              <div className="ms-form-grid">
                <Input
                  label="Date"
                  name="date"
                  type="date"
                  value={form.date}
                  onChange={handleChange}
                  error={errors.date}
                />
                <Input
                  label="Start Time"
                  name="time"
                  type="time"
                  value={form.time}
                  onChange={handleChange}
                  error={errors.time}
                />
              </div>
            )}

            <div className="ms-field">
              <label htmlFor="participantLimit" className="ms-field__label">
                Participant Limit
              </label>
              <select
                id="participantLimit"
                name="participantLimit"
                className="ms-select"
                value={form.participantLimit}
                onChange={handleChange}
              >
                <option value={10}>Up to 10 participants</option>
                <option value={25}>Up to 25 participants</option>
                <option value={50}>Up to 50 participants</option>
                <option value={100}>Up to 100 participants</option>
              </select>
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
              <div className="ms-toggle-row">
                <div>
                  <h4>Enable in-meeting chat</h4>
                  <p>Allow participants to send chat messages</p>
                </div>
                <input
                  type="checkbox"
                  name="chatEnabled"
                  checked={form.chatEnabled}
                  onChange={handleChange}
                />
              </div>
              <div className="ms-toggle-row">
                <div>
                  <h4>Enable waiting room</h4>
                  <p>Place non-host participants in waiting status on join</p>
                </div>
                <input
                  type="checkbox"
                  name="waitingRoomEnabled"
                  checked={form.waitingRoomEnabled}
                  onChange={handleChange}
                />
              </div>
              <div className="ms-toggle-row">
                <div>
                  <h4>Allow participant screen sharing</h4>
                  <p>Participants can share their screen during the call</p>
                </div>
                <input
                  type="checkbox"
                  name="allowParticipantScreenShare"
                  checked={form.allowParticipantScreenShare}
                  onChange={handleChange}
                />
              </div>
            </div>

            <Button type="submit" size="lg" loading={isCreating}>
              <Video size={18} />
              <span>
                {mode === 'instant' ? 'Create Instant Meeting' : 'Schedule Meeting'}
              </span>
            </Button>
          </form>
        </Card>

        <Card>
          {createdMeeting ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <Badge variant="success" style={{ marginBottom: 10 }}>
                  {createdMeeting.status === 'active' ? 'Live Room Created' : 'Meeting Scheduled'}
                </Badge>
                <h2 style={{ fontSize: 20, marginBottom: 4 }}>{createdMeeting.title}</h2>
                <p style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>
                  {createdMeeting.isInstant
                    ? 'Instant session created and persisted in MongoDB.'
                    : `${formatMeetingDate(createdMeeting.scheduledAt)} at ${formatMeetingTime(
                        createdMeeting.scheduledAt
                      )}`}
                </p>
              </div>

              <div>
                <label className="ms-field__label" style={{ display: 'block', marginBottom: 6 }}>
                  Meeting ID
                </label>
                <div className="ms-copy-box">
                  <code>{createdMeeting.meetingId}</code>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleCopy(createdMeeting.meetingId, 'id')}
                  >
                    {copiedField === 'id' ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedField === 'id' ? 'Copied' : 'Copy ID'}</span>
                  </Button>
                </div>
              </div>

              <div>
                <label className="ms-field__label" style={{ display: 'block', marginBottom: 6 }}>
                  Shareable Meeting Link
                </label>
                <div className="ms-copy-box">
                  <code>{createdMeeting.meetingLink}</code>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleCopy(createdMeeting.meetingLink, 'link')}
                  >
                    {copiedField === 'link' ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedField === 'link' ? 'Copied' : 'Copy Link'}</span>
                  </Button>
                </div>
              </div>

              <div
                style={{
                  background: 'var(--bg-app)',
                  borderRadius: 'var(--radius-md)',
                  padding: 12,
                  fontSize: 12.5,
                  color: 'var(--text-muted)',
                  display: 'flex',
                  gap: 8,
                }}
              >
                <Shield size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  Generated securely by the MeetSpace backend with host ownership assigned to{' '}
                  {createdMeeting.host?.name || user?.fullName}.
                </span>
              </div>

              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={() =>
                  navigate(`/room/${createdMeeting.meetingId}`, {
                    state: { preloadedMeeting: createdMeeting },
                  })
                }
              >
                <span>Enter Meeting Room</span>
                <ArrowRight size={17} />
              </Button>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: '28px 12px',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--color-primary-light)',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Video size={26} />
              </div>
              <h3 style={{ fontSize: 17 }}>Your meeting details will appear here</h3>
              <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', maxWidth: 300 }}>
                Submit the form to generate a unique server-side Meeting ID, invite link, and direct room access.
              </p>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
