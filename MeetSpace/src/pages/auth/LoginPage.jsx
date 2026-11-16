import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { AuthLayout } from '../../layouts/AuthLayout';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { validateEmail, validateRequired } from '../../utils/validators';
import { useAuth, useToast } from '../../hooks/useAppContext';
import './auth.css';

export function LoginPage() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({
    email: '',
    password: '',
    rememberMe: true,
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setErrors((prev) => ({ ...prev, [name]: '' }));
    setFormError('');
  };

  const validate = () => {
    const nextErrors = {
      email: validateEmail(form.email),
      password: validateRequired(form.password, 'Password'),
    };
    setErrors(nextErrors);
    return !nextErrors.email && !nextErrors.password;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setFormError('');
    try {
      await login({ email: form.email.trim(), password: form.password });
      showToast('Welcome back to MeetSpace!', 'success');
      const destination = location.state?.from?.pathname || '/dashboard';
      navigate(destination, { replace: true });
    } catch (err) {
      if (Array.isArray(err.errors)) {
        const fieldErrors = {};
        for (const item of err.errors) {
          if (item.field) fieldErrors[item.field] = item.message;
        }
        setErrors((prev) => ({ ...prev, ...fieldErrors }));
      }
      setFormError(err.message || 'Unable to sign in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in to MeetSpace"
      subtitle="Enter your credentials to access your meetings and workspace."
    >
      <form className="ms-auth-form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <div className="ms-auth-alert ms-auth-alert--error" role="alert">
            <AlertCircle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{formError}</span>
          </div>
        )}

        <Input
          label="Email Address"
          name="email"
          type="email"
          placeholder="you@company.com"
          value={form.email}
          onChange={handleChange}
          error={errors.email}
          leftIcon={<Mail size={16} />}
          autoComplete="email"
        />

        <Input
          label="Password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Enter your password"
          value={form.password}
          onChange={handleChange}
          error={errors.password}
          leftIcon={<Lock size={16} />}
          autoComplete="current-password"
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

        <div className="ms-auth-row">
          <label className="ms-auth-checkbox">
            <input
              type="checkbox"
              name="rememberMe"
              checked={form.rememberMe}
              onChange={handleChange}
            />
            <span>Remember me</span>
          </label>
          <Link to="/forgot-password">Forgot password?</Link>
        </div>

        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          Sign In
        </Button>
      </form>

      <div className="ms-auth-footer">
        Don&apos;t have a MeetSpace account?{' '}
        <Link to="/register" style={{ fontWeight: 600 }}>
          Create account
        </Link>
      </div>
    </AuthLayout>
  );
}
