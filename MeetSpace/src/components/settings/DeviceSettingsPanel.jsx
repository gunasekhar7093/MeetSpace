import { useState } from 'react';
import { Mic, Volume2, Video, Sparkles } from 'lucide-react';
import { Button } from '../common/Button';
import { Avatar } from '../common/Avatar';
import { MOCK_DEVICES } from '../../data/mockDevices';
import { useToast } from '../../hooks/useAppContext';

export function DeviceSettingsPanel({ deviceSettings, user, onChange }) {
  const { showToast } = useToast();
  const [micTestActive, setMicTestActive] = useState(false);

  const handleTestSpeaker = () => {
    showToast('Playing simulated speaker test chime...', 'info');
  };

  const handleTestMic = () => {
    setMicTestActive((prev) => !prev);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <h2 style={{ fontSize: 19, marginBottom: 4 }}>Audio &amp; Video Devices</h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>
          Configure your preferred microphone, speakers, and camera preview (mock device UI).
        </p>
      </div>

      {/* Camera Preview */}
      <div
        style={{
          background: '#202124',
          color: '#e8eaed',
          borderRadius: 'var(--radius-lg)',
          padding: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar name={user.fullName} color={user.avatarColor} size="lg" />
          <div>
            <strong style={{ display: 'block', fontSize: 15 }}>
              {MOCK_DEVICES.cameras.find((c) => c.id === deviceSettings.cameraId)?.label}
            </strong>
            <span style={{ fontSize: 13, color: '#9aa0a6' }}>
              {deviceSettings.hdVideo ? '1080p HD Enabled' : 'Standard 720p'} ·{' '}
              {deviceSettings.mirrorVideo ? 'Mirrored' : 'Normal'}
            </span>
          </div>
        </div>
        <span className="ms-badge ms-badge--success">Simulated Preview Ready</span>
      </div>

      {/* Device Selectors */}
      <div className="ms-field">
        <label htmlFor="cameraId" className="ms-field__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Video size={15} /> Camera
        </label>
        <select
          id="cameraId"
          className="ms-select"
          value={deviceSettings.cameraId}
          onChange={(e) => onChange('cameraId', e.target.value)}
        >
          {MOCK_DEVICES.cameras.map((cam) => (
            <option key={cam.id} value={cam.id}>
              {cam.label}
            </option>
          ))}
        </select>
      </div>

      <div className="ms-field">
        <label htmlFor="microphoneId" className="ms-field__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Mic size={15} /> Microphone
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <select
            id="microphoneId"
            className="ms-select"
            value={deviceSettings.microphoneId}
            onChange={(e) => onChange('microphoneId', e.target.value)}
          >
            {MOCK_DEVICES.microphones.map((mic) => (
              <option key={mic.id} value={mic.id}>
                {mic.label}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={handleTestMic}>
            {micTestActive ? 'Stop Test' : 'Test Mic'}
          </Button>
        </div>
        {micTestActive && (
          <div style={{ marginTop: 6 }}>
            <div
              style={{
                height: 8,
                borderRadius: 999,
                background: 'var(--bg-surface-muted)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: '68%',
                  height: '100%',
                  background: 'var(--color-secondary)',
                }}
              />
            </div>
            <span style={{ fontSize: 12, color: 'var(--color-secondary)' }}>
              Simulated microphone input level detected
            </span>
          </div>
        )}
      </div>

      <div className="ms-field">
        <label htmlFor="speakerId" className="ms-field__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Volume2 size={15} /> Speakers
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <select
            id="speakerId"
            className="ms-select"
            value={deviceSettings.speakerId}
            onChange={(e) => onChange('speakerId', e.target.value)}
          >
            {MOCK_DEVICES.speakers.map((spk) => (
              <option key={spk.id} value={spk.id}>
                {spk.label}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={handleTestSpeaker}>
            Test Sound
          </Button>
        </div>
      </div>

      {/* Video/Audio Toggles */}
      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
        <div className="ms-toggle-row">
          <div>
            <h4>Noise Cancellation</h4>
            <p>Filter keyboard typing and background room noise</p>
          </div>
          <input
            type="checkbox"
            checked={deviceSettings.noiseCancellation}
            onChange={(e) => onChange('noiseCancellation', e.target.checked)}
          />
        </div>

        <div className="ms-toggle-row">
          <div>
            <h4>High Definition (1080p) Video</h4>
            <p>Send higher-resolution video when bandwidth permits</p>
          </div>
          <input
            type="checkbox"
            checked={deviceSettings.hdVideo}
            onChange={(e) => onChange('hdVideo', e.target.checked)}
          />
        </div>

        <div className="ms-toggle-row">
          <div>
            <h4>Mirror My Video</h4>
            <p>Flip your self-view horizontally for natural preview</p>
          </div>
          <input
            type="checkbox"
            checked={deviceSettings.mirrorVideo}
            onChange={(e) => onChange('mirrorVideo', e.target.checked)}
          />
        </div>
      </div>

      <div className="ms-field">
        <label htmlFor="virtualBackground" className="ms-field__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={15} /> Background Effect (UI Preference)
        </label>
        <select
          id="virtualBackground"
          className="ms-select"
          value={deviceSettings.virtualBackground}
          onChange={(e) => onChange('virtualBackground', e.target.value)}
        >
          <option value="none">None (Original Background)</option>
          <option value="slight-blur">Slight Blur</option>
          <option value="strong-blur">Strong Blur</option>
          <option value="studio-office">Modern Studio Office</option>
        </select>
      </div>
    </div>
  );
}
