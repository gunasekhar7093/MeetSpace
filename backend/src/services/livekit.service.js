import { AccessToken } from 'livekit-server-sdk';
import Meeting from '../models/Meeting.model.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidMeetingId } from '../socket/socket.utils.js';

const SCHEDULED_JOIN_WINDOW_MS = 15 * 60 * 1000;

function getIdString(entity) {
  if (!entity) return '';
  return String(entity._id || entity);
}

export async function generateLiveKitToken({ meetingId, user }) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL || 'ws://127.0.0.1:7880';

  if (!apiKey || !apiSecret) {
    throw new ApiError(500, 'LiveKit SFU credentials are not configured on the server.');
  }

  if (!isValidMeetingId(meetingId)) {
    throw new ApiError(400, 'Invalid Meeting ID format.');
  }

  const normalizedMeetingId = String(meetingId).trim().toLowerCase();
  const meeting = await Meeting.findOne({ meetingId: normalizedMeetingId });

  if (!meeting) {
    throw new ApiError(404, 'Meeting not found.');
  }

  if (meeting.status === 'cancelled') {
    throw new ApiError(400, 'This meeting has been cancelled.');
  }

  if (meeting.status === 'ended') {
    throw new ApiError(400, 'This meeting has already ended.');
  }

  const now = new Date();
  if (meeting.status === 'scheduled') {
    const scheduledMs = meeting.scheduledAt ? meeting.scheduledAt.getTime() : 0;
    if (scheduledMs - now.getTime() > SCHEDULED_JOIN_WINDOW_MS) {
      throw new ApiError(
        400,
        'This scheduled meeting is not yet open for joining. Joining opens 15 minutes before the scheduled start time.'
      );
    }
  }

  const userId = getIdString(user.id || user._id);
  const isHost = getIdString(meeting.host) === userId;
  const participantEntry = meeting.participants.find(
    (p) => getIdString(p.user) === userId
  );

  if (!isHost && !participantEntry) {
    throw new ApiError(
      403,
      'You are not an authorized participant in this meeting. Please join the meeting first.'
    );
  }

  const activeCount = meeting.participants.filter((p) => p.status === 'joined').length;
  const limit = meeting.settings?.participantLimit ?? 50;

  if (!isHost && activeCount > limit) {
    throw new ApiError(403, 'Meeting has reached its maximum participant limit.');
  }

  const canPublish = isHost || meeting.settings?.allowParticipantScreenShare !== false;
  const canPublishData = meeting.settings?.chatEnabled !== false;

  const at = new AccessToken(apiKey, apiSecret, {
    identity: userId,
    name: user.name || 'Participant',
    metadata: JSON.stringify({
      userId,
      role: user.role || 'user',
      isHost,
      avatar: user.avatar || null,
    }),
    ttl: '6h',
  });

  at.addGrant({
    roomJoin: true,
    room: meeting.meetingId,
    canPublish: true,
    canSubscribe: true,
    canPublishData,
  });

  const token = await at.toJwt();

  return {
    token,
    url: livekitUrl,
    meetingId: meeting.meetingId,
    isHost,
  };
}

