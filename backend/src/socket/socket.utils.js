import Meeting from '../models/Meeting.model.js';
import { ApiError } from '../utils/ApiError.js';
import { MEETING_ID_REGEX } from '../utils/meetingId.utils.js';

export function getMeetingRoomName(meetingId) {
  if (!meetingId) return '';
  return `meeting:${String(meetingId).trim().toLowerCase()}`;
}

export function isValidMeetingId(meetingId) {
  if (!meetingId || typeof meetingId !== 'string') return false;
  return MEETING_ID_REGEX.test(meetingId.trim().toLowerCase());
}

function getIdString(entity) {
  if (!entity) return '';
  return String(entity._id || entity);
}

/**
 * Validates that the meeting exists, is open, and that the authenticated user
 * is either the host or a recorded participant.
 */
export async function verifyMeetingAccess(meetingId, userId) {
  if (!isValidMeetingId(meetingId)) {
    throw new ApiError(400, 'Invalid Meeting ID format.');
  }

  const meeting = await Meeting.findOne({
    meetingId: meetingId.trim().toLowerCase(),
  });

  if (!meeting) {
    throw new ApiError(404, 'Meeting not found.');
  }

  if (meeting.status === 'cancelled') {
    throw new ApiError(400, 'This meeting has been cancelled.');
  }

  if (meeting.status === 'ended') {
    throw new ApiError(400, 'This meeting has already ended.');
  }

  const isHost = getIdString(meeting.host) === String(userId);
  const isParticipant = meeting.participants.some(
    (p) => getIdString(p.user) === String(userId)
  );

  if (!isHost && !isParticipant) {
    throw new ApiError(
      403,
      'You are not authorized to access this meeting room.'
    );
  }

  return { meeting, isHost };
}

/**
 * Manages real-time presence across socket connections.
 * Tracks presence by authenticated user ID (supporting multiple tabs/devices),
 * avoiding duplicate joins or prematurely dropping a user when one tab disconnects.
 */
export class PresenceManager {
  constructor() {
    // Map<meetingId, Map<userId, { id, name, email, avatar, role, isHost, socketIds: Set<string>, joinedAt }>>
    this.rooms = new Map();
    // Map<meetingId, string (userId)> - Tracks active screen sharer per meeting room
    this.screenSharers = new Map();
  }

  getScreenSharer(meetingId) {
    const mId = String(meetingId).trim().toLowerCase();
    return this.screenSharers.get(mId) || null;
  }

  setScreenSharer(meetingId, userId) {
    const mId = String(meetingId).trim().toLowerCase();
    const uId = String(userId);
    const current = this.screenSharers.get(mId);
    if (current && current !== uId) {
      return {
        success: false,
        error: 'Another participant is already sharing their screen.',
        currentSharerId: current,
      };
    }
    this.screenSharers.set(mId, uId);
    return { success: true, sharerId: uId };
  }

  clearScreenSharer(meetingId, userId = null) {
    const mId = String(meetingId).trim().toLowerCase();
    const current = this.screenSharers.get(mId);
    if (!current) return false;
    if (userId && current !== String(userId)) return false;
    this.screenSharers.delete(mId);
    return true;
  }

