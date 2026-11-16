import { useContext } from 'react';
import { AuthContext, MeetingContext, ToastContext } from '../context/contexts';

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function useMeetings() {
  const ctx = useContext(MeetingContext);
  if (!ctx) throw new Error('useMeetings must be used inside MeetingProvider');
  return ctx;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

