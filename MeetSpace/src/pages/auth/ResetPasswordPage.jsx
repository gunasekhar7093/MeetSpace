import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle2, KeyRound } from 'lucide-react';
import { AuthLayout } from '../../layouts/AuthLayout';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { validatePassword, validateRequired } from '../../utils/validators';
import { authService } from '../../services/authService';
import { useToast } from '../../hooks/useAppContext';
import './auth.css';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [form, setForm] = useState({
    resetCode: 'MS-RESET-2026',
    newPassword: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const validate = () => {
    const nextErrors = {
      resetCode: validateRequired(form.resetCode, 'Reset token'),
      newPassword: validatePassword(form.newPassword),
      confirmPassword:
        form.confirmPassword !== form.newPassword
          ? 'Passwords do not match.'
          : validateRequired(form.confirmPassword, 'Confirm password'),
    };
    setErrors(nextErrors);
    return !Object.values(nextErrors).some(Boolean);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await authService.resetPassword({
        token: form.resetCode,
        newPassword: form.newPassword,
      });
      setIsDone(true);
      showToast('Password reset successfully.', 'success');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Choose a strong password you haven’t used before."
    >
      {isDone ? (
        <div className="ms-auth-form">
          <div className="ms-auth-alert ms-auth-alert--success" role="status">
            <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Password updated</strong>
              <p style={{ marginTop: 4 }}>
                Your MeetSpace password has been reset. You can now sign in with your new password.
              </p>
            </div>
          </div>
          <Button fullWidth size="lg" onClick={() => navigate('/login')}>
            Continue to Sign In
          </Button>
        </div>
      ) : (
        <form className="ms-auth-form" onSubmit={handleSubmit} noValidate>
          <Input
            label="Reset Token / Verification Code"
            name="resetCode"
            type="text"
            value={form.resetCode}
            onChange={handleChange}
            error={errors.resetCode}
            leftIcon={<KeyRound size={16} />}
            helperText="Pre-filled mock token for frontend preview"
          />

          <Input
            label="New Password"
            name="newPassword"
            type={showPassword ? 'text' : 'password'}
            placeholder="Minimum 8 characters with letters & numbers"
            value={form.newPassword}
            onChange={handleChange}
            error={errors.newPassword}
            leftIcon={<Lock size={16} />}
            autoComplete="new-password"
            rightElement={
              <button
                type="button"
                className="ms-pwd-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />

          <Input
            label="Confirm New Password"
            name="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            placeholder="Re-enter your new password"
            value={form.confirmPassword}
            onChange={handleChange}
            error={errors.confirmPassword}
            leftIcon={<Lock size={16} />}
            autoComplete="new-password"
          />

          <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
            Update Password
          </Button>
        </form>
      )}

      <div className="ms-auth-footer">
        Remembered your password?{' '}
        <Link to="/login" style={{ fontWeight: 600 }}>
          Sign in
        </Link>
      </div>
    </AuthLayout>
  );
}

