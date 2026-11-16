import { Shield, Lock, MicOff, Power } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';

export function HostControlsModal({
  isOpen,
  onClose,
  roomSettings,
  onUpdateRoomSetting,
  onMuteAll,
  onEndMeetingForAll,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Host Controls & Moderation"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: 12,
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-primary-light)',
            color: 'var(--color-primary)',
            fontSize: 13.5,
            fontWeight: 500,
          }}
        >
          <Shield size={18} />
          <span>You have host privileges for this MeetSpace session.</span>
        </div>

        <div>
          <div className="ms-toggle-row">
            <div>
              <h4>Lock Meeting Room</h4>
              <p>Prevent new participants from joining</p>
            </div>
            <input
              type="checkbox"
              checked={roomSettings.isLocked}
              onChange={(e) => onUpdateRoomSetting('isLocked', e.target.checked)}
            />
          </div>

          <div className="ms-toggle-row">
            <div>
              <h4>Waiting Room</h4>
              <p>Require host approval before guests enter</p>
            </div>
            <input
              type="checkbox"
              checked={roomSettings.waitingRoom}
              onChange={(e) => onUpdateRoomSetting('waitingRoom', e.target.checked)}
            />
          </div>

          <div className="ms-toggle-row">
            <div>
              <h4>Allow Screen Sharing</h4>
              <p>Let non-host participants present their screen</p>
            </div>
            <input
              type="checkbox"
              checked={roomSettings.allowScreenShare}
              onChange={(e) => onUpdateRoomSetting('allowScreenShare', e.target.checked)}
            />
          </div>

          <div className="ms-toggle-row">
            <div>
              <h4>Allow In-Meeting Chat</h4>
              <p>Enable text messaging in the chat drawer</p>
            </div>
            <input
              type="checkbox"
              checked={roomSettings.allowChat}
              onChange={(e) => onUpdateRoomSetting('allowChat', e.target.checked)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--border-color)' }}>
          <Button variant="secondary" onClick={onMuteAll}>
            <MicOff size={15} />
            <span>Mute All Participants</span>
          </Button>
          <Button variant="outline" onClick={() => onUpdateRoomSetting('isLocked', !roomSettings.isLocked)}>
            <Lock size={15} />
            <span>{roomSettings.isLocked ? 'Unlock Room' : 'Lock Room'}</span>
          </Button>
          <Button variant="danger" onClick={onEndMeetingForAll}>
            <Power size={15} />
            <span>End Meeting for All</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}

