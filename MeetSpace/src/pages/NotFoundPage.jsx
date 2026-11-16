import { Link } from 'react-router-dom';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';

export function NotFoundPage() {
  return (
    <DashboardLayout>
      <Card style={{ textAlign: 'center', padding: '48px 24px', maxWidth: 520, margin: '40px auto' }}>
        <h1 style={{ fontSize: 36, marginBottom: 8 }}>404</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
          The MeetSpace page you requested could not be found.
        </p>
        <Link to="/dashboard" style={{ textDecoration: 'none' }}>
          <Button variant="primary">Back to Dashboard</Button>
        </Link>
      </Card>
    </DashboardLayout>
  );
}

