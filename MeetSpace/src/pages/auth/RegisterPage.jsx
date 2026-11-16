import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { AuthLayout } from '../../layouts/AuthLayout';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import {
  validateEmail,
  validatePassword,
  validateRequired,
} from '../../utils/validators';
import { useAuth, useToast } from '../../hooks/useAppContext';
import './auth.css';

export function RegisterPage() {
  const { register } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptTerms: true,
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
      fullName: validateRequired(form.fullName, 'Full name'),
      email: validateEmail(form.email),
      password: validatePassword(form.password),
      confirmPassword:
        form.confirmPassword !== form.password
          ? 'Passwords do not match.'
          : validateRequired(form.confirmPassword, 'Confirm password'),
      acceptTerms: !form.acceptTerms
        ? 'You must accept the terms to continue.'
        : '',
    };
    setErrors(nextErrors);
    return !Object.values(nextErrors).some(Boolean);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setFormError('');
    try {
      await register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      showToast('Account created! Welcome to MeetSpace.', 'success');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (Array.isArray(err.errors)) {
        const fieldErrors = {};
        for (const item of err.errors) {
          const targetField = item.field === 'name' ? 'fullName' : item.field;
          if (targetField) fieldErrors[targetField] = item.message;
        }
        setErrors((prev) => ({ ...prev, ...fieldErrors }));
      }
      setFormError(err.message || 'Registration failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start hosting and joining HD meetings in seconds."
    >
      <form className="ms-auth-form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <div className="ms-auth-alert ms-auth-alert--error" role="alert">
            <AlertCircle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{formError}</span>
          </div>
        )}

        <Input
          label="Full Name"
          name="fullName"
          type="text"
          placeholder="e.g., Alex Morgan"
          value={form.fullName}
          onChange={handleChange}
          error={errors.fullName}
          leftIcon={<User size={16} />}
          autoComplete="name"
        />

        <Input
          label="Work or Personal Email"
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
          placeholder="At least 8 characters with a number"
          value={form.password}
          onChange={handleChange}
          error={errors.password}
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
          label="Confirm Password"
          name="confirmPassword"
          type={showPassword ? 'text' : 'password'}
          placeholder="Re-enter your password"
          value={form.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
          leftIcon={<Lock size={16} />}
          autoComplete="new-password"
        />

        <div>
          <label className="ms-auth-checkbox" style={{ fontSize: 13 }}>
            <input
              type="checkbox"
              name="acceptTerms"
              checked={form.acceptTerms}
              onChange={handleChange}
            />
            <span>I agree to the MeetSpace Terms of Service &amp; Privacy Policy</span>
          </label>
          {errors.acceptTerms && (
            <p className="ms-field__error" style={{ marginTop: 4 }}>
              {errors.acceptTerms}
            </p>
          )}
        </div>

        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          Create Account
        </Button>
      </form>

      <div className="ms-auth-footer">
        Already have an account?{' '}
        <Link to="/login" style={{ fontWeight: 600 }}>
          Sign in
        </Link>
      </div>
    </AuthLayout>
  );
}
