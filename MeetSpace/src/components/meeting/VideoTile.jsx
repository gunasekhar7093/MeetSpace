import { useEffect, useRef } from 'react';
import { Mic, MicOff, Hand, Pin, ShieldCheck, VideoOff, Loader2, MonitorUp } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import './meeting.css';

export function VideoTile({
  participant,
  isSelf = false,
  isPinned = false,
  onTogglePin,
}) {
  const {
    name,
    isHost,
    isMuted,
    isCameraOn,
    isScreenSharing,
    isSpeaking,
    isHandRaised,
    avatarColor,
    stream,
    connectionState,
  } = participant;

  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
    }
  }, [stream]);

  const tileClasses = [
    'ms-video-tile',
    isSpeaking && !isMuted ? 'ms-video-tile--speaking' : '',
    isPinned ? 'ms-video-tile--pinned' : '',
    isScreenSharing ? 'ms-video-tile--screenshare' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const showVideo = (isCameraOn || isScreenSharing) && Boolean(stream);

  return (
    <div className={tileClasses}>
      {/* Real WebRTC Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isSelf}
        style={{
          width: '100%',
          height: '100%',
          objectFit: isScreenSharing ? 'contain' : 'cover',
          backgroundColor: isScreenSharing ? '#000000' : 'transparent',
          display: showVideo ? 'block' : 'none',
          transform: isSelf && !isScreenSharing ? 'scaleX(-1)' : 'none',
        }}
      />

      {/* Fallback Avatar when Camera is Off or Stream not ready */}
      {!showVideo && (
        <div className="ms-video-tile__cam-sim">
          <Avatar name={name} color={avatarColor} size="xl" />
          <span
            className="ms-video-tile__cam-label"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <VideoOff size={12} /> Camera Off
          </span>
        </div>
      )}

      {/* Top Overlay Badges */}
      <div className="ms-video-tile__top-badges">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {isScreenSharing && (
            <span className="ms-tile-pill ms-tile-pill--screenshare" title="Presenting Screen">
              <MonitorUp size={12} color="#93c5fd" />
              Presenting
            </span>
          )}
          {isHost && (
            <span className="ms-tile-pill">
              <ShieldCheck size={12} color="#8ab4f8" />
              Host
            </span>
          )}
          {isHandRaised && (
            <span className="ms-tile-pill ms-tile-pill--hand">
              <Hand size={12} />
              Hand Raised
            </span>
          )}
          {!isSelf && connectionState && connectionState !== 'connected' && (
            <span className="ms-tile-pill" title={`Connection state: ${connectionState}`}>
              {connectionState === 'connecting' || connectionState === 'new' ? (
                <>
                  <Loader2 size={11} className="ms-spin" /> Connecting
                </>
              ) : connectionState === 'reconnecting' ? (
                <>
                  <Loader2 size={11} className="ms-spin" /> Reconnecting
                </>
              ) : connectionState === 'failed' ? (
                'Connection Failed'
              ) : (
                connectionState
              )}
            </span>
          )}
        </div>

        {onTogglePin && (
          <button
            type="button"
            className="ms-tile-pill"
            onClick={() => onTogglePin(participant.id)}
            style={{ border: 'none' }}
            title={isPinned ? 'Unpin participant' : 'Pin participant'}
          >
            <Pin size={12} />
            {isPinned ? 'Pinned' : 'Pin'}
          </button>
        )}
      </div>

      {/* Bottom Footer Overlay */}
      <div className="ms-video-tile__footer">
        <span className="ms-tile-name">
          {name} {isSelf ? '(You)' : ''} {isScreenSharing ? '(Presenting)' : ''}
        </span>
        <span
          className={`ms-tile-mic-status ${isMuted ? 'ms-tile-mic-status--muted' : ''}`}
          title={isMuted ? 'Muted' : 'Microphone Active'}
        >
          {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
        </span>
      </div>
    </div>
  );
}
