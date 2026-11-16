import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  Hand,
  MessageSquare,
  Users,
  Info,
  Shield,
  PhoneOff,
  Power,
  CircleDot,
  Film,
} from 'lucide-react';
import './meeting.css';

export function MeetingControlsBar({
  isMuted,
  isCameraOn,
  isScreenSharing,
  isHandRaised,
  activeSidebar,
  participantCount,
  unreadCount,
  isHost,
  isRecording = false,
  recordingStatus = 'idle',
  onToggleRecording,
  onOpenRecordings,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onToggleHand,
  onToggleSidebar,
  onOpenInfo,
  onOpenHostControls,
  onLeaveMeeting,
  onRequestEndMeeting,
}) {
  return (
    <footer className="ms-room-controls" aria-label="Meeting controls">
      <div className="ms-controls-group">
        <button
          type="button"
          className="ms-ctrl-btn"
          onClick={onOpenInfo}
          title="Meeting information"
        >
          <Info size={18} />
          <span className="ms-ctrl-label">Details</span>
        </button>

        {isHost && (
          <button
            type="button"
            className="ms-ctrl-btn"
            onClick={onOpenHostControls}
            title="Host controls"
          >
            <Shield size={18} />
            <span className="ms-ctrl-label">Host Controls</span>
          </button>
        )}

        {isHost && (
          <button
            type="button"
            className={`ms-ctrl-btn ${isRecording ? 'ms-ctrl-btn--recording' : ''}`}
            onClick={onToggleRecording}
            title={
              recordingStatus === 'recording'
                ? 'Stop recording'
                : recordingStatus === 'starting'
                  ? 'Recording starting...'
                  : recordingStatus === 'stopping'
                    ? 'Recording stopping...'
                    : 'Record meeting'
            }
            aria-label="Toggle recording"
          >
            {isRecording ? (
              <span className="ms-rec-dot" style={{ margin: 4 }} />
            ) : (
              <CircleDot size={18} color="#f87171" />
            )}
            <span className="ms-ctrl-label">
              {recordingStatus === 'recording'
                ? 'Stop Rec'
                : recordingStatus === 'starting'
                  ? 'Starting...'
                  : recordingStatus === 'stopping'
                    ? 'Stopping...'
                    : 'Record'}
            </span>
          </button>
        )}

        {onOpenRecordings && (
          <button
            type="button"
            className="ms-ctrl-btn"
            onClick={onOpenRecordings}
            title="Meeting recordings"
          >
            <Film size={18} />
            <span className="ms-ctrl-label">Recordings</span>
          </button>
        )}
      </div>

      <div className="ms-controls-group">
        <button
          type="button"
          className={`ms-ctrl-btn ${isMuted ? 'ms-ctrl-btn--danger' : ''}`}
          onClick={onToggleMute}
          aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
          <span className="ms-ctrl-label">{isMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        <button
          type="button"
          className={`ms-ctrl-btn ${!isCameraOn ? 'ms-ctrl-btn--danger' : ''}`}
          onClick={onToggleCamera}
          aria-label={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
          title={isCameraOn ? 'Stop Video' : 'Start Video'}
        >
          {isCameraOn ? <Video size={18} /> : <VideoOff size={18} />}
          <span className="ms-ctrl-label">{isCameraOn ? 'Stop Video' : 'Start Video'}</span>
        </button>

        <button
          type="button"
          className={`ms-ctrl-btn ${isScreenSharing ? 'ms-ctrl-btn--active' : ''}`}
          onClick={onToggleScreenShare}
          title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
        >
          <MonitorUp size={18} />
          <span className="ms-ctrl-label">
            {isScreenSharing ? 'Stop Share' : 'Share Screen'}
          </span>
        </button>

        <button
          type="button"
          className={`ms-ctrl-btn ${isHandRaised ? 'ms-ctrl-btn--active' : ''}`}
          onClick={onToggleHand}
          title={isHandRaised ? 'Lower hand' : 'Raise hand'}
        >
          <Hand size={18} />
          <span className="ms-ctrl-label">{isHandRaised ? 'Lower' : 'Raise Hand'}</span>
        </button>
      </div>

      <div className="ms-controls-group">
        <button
          type="button"
          className={`ms-ctrl-btn ${activeSidebar === 'participants' ? 'ms-ctrl-btn--active' : ''}`}
          onClick={() => onToggleSidebar('participants')}
          title="Participants"
          aria-label="Toggle participants panel"
        >
          <Users size={18} />
          <span className="ms-ctrl-badge">{participantCount}</span>
        </button>

        <button
          type="button"
          className={`ms-ctrl-btn ${activeSidebar === 'chat' ? 'ms-ctrl-btn--active' : ''}`}
          onClick={() => onToggleSidebar('chat')}
          title="Meeting chat"
          aria-label="Toggle chat panel"
        >
          <MessageSquare size={18} />
          {unreadCount > 0 && <span className="ms-ctrl-badge">{unreadCount}</span>}
        </button>

        <button
          type="button"
          className="ms-ctrl-btn ms-ctrl-btn--danger"
          onClick={onLeaveMeeting}
          title="Leave meeting"
        >
          <PhoneOff size={18} />
          <span className="ms-ctrl-label">Leave</span>
        </button>

        {isHost && (
          <button
            type="button"
            className="ms-ctrl-btn"
            style={{ background: '#7f1d1d', color: '#fecaca' }}
            onClick={onRequestEndMeeting}
            title="End meeting for all"
          >
            <Power size={17} />
            <span className="ms-ctrl-label">End All</span>
          </button>
        )}
      </div>
    </footer>
  );
}

