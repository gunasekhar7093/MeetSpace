import crypto from 'node:crypto';

const MEETING_ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
export const MEETING_ID_REGEX = /^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/;

function randomSegment(length) {
  let segment = '';
  for (let i = 0; i < length; i += 1) {
    const idx = crypto.randomInt(0, MEETING_ID_ALPHABET.length);
    segment += MEETING_ID_ALPHABET[idx];
  }
  return segment;
}

/**
 * Generates a cryptographically random, human-readable Meeting ID (xxx-xxxx-xxx).
 */
export function generateMeetingId() {
  return `${randomSegment(3)}-${randomSegment(4)}-${randomSegment(3)}`;
}

/**
 * Builds the canonical frontend meeting link from FRONTEND_URL.
 */
export function buildMeetingLink(meetingId) {
  const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${baseUrl}/room/${meetingId}`;
}

