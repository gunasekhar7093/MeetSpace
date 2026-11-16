const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MEETING_CODE_REGEX = /^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/i;
const SIMPLE_MEETING_ID_REGEX = /^[a-z0-9_-]{5,32}$/i;

export function validateEmail(email) {
  if (!email || !email.trim()) {
    return 'Email address is required.';
  }
  if (!EMAIL_REGEX.test(email.trim())) {
    return 'Please enter a valid email address.';
  }
  return '';
}

export function validatePassword(password) {
  if (!password) {
    return 'Password is required.';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include at least one letter and one number.';
  }
  return '';
}

export function validateRequired(value, fieldLabel = 'This field') {
  if (!value || !String(value).trim()) {
    return `${fieldLabel} is required.`;
  }
  return '';
}

/**
 * Extracts a clean Meeting ID from either a raw Meeting ID (e.g., "abc-defg-hij")
 * or a MeetSpace link (e.g., "https://meetspace.app/room/abc-defg-hij" or "http://localhost:5173/room/abc-defg-hij").
 * Returns null if the input cannot be parsed as a valid meeting identifier.
 */
export function parseMeetingInput(rawInput) {
  if (!rawInput || !rawInput.trim()) {
    return null;
  }

  const trimmed = rawInput.trim();

  // Check if input looks like a URL or path containing /room/<id>
  const roomPathMatch = trimmed.match(/\/room\/([a-z0-9_-]+)/i);
  if (roomPathMatch && roomPathMatch[1]) {
    const extracted = roomPathMatch[1].toLowerCase();
    if (MEETING_CODE_REGEX.test(extracted) || SIMPLE_MEETING_ID_REGEX.test(extracted)) {
      return extracted;
    }
    return null;
  }

  // If it's a URL without /room/ path, treat as invalid MeetSpace link
  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('/')) {
    return null;
  }

  const normalized = trimmed.toLowerCase();
  if (MEETING_CODE_REGEX.test(normalized) || SIMPLE_MEETING_ID_REGEX.test(normalized)) {
    return normalized;
  }

  return null;
}

export function validateMeetingInput(rawInput) {
  if (!rawInput || !rawInput.trim()) {
    return 'Please enter a Meeting ID or meeting link.';
  }
  const parsed = parseMeetingInput(rawInput);
  if (!parsed) {
    return 'Invalid format. Enter a Meeting ID (e.g., abc-defg-hij) or a valid MeetSpace room link.';
  }
  return '';
}

