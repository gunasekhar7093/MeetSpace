import { useState } from 'react';
import { UserCog, Sliders, Save, ShieldCheck } from 'lucide-react';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { DeviceSettingsPanel } from '../components/settings/DeviceSettingsPanel';
import { useAuth, useToast } from '../hooks/useAppContext';
import './pages.css';

export function SettingsPage() {
  const { user, settings, updateSettings } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('account'); // 'account' | 'devices'
  const [accountDraft, setAccountDraft] = useState(settings.account);
  const [deviceDraft, setDeviceDraft] = useState(settings.devices);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (activeTab === 'account') {
        await updateSettings('account', accountDraft);
      } else {
        await updateSettings('devices', deviceDraft);
      }
      showToast('Settings saved.', 'success');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="ms-page-header">
        <div>
          <h1>Settings</h1>
          <p>Manage account preferences and audio/video device configurations.</p>
        </div>
        <Button variant="primary" onClick={handleSave} loading={saving}>
          <Save size={16} />
          <span>Save Settings</span>
        </Button>
      </div>

      <div className="ms-settings-grid">
        <Card style={{ padding: 12 }}>
          <nav className="ms-settings-nav" aria-label="Settings sections">
            <button
              type="button"
              className={`ms-settings-nav__item ${
                activeTab === 'account' ? 'ms-settings-nav__item--active' : ''
              }`}
              onClick={() => setActiveTab('account')}
            >
              <UserCog size={17} />
              <span>Account Settings</span>
            </button>
            <button
              type="button"
              className={`ms-settings-nav__item ${
                activeTab === 'devices' ? 'ms-settings-nav__item--active' : ''
              }`}
              onClick={() => setActiveTab('devices')}
            >
              <Sliders size={17} />
              <span>Audio &amp; Video Devices</span>
            </button>
          </nav>
        </Card>

        <Card>
          {activeTab === 'account' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <h2 style={{ fontSize: 19, marginBottom: 4 }}>Account &amp; Meeting Preferences</h2>
                <p style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>
                  Customize notifications, default join behavior, and security preferences.
                </p>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 14,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ShieldCheck size={18} color="var(--color-secondary)" />
                  <div>
                    <strong style={{ fontSize: 14, display: 'block' }}>
                      Two-Factor Authentication (Placeholder)
                    </strong>
                    <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                      Signed in as {user.email}
                    </span>
                  </div>
                </div>
                <Badge variant={accountDraft.twoFactorEnabled ? 'success' : 'neutral'}>
                  {accountDraft.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>

              <div>
                <div className="ms-toggle-row">
                  <div>
                    <h4>Email Notifications</h4>
                    <p>Receive invites, summaries, and schedule changes by email</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={accountDraft.emailNotifications}
                    onChange={(e) =>
                      setAccountDraft((prev) => ({
                        ...prev,
                        emailNotifications: e.target.checked,
                      }))
                    }
                  />
                </div>

                <div className="ms-toggle-row">
                  <div>
                    <h4>Meeting Reminders</h4>
                    <p>Show reminders 10 minutes before scheduled meetings</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={accountDraft.meetingReminders}
                    onChange={(e) =>
                      setAccountDraft((prev) => ({
                        ...prev,
                        meetingReminders: e.target.checked,
                      }))
                    }
                  />
                </div>

                <div className="ms-toggle-row">
                  <div>
                    <h4>Auto-mute Microphone on Join</h4>
                    <p>Join all calls muted by default</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={accountDraft.autoMuteOnJoin}
                    onChange={(e) =>
                      setAccountDraft((prev) => ({
                        ...prev,
                        autoMuteOnJoin: e.target.checked,
                      }))
                    }
                  />
                </div>

                <div className="ms-toggle-row">
                  <div>
                    <h4>Turn Off Camera on Join</h4>
                    <p>Keep camera off until you manually enable it in the room</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={accountDraft.autoTurnOffCamera}
                    onChange={(e) =>
                      setAccountDraft((prev) => ({
                        ...prev,
                        autoTurnOffCamera: e.target.checked,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="ms-field" style={{ maxWidth: 320 }}>
                <label htmlFor="language" className="ms-field__label">
                  Display Language
                </label>
                <select
                  id="language"
                  className="ms-select"
                  value={accountDraft.language}
                  onChange={(e) =>
                    setAccountDraft((prev) => ({ ...prev, language: e.target.value }))
                  }
                >
                  <option value="English (US)">English (US)</option>
                  <option value="English (UK)">English (UK)</option>
                  <option value="Spanish">Spanish</option>
                  <option value="French">French</option>
                  <option value="German">German</option>
                </select>
              </div>
            </div>
          ) : (
            <DeviceSettingsPanel
              deviceSettings={deviceDraft}
              user={user}
              onChange={(key, value) =>
                setDeviceDraft((prev) => ({ ...prev, [key]: value }))
              }
            />
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}

