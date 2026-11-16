import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Link2,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { Card } from '../components/common/Card';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { Avatar } from '../components/common/Avatar';
import { Badge } from '../components/common/Badge';
import { useAuth, useMeetings, useToast } from '../hooks/useAppContext';
import { meetingService } from '../services/meetingService';
import { parseMeetingInput, validateMeetingInput } from '../utils/validators';
import { formatMeetingDate, formatMeetingTime } from '../utils/formatters';
import './pages.css';

export function JoinMeetingPage() {
  const { user } = useAuth();
  const { upcomingMeetings, syncMeetingInList } = useMeetings();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [meetingInput, setMeetingInput] = useState('');
  const [displayName, setDisplayName] = useState(user?.fullName || '');
  const [error, setError] = useState('');
  const [apiError, setApiError] = useState('');
  const [previewInfo, setPreviewInfo] = useState(null);
  const [checkingDetails, setCheckingDetails] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);

  const handleLookupDetails = async (rawValue = meetingInput) => {
    const validationErr = validateMeetingInput(rawValue);
    if (validationErr) {
      setError(validationErr);
      setPreviewInfo(null);
      return;
    }

    const meetingId = parseMeetingInput(rawValue);
    setCheckingDetails(true);
    setApiError('');
    try {
      const meeting = await meetingService.getMeetingDetails(meetingId);
      setPreviewInfo(meeting);
    } catch (err) {
      setPreviewInfo(null);
      // 403 is expected if the user has not joined yet; let Join Meeting handle membership
      if (err.status !== 403) {
        setApiError(err.message);
      }
    } finally {
      setCheckingDetails(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    const validationErr = validateMeetingInput(meetingInput);
    if (validationErr) {
      setError(validationErr);
      return;
    }

    const meetingId = parseMeetingInput(meetingInput);
    setIsJoining(true);
    setApiError('');
    try {
      const joinData = await meetingService.joinMeeting(meetingId);
      if (joinData?.meeting) {
        syncMeetingInList(joinData.meeting);
      }
      showToast(`Joined meeting ${meetingId}.`, 'success');
      navigate(`/room/${meetingId}`, {
        state: {
          preloadedMeeting: joinData?.meeting,
          initialMicOn: micEnabled,
          initialCameraOn: cameraEnabled,
          displayName: displayName.trim() || user?.fullName,
        },
      });
    } catch (err) {
      setApiError(err.message || 'Unable to join meeting.');
      showToast(err.message || 'Unable to join meeting.', 'error');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="ms-page-header">
        <div>
          <h1>Join a Meeting</h1>
          <p>
            Enter a Meeting ID or paste an invite link, check your pre-join preview, and join via the server.
          </p>
        </div>
      </div>

      <div className="ms-two-col">
        <Card>
          <div className="ms-prejoin-stage">
            {cameraEnabled ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Avatar
                  name={displayName || user?.fullName || 'User'}
                  color={user?.avatarColor || '#1a73e8'}
                  size="xl"
                />
                <span style={{ fontSize: 13.5, color: '#cbd5e1' }}>
                  Simulated Camera Preview Active
                </span>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#9aa0a6' }}>
                <VideoOff size={34} style={{ marginBottom: 8 }} />
                <p style={{ fontSize: 14 }}>Camera is turned off</p>
              </div>
            )}

            <div className="ms-prejoin-controls">
              <button
                type="button"
                className={`ms-circle-ctrl ${!micEnabled ? 'ms-circle-ctrl--off' : ''}`}
                onClick={() => setMicEnabled((prev) => !prev)}
                aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
                title={micEnabled ? 'Microphone On' : 'Microphone Muted'}
              >
                {micEnabled ? <Mic size={19} /> : <MicOff size={19} />}
              </button>
              <button
                type="button"
                className={`ms-circle-ctrl ${!cameraEnabled ? 'ms-circle-ctrl--off' : ''}`}
                onClick={() => setCameraEnabled((prev) => !prev)}
                aria-label={cameraEnabled ? 'Turn off camera' : 'Turn on camera'}
                title={cameraEnabled ? 'Camera On' : 'Camera Off'}
              >
                {cameraEnabled ? <Video size={19} /> : <VideoOff size={19} />}
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 13.5,
              color: 'var(--text-secondary)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={15} color="var(--color-secondary)" />
              Mic: {micEnabled ? 'Ready' : 'Muted'} · Camera: {cameraEnabled ? 'On' : 'Off'}
            </span>
            <span>Pre-join check</span>
          </div>
        </Card>

        <Card>
          <form
            onSubmit={handleJoin}
            style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
            noValidate
          >
            <h2 style={{ fontSize: 19 }}>Meeting Details</h2>

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
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{apiError}</span>
              </div>
            )}

            <Input
              label="Meeting ID or Meeting Link"
              name="meetingInput"
              placeholder="e.g., abc-defg-hij or http://localhost:5173/room/abc-defg-hij"
              value={meetingInput}
              onChange={(e) => {
                setMeetingInput(e.target.value);
                if (error) setError('');
                if (apiError) setApiError('');
                setPreviewInfo(null);
              }}
              error={error}
              leftIcon={<Link2 size={16} />}
            />

            <Input
              label="Display Name in Meeting"
              name="displayName"
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />

            {previewInfo && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-color)',
                  fontSize: 13.5,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <strong>{previewInfo.title}</strong>
                  <Badge variant={previewInfo.status === 'active' ? 'success' : 'primary'}>
                    {previewInfo.status}
                  </Badge>
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12.5 }}>
                  Host: {previewInfo.host?.name}
                  {previewInfo.scheduledAt &&
                    ` · ${formatMeetingDate(previewInfo.scheduledAt)} ${formatMeetingTime(
                      previewInfo.scheduledAt
                    )}`}
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleLookupDetails()}
                loading={checkingDetails}
              >
                Check Info
              </Button>
              <Button type="submit" size="lg" fullWidth loading={isJoining}>
                <span>Join Meeting</span>
                <ArrowRight size={17} />
              </Button>
            </div>
          </form>

          {upcomingMeetings.length > 0 && (
            <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--border-color)' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>
                Quick Fill from Your Upcoming / Active Meetings:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upcomingMeetings.slice(0, 3).map((m) => (
                  <button
                    key={m._id || m.meetingId}
                    type="button"
                    onClick={() => {
                      setMeetingInput(m.meetingId);
                      setError('');
                      setApiError('');
                      setPreviewInfo(m);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-app)',
                      textAlign: 'left',
                      fontSize: 13,
                    }}
                  >
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                      {m.title}
                    </span>
                    <span className="ms-code-chip">{m.meetingId}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