  addSocket(meetingId, user, isHost, socketId, initialMedia = {}) {
    const mId = String(meetingId).trim().toLowerCase();
    let room = this.rooms.get(mId);
    if (!room) {
      room = new Map();
      this.rooms.set(mId, room);
    }

    const userId = String(user.id || user._id);
    let userPresence = room.get(userId);
    let isNewUser = false;

    if (!userPresence) {
      isNewUser = true;
      userPresence = {
        id: userId,
        name: user.name || 'Participant',
        email: user.email || '',
        avatar: user.avatar || null,
        role: user.role || 'user',
        isHost: Boolean(isHost),
        isMuted: typeof initialMedia?.isMuted === 'boolean' ? initialMedia.isMuted : false,
        isCameraOn: typeof initialMedia?.isCameraOn === 'boolean' ? initialMedia.isCameraOn : true,
        socketIds: new Set([socketId]),
        joinedAt: new Date().toISOString(),
      };
      room.set(userId, userPresence);
    } else {
      userPresence.socketIds.add(socketId);
      if (isHost) {
        userPresence.isHost = true;
      }
      if (typeof initialMedia?.isMuted === 'boolean') {
        userPresence.isMuted = initialMedia.isMuted;
      }
      if (typeof initialMedia?.isCameraOn === 'boolean') {
        userPresence.isCameraOn = initialMedia.isCameraOn;
      }
    }

    const participants = this.getParticipants(mId);

    return {
      isNewUser,
      participant: {
        id: userPresence.id,
        name: userPresence.name,
        email: userPresence.email,
        avatar: userPresence.avatar,
        role: userPresence.role,
        isHost: userPresence.isHost,
        isMuted: userPresence.isMuted,
        isCameraOn: userPresence.isCameraOn,
        isScreenSharing: this.getScreenSharer(mId) === userPresence.id,
        joinedAt: userPresence.joinedAt,
      },
      participants,
    };
  }

  updateMediaState(meetingId, userId, mediaState = {}) {
    const mId = String(meetingId).trim().toLowerCase();
    const room = this.rooms.get(mId);
    if (!room) return null;
    const userPresence = room.get(String(userId));
    if (!userPresence) return null;
    if (typeof mediaState.isMuted === 'boolean') {
      userPresence.isMuted = mediaState.isMuted;
    }
    if (typeof mediaState.isCameraOn === 'boolean') {
      userPresence.isCameraOn = mediaState.isCameraOn;
    }
    return {
      id: userPresence.id,
      isMuted: userPresence.isMuted,
      isCameraOn: userPresence.isCameraOn,
    };
  }

  getUserSockets(meetingId, userId) {
    const mId = String(meetingId).trim().toLowerCase();
    const room = this.rooms.get(mId);
    if (!room) return [];
    const userPresence = room.get(String(userId));
    if (!userPresence) return [];
    return Array.from(userPresence.socketIds);
  }

  removeSocket(meetingId, userId, socketId) {
    const mId = String(meetingId).trim().toLowerCase();
    const room = this.rooms.get(mId);
    if (!room) {
      return { userLeft: false, remainingCount: 0, user: null };
    }

    const uId = String(userId);
    const userPresence = room.get(uId);
    if (!userPresence) {
      return { userLeft: false, remainingCount: room.size, user: null };
    }

    userPresence.socketIds.delete(socketId);

    let userLeft = false;
    let screenShareEnded = false;
    const userData = {
      id: userPresence.id,
      name: userPresence.name,
    };

    if (userPresence.socketIds.size === 0) {
      room.delete(uId);
      userLeft = true;
      if (this.getScreenSharer(mId) === uId) {
        this.clearScreenSharer(mId, uId);
        screenShareEnded = true;
      }
    }

    if (room.size === 0) {
      this.rooms.delete(mId);
      this.screenSharers.delete(mId);
    }

    return {
      userLeft,
      remainingCount: room ? room.size : 0,
      user: userData,
      screenShareEnded,
    };
  }

  getParticipants(meetingId) {
    const mId = String(meetingId).trim().toLowerCase();
    const room = this.rooms.get(mId);
    if (!room) return [];

    const activeSharer = this.getScreenSharer(mId);
    return Array.from(room.values()).map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      avatar: p.avatar,
      role: p.role,
      isHost: p.isHost,
      isMuted: p.isMuted ?? false,
      isCameraOn: p.isCameraOn ?? true,
      isScreenSharing: activeSharer === p.id,
      joinedAt: p.joinedAt,
    }));
  }

  removeRoom(meetingId) {
    const mId = String(meetingId).trim().toLowerCase();
    this.rooms.delete(mId);
    this.screenSharers.delete(mId);
  }
}

export const presenceManager = new PresenceManager();

