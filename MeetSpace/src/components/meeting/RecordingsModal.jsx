import { useEffect, useState } from 'react';
import { Film, Play, Download, Loader2, AlertCircle, X, Clock, HardDrive, CheckCircle2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { recordingService } from '../../services/recordingService';
import { formatElapsedTimer } from '../../utils/formatters';

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRecordingDate(isoDate) {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return isoDate;
  }
}

export function RecordingsModal({ isOpen, onClose, meetingId, meetingTitle }) {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPlayback, setSelectedPlayback] = useState(null);

  const handleClose = () => {
    setSelectedPlayback(null);
    onClose();
  };

  useEffect(() => {
    if (!isOpen || !meetingId) {
      return;
    }

    let isMounted = true;
    async function loadRecordings() {
      setLoading(true);
      setError('');
      try {
        const list = await recordingService.listRecordings(meetingId);
        if (isMounted) setRecordings(list);
      } catch (err) {
        if (isMounted) setError(err.message || 'Failed to load recordings.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadRecordings();
    return () => {
      isMounted = false;
    };
  }, [isOpen, meetingId]);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Meeting Recordings" size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', margin: 0 }}>
          Recordings captured for <strong>{meetingTitle || meetingId}</strong> via LiveKit Egress.
        </p>

        {loading && (
          <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Loader2 size={24} className="ms-spin" style={{ margin: '0 auto 8px' }} />
            <p style={{ margin: 0, fontSize: 13.5 }}>Loading recordings...</p>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: 12,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #ef4444',
              borderRadius: 8,
              color: '#f87171',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13.5,
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Video Player Preview when a recording is selected */}
        {selectedPlayback && (
          <div
            style={{
              background: '#090d16',
              border: '1px solid #1e293b',
              borderRadius: 10,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: '#f1f5f9' }}>
                Playing: {selectedPlayback.fileName || selectedPlayback.recordingId}
              </span>
              <button
                type="button"
                onClick={() => setSelectedPlayback(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                }}
                title="Close player"
              >
                <X size={16} />
              </button>
            </div>
            <video
              controls
              autoPlay
              playsInline
              style={{
                width: '100%',
                maxHeight: 340,
                backgroundColor: '#000000',
                borderRadius: 6,
              }}
              src={recordingService.getStreamUrl(meetingId, selectedPlayback.recordingId)}
            />
          </div>
        )}

        {!loading && !error && recordings.length === 0 && (
          <div
            style={{
              padding: '40px 16px',
              textAlign: 'center',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 10,
              border: '1px dashed var(--border-color, #334155)',
            }}
          >
            <Film size={32} color="#64748b" style={{ margin: '0 auto 10px' }} />
            <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 500, color: '#e2e8f0' }}>
              No recordings found
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
              The host has not recorded any sessions for this meeting yet.
            </p>
          </div>
        )}

        {!loading && recordings.length > 0 && (
          <div className="ms-recordings-list">
            {recordings.map((rec) => {
              const isCompleted = rec.status === 'completed';
              const isFailed = rec.status === 'failed';
              const isLive = rec.status === 'recording' || rec.status === 'starting';

              return (
                <div key={rec.recordingId} className="ms-recording-item">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 14, color: '#f8fafc' }}>
                        {rec.fileName || rec.recordingId}
                      </strong>
                      <Badge
                        variant={
                          isCompleted
                            ? 'success'
                            : isLive
                              ? 'danger'
                              : isFailed
                                ? 'danger'
                                : 'warning'
                        }
                      >
                        {isCompleted ? (
                          <>
                            <CheckCircle2 size={11} /> Ready
                          </>
                        ) : isLive ? (
                          <>
                            <span className="ms-rec-dot" style={{ width: 6, height: 6 }} /> Active
                          </>
                        ) : (
                          rec.status
                        )}
                      </Badge>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        fontSize: 12,
                        color: '#94a3b8',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} />
                        {rec.duration ? formatElapsedTimer(rec.duration) : '00:00'}
                      </span>
                      {rec.fileSize > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <HardDrive size={12} />
                          {formatFileSize(rec.fileSize)}
                        </span>
                      )}
                      <span>{formatRecordingDate(rec.startedAt || rec.createdAt)}</span>
                    </div>

                    {isFailed && rec.error && (
                      <span style={{ fontSize: 12, color: '#f87171' }}>Error: {rec.error}</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {isCompleted && (
                      <>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setSelectedPlayback(rec)}
                          title="Watch recording playback"
                        >
                          <Play size={14} />
                          <span>Watch</span>
                        </Button>
                        <a
                          href={recordingService.getDownloadUrl(meetingId, rec.recordingId)}
                          download={rec.fileName || 'recording.mp4'}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ textDecoration: 'none' }}
                        >
                          <Button variant="outline" size="sm" title="Download recording MP4">
                            <Download size={14} />
                            <span>Download</span>
                          </Button>
                        </a>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default RecordingsModal;
