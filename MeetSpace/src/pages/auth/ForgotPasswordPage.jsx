import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, CheckCircle2, ArrowLeft } from 'lucide-react';
import { AuthLayout } from '../../layouts/AuthLayout';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { validateEmail } from '../../utils/validators';
import { authService } from '../../services/authService';
import './auth.css';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submittedMessage, setSubmittedMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const res = await authService.requestPasswordReset({ email });
      setSubmittedMessage(res.message);
    } catch (err) {
      setError(err.message || 'Could not process request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email associated with your account and we’ll send a reset link."
    >
      {submittedMessage ? (
        <div className="ms-auth-form">
          <div className="ms-auth-alert ms-auth-alert--success" role="status">
            <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Check your inbox</strong>
              <p style={{ marginTop: 4 }}>{submittedMessage}</p>
            </div>
          </div>

          <Link to="/reset-password" style={{ textDecoration: 'none' }}>
            <Button fullWidth variant="secondary">
              Proceed to Reset Password Preview
            </Button>
          </Link>
        </div>
      ) : (
        <form className="ms-auth-form" onSubmit={handleSubmit} noValidate>
          <Input
            label="Email Address"
            name="email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            error={error}
            leftIcon={<Mail size={16} />}
            autoComplete="email"
          />

          <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
            Send Reset Link
          </Button>
        </form>
      )}

      <div className="ms-auth-footer">
        <Link
          to="/login"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={15} />
          Back to Sign In
        </Link>
      </div>
    </AuthLayout>
  );
}

