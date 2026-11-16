import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ShieldCheck, Calendar, Settings, RefreshCw, Info } from 'lucide-react';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { Card } from '../components/common/Card';
import { Avatar } from '../components/common/Avatar';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { useAuth, useToast } from '../hooks/useAppContext';
import { formatMeetingDate } from '../utils/formatters';
import './pages.css';

export function ProfilePage() {
  const { user, refreshProfile } = useAuth();
  const { showToast } = useToast();

  const [showEditPreview, setShowEditPreview] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [previewDraft, setPreviewDraft] = useState({
    name: user?.name || user?.fullName || '',
    email: user?.email || '',
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const updated = await refreshProfile();
      setPreviewDraft({
        name: updated?.name || '',
        email: updated?.email || '',
      });
      showToast('Profile synced from /api/auth/me.', 'success');
    } catch (err) {
      showToast(err.message || 'Unable to refresh profile.', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="ms-page-header">
        <div>
          <h1>User Profile</h1>
          <p>Authenticated account details fetched from the MeetSpace backend.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="outline" onClick={handleRefresh} loading={refreshing}>
            <RefreshCw size={15} />
            <span>Sync from Server</span>
          </Button>
          <Link to="/settings" style={{ textDecoration: 'none' }}>
            <Button variant="outline">
              <Settings size={16} />
              <span>Settings</span>
            </Button>
          </Link>
        </div>
      </div>

      <div className="ms-two-col">
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 22 }}>
            <Avatar
              name={user?.fullName || user?.name || 'User'}
              color={user?.avatarColor || '#1a73e8'}
              size="xl"
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 22 }}>{user?.name || user?.fullName}</h2>
                <Badge variant="success">Authenticated</Badge>
                <Badge variant="primary">{user?.role || 'user'}</Badge>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
                {user?.email}
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 14, fontSize: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)' }}>
              <Mail size={16} />
              <span>{user?.email}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)' }}>
              <ShieldCheck size={16} />
              <span>
                Email Verification:{' '}
                {user?.isEmailVerified ? 'Verified' : 'Pending verification'}
              </span>
            </div>
            {user?.createdAt && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)' }}>
                <Calendar size={16} />
                <span>Account created: {formatMeetingDate(user.createdAt)}</span>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 17 }}>Edit Profile</h3>
            <Badge variant="neutral">Frontend UI Preview</Badge>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Profile update endpoints are not implemented in the backend yet. You can preview the editing form below without altering persisted database records.
          </p>

          {showEditPreview ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Input
                label="Full Name"
                name="previewName"
                value={previewDraft.name}
                onChange={(e) =>
                  setPreviewDraft((prev) => ({ ...prev, name: e.target.value }))
                }
              />
              <Input
                label="Email Address"
                name="previewEmail"
                type="email"
                value={previewDraft.email}
                onChange={(e) =>
                  setPreviewDraft((prev) => ({ ...prev, email: e.target.value }))
                }
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 10,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-app)',
                  fontSize: 12.5,
                  color: 'var(--text-muted)',
                }}
              >
                <Info size={15} style={{ flexShrink: 0 }} />
                <span>Backend profile update API is pending a future phase.</span>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <Button variant="outline" onClick={() => setShowEditPreview(false)}>
                  Close Preview
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setShowEditPreview(true)}>
              Open Edit Form Preview
            </Button>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
