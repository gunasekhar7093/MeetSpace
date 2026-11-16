import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  UserX,
  Pin,
  ShieldCheck,
  Hand,
  Search,
} from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../common/Avatar';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import './meeting.css';

export function ParticipantsPanel({
  participants,
  isCurrentUserHost,
  pinnedId,
  onTogglePin,
  onToggleParticipantMute,
  onMuteAll,
  onRemoveParticipant,
}) {
  const [query, setQuery] = useState('');

  const filtered = participants.filter((p) =>
    p.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="ms-sidebar-body">
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'grid', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            id="participantSearch"
            name="participantSearch"
            type="text"
            placeholder="Search participants..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ms-input ms-input--with-left"
            style={{ paddingTop: 7, paddingBottom: 7, fontSize: 13 }}
          />
        </div>

        {isCurrentUserHost && (
          <Button variant="secondary" size="sm" fullWidth onClick={onMuteAll}>
            <MicOff size={14} />
            <span>Mute All Participants</span>
          </Button>
        )}
      </div>

      <div className="ms-participants-scroll">
        {filtered.map((p) => (
          <div key={p.id} className="ms-participant-row">
            <div className="ms-participant-info">
              <Avatar name={p.name} color={p.avatarColor} size="sm" />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="ms-participant-name">
                    {p.name} {p.isSelf ? '(You)' : ''}
                  </span>
                  {p.isHost && (
                    <Badge variant="primary">
                      <ShieldCheck size={11} /> Host
                    </Badge>
                  )}
                </div>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  {p.isHandRaised
                    ? 'Hand raised'
                    : p.isSpeaking && !p.isMuted
                    ? 'Speaking'
                    : p.isMuted
                    ? 'Muted'
                    : 'Active'}
                </span>
              </div>
            </div>

            <div className="ms-participant-actions">
              {p.isHandRaised && (
                <span title="Hand raised" style={{ color: '#d97706', display: 'flex', marginRight: 2 }}>
                  <Hand size={14} />
                </span>
              )}

              <span
                title={p.isCameraOn ? 'Camera On' : 'Camera Off'}
                style={{ color: p.isCameraOn ? 'var(--color-secondary)' : 'var(--text-muted)', display: 'flex' }}
              >
                {p.isCameraOn ? <Video size={14} /> : <VideoOff size={14} />}
              </span>

              {isCurrentUserHost && !p.isSelf ? (
                <button
                  type="button"
                  className="ms-mini-icon-btn"
                  onClick={() => onToggleParticipantMute(p.id)}
                  title={p.isMuted ? 'Request unmute' : 'Mute participant'}
                >
                  {p.isMuted ? <MicOff size={14} color="#d93025" /> : <Mic size={14} />}
                </button>
              ) : (
                <span
                  title={p.isMuted ? 'Muted' : 'Mic On'}
                  style={{ color: p.isMuted ? 'var(--color-danger)' : 'var(--color-secondary)', display: 'flex', padding: '0 4px' }}
                >
                  {p.isMuted ? <MicOff size={14} /> : <Mic size={14} />}
                </span>
              )}

              <button
                type="button"
                className="ms-mini-icon-btn"
                onClick={() => onTogglePin(p.id)}
                title={pinnedId === p.id ? 'Unpin' : 'Pin video'}
                style={
                  pinnedId === p.id
                    ? { background: 'var(--color-primary-light)', color: 'var(--color-primary)' }
                    : undefined
                }
              >
                <Pin size={14} />
              </button>

              {isCurrentUserHost && !p.isSelf && (
                <button
                  type="button"
                  className="ms-mini-icon-btn ms-mini-icon-btn--danger"
                  onClick={() => onRemoveParticipant(p.id)}
                  title={`Remove ${p.name}`}
                >
                  <UserX size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

