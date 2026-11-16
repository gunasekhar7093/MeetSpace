import { Copy } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { buildMeetingLink, copyTextToClipboard } from '../../utils/meetingHelpers';
import { useToast } from '../../hooks/useAppContext';

export function MeetingInfoModal({ isOpen, onClose, meetingId, title, hostName }) {
  const { showToast } = useToast();
  const link = buildMeetingLink(meetingId);

  const handleCopy = async (value, label) => {
    const ok = await copyTextToClipboard(value);
    if (ok) showToast(`${label} copied to clipboard.`, 'success');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Meeting Information"
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Meeting Title</span>
          <p style={{ fontWeight: 600, fontSize: 15 }}>{title}</p>
        </div>

        <div>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Host</span>
          <p style={{ fontWeight: 500 }}>{hostName}</p>
        </div>

        <div>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
            Meeting ID
          </span>
          <div className="ms-copy-box">
            <code>{meetingId}</code>
            <Button size="sm" variant="secondary" onClick={() => handleCopy(meetingId, 'Meeting ID')}>
              <Copy size={14} /> Copy
            </Button>
          </div>
        </div>

        <div>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
            Joining Link
          </span>
          <div className="ms-copy-box">
            <code>{link}</code>
            <Button size="sm" variant="secondary" onClick={() => handleCopy(link, 'Meeting link')}>
              <Copy size={14} /> Copy
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

