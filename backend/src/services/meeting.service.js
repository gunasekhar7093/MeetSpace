import Meeting from '../models/Meeting.model.js';
import { ApiError } from '../utils/ApiError.js';
import { generateMeetingId } from '../utils/meetingId.utils.js';
import { finalizeActiveRecordingsOnMeetingEnd } from './egress.service.js';

const SAFE_USER_FIELDS = 'name email avatar role';
const SCHEDULED_JOIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_MEETING_ID_ATTEMPTS = 5;

const PERMITTED_SETTINGS_KEYS = [
  'waitingRoomEnabled',
  'chatEnabled',
  'screenShareEnabled',
  'participantLimit',
  'allowParticipantScreenShare',
];

function getIdString(entity) {
  if (!entity) return '';
  return String(entity._id || entity);
}

function isUserHost(meeting, userId) {
  return getIdString(meeting.host) === String(userId);
}

function findParticipantEntry(meeting, userId) {
  return meeting.participants.find((p) => getIdString(p.user) === String(userId));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pickPermittedSettings(rawSettings = {}) {
  const sanitized = {};
  for (const key of PERMITTED_SETTINGS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(rawSettings, key)) {
      sanitized[key] = rawSettings[key];
    }
  }
  return sanitized;
}

function calculateDuration(startedAt, endedAt) {
  if (!startedAt || !endedAt) {
    return { durationSeconds: 0, durationMinutes: 0 };
  }
  const diffMs = Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime());
  const durationSeconds = Math.round(diffMs / 1000);
  const durationMinutes = Math.round(durationSeconds / 60);
  return { durationSeconds, durationMinutes };
}

async function generateUniqueMeetingId() {
  for (let i = 0; i < MAX_MEETING_ID_ATTEMPTS; i += 1) {
    const candidate = generateMeetingId();
    const exists = await Meeting.exists({ meetingId: candidate });
    if (!exists) {
      return candidate;
    }
  }
  throw new ApiError(500, 'Unable to generate a unique Meeting ID. Please try again.');
}

async function populateMeetingDoc(meetingDoc) {
  await meetingDoc.populate([
    { path: 'host', select: SAFE_USER_FIELDS },
    { path: 'participants.user', select: SAFE_USER_FIELDS },
  ]);
  return meetingDoc.toJSON();
}

function buildUserScopeFilter(userId) {
  return {
    $or: [{ host: userId }, { 'participants.user': userId }],
  };
}

/**
 * Creates an instant or scheduled meeting hosted by the authenticated user.
 */
export async function createMeeting(hostId, payload) {
  const isInstant = Boolean(payload.isInstant);
  const now = new Date();
  const settings = pickPermittedSettings(payload.settings);

  const baseData = {
    title: payload.title.trim(),
    description: payload.description ? payload.description.trim() : '',
    host: hostId,
    isInstant,
    status: isInstant ? 'active' : 'scheduled',
    scheduledAt: isInstant ? null : new Date(payload.scheduledAt),
    startedAt: isInstant ? now : null,
    endedAt: null,
    participants: isInstant
      ? [{ user: hostId, status: 'joined', joinedAt: now, leftAt: null }]
      : [],
    settings,
  };

  for (let attempt = 0; attempt < MAX_MEETING_ID_ATTEMPTS; attempt += 1) {
    const meetingId = await generateUniqueMeetingId();
    try {
      const created = await Meeting.create({
        ...baseData,
        meetingId,
      });
      return {
        meeting: await populateMeetingDoc(created),
      };
    } catch (err) {
      const isMeetingIdDuplicate =
        err.code === 11000 && Object.prototype.hasOwnProperty.call(err.keyValue || {}, 'meetingId');
      if (!isMeetingIdDuplicate || attempt === MAX_MEETING_ID_ATTEMPTS - 1) {
        throw err;
      }
    }
  }

  throw new ApiError(500, 'Failed to create meeting.');
}

/**
 * Lists meetings relevant to the authenticated user with filtering, sorting, and pagination.
 */
export async function listMeetings(userId, queryParams = {}) {
  const page = Math.max(1, Number(queryParams.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(queryParams.limit) || 10));
  const filter = queryParams.filter || 'all';
  const status = queryParams.status || null;
  const sortBy = queryParams.sortBy || 'createdAt';
  const sortOrder = queryParams.sortOrder === 'asc' ? 1 : -1;

  const conditions = [];

  if (filter === 'hosted') {
    conditions.push({ host: userId });
  } else if (filter === 'joined') {
    conditions.push({ 'participants.user': userId, host: { $ne: userId } });
  } else if (filter === 'upcoming') {
    conditions.push(buildUserScopeFilter(userId));
    conditions.push({ status: { $in: ['scheduled', 'active'] } });
  } else {
    conditions.push(buildUserScopeFilter(userId));
  }

  if (status) {
    conditions.push({ status });
  }

  const mongoFilter = conditions.length === 1 ? conditions[0] : { $and: conditions };
  const skip = (page - 1) * limit;

  const [docs, total] = await Promise.all([
    Meeting.find(mongoFilter)
      .sort({ [sortBy]: sortOrder, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate('host', SAFE_USER_FIELDS)
      .populate('participants.user', SAFE_USER_FIELDS),
    Meeting.countDocuments(mongoFilter),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    meetings: docs.map((doc) => doc.toJSON()),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

/**
 * Retrieves details for a specific meeting if the authenticated user is authorized.
 */
export async function getMeetingDetails(meetingId, userId) {
  const meeting = await Meeting.findOne({ meetingId: meetingId.toLowerCase() })
    .populate('host', SAFE_USER_FIELDS)
    .populate('participants.user', SAFE_USER_FIELDS);

  if (!meeting) {
    throw new ApiError(404, 'Meeting not found.');
  }

  const authorized = isUserHost(meeting, userId) || Boolean(findParticipantEntry(meeting, userId));
  if (!authorized) {
    throw new ApiError(403, 'You are not authorized to access details for this meeting.');
  }

  return {
    meeting: meeting.toJSON(),
  };
}

/**
 * Joins the authenticated user to an eligible meeting.
 */
export async function joinMeeting(meetingId, userId) {
  const meeting = await Meeting.findOne({ meetingId: meetingId.toLowerCase() });

  if (!meeting) {
    throw new ApiError(404, 'Meeting not found.');
  }

  if (meeting.status === 'cancelled') {
    throw new ApiError(400, 'This meeting has been cancelled and cannot be joined.');
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
    meeting.status = 'active';
    meeting.startedAt = meeting.startedAt || now;
  }

  const userIsHost = isUserHost(meeting, userId);
  const existingEntry = findParticipantEntry(meeting, userId);

  if (existingEntry && existingEntry.status === 'joined') {
    return {
      meeting: await populateMeetingDoc(meeting),
      participant: {
        userId: String(userId),
        isHost: userIsHost,
        status: existingEntry.status,
        joinedAt: existingEntry.joinedAt,
        alreadyJoined: true,
      },
    };
  }

  const activeCount = meeting.participants.filter((p) => p.status === 'joined').length;
  const limit = meeting.settings?.participantLimit ?? 50;

  if (!userIsHost && activeCount >= limit) {
    throw new ApiError(403, 'Meeting has reached its maximum participant limit.');
  }

  const nextStatus =
    !userIsHost && meeting.settings?.waitingRoomEnabled ? 'waiting' : 'joined';

  if (existingEntry) {
    existingEntry.status = nextStatus;
    existingEntry.joinedAt = now;
    existingEntry.leftAt = null;
  } else {
    meeting.participants.push({
      user: userId,
      status: nextStatus,
      joinedAt: now,
      leftAt: null,
    });
  }

  await meeting.save();

  return {
    meeting: await populateMeetingDoc(meeting),
    participant: {
      userId: String(userId),
      isHost: userIsHost,
      status: nextStatus,
      joinedAt: now,
      alreadyJoined: false,
    },
  };
}

/**
 * Marks the authenticated participant as having left the meeting without ending the meeting.
 */
export async function leaveMeeting(meetingId, userId) {
  const meeting = await Meeting.findOne({ meetingId: meetingId.toLowerCase() });

  if (!meeting) {
    throw new ApiError(404, 'Meeting not found.');
  }

  const participant = findParticipantEntry(meeting, userId);
  if (!participant) {
    throw new ApiError(400, 'You are not a participant in this meeting.');
  }

  if (participant.status === 'left') {
    return {
      meetingId: meeting.meetingId,
      status: meeting.status,
      participant: {
        userId: String(userId),
        status: participant.status,
        leftAt: participant.leftAt,
        alreadyLeft: true,
      },
    };
  }

  const now = new Date();
  participant.status = 'left';
  participant.leftAt = now;

  await meeting.save();

  return {
    meetingId: meeting.meetingId,
    status: meeting.status,
    participant: {
      userId: String(userId),
      status: participant.status,
      leftAt: now,
      alreadyLeft: false,
    },
  };
}

/**
 * Ends an active or scheduled meeting (host-only) and marks active participants as left.
 */
export async function endMeeting(meetingId, userId) {
  const meeting = await Meeting.findOne({ meetingId: meetingId.toLowerCase() });

  if (!meeting) {
    throw new ApiError(404, 'Meeting not found.');
  }

  if (!isUserHost(meeting, userId)) {
    throw new ApiError(403, 'Only the meeting host can end this meeting.');
  }

  if (meeting.status === 'ended') {
    throw new ApiError(400, 'Meeting has already ended.');
  }

  if (meeting.status === 'cancelled') {
    throw new ApiError(400, 'Cancelled meetings cannot be ended.');
  }

  const now = new Date();
  meeting.status = 'ended';
  meeting.startedAt = meeting.startedAt || now;
  meeting.endedAt = now;

  for (const participant of meeting.participants) {
    if (participant.status === 'joined' || participant.status === 'waiting') {
      participant.status = 'left';
      participant.leftAt = now;
    }
  }

  await meeting.save();

  // Finalize any active LiveKit recordings when meeting is ended
  await finalizeActiveRecordingsOnMeetingEnd(meeting.meetingId);

  const duration = calculateDuration(meeting.startedAt, meeting.endedAt);

  return {
    meeting: await populateMeetingDoc(meeting),
    summary: {
      meetingId: meeting.meetingId,
      title: meeting.title,
      startedAt: meeting.startedAt,
      endedAt: meeting.endedAt,
      totalParticipants: meeting.participants.length,
      ...duration,
    },
  };
}

/**
 * Updates permitted meeting details and settings (host-only).
 */
export async function updateMeeting(meetingId, userId, updates) {
  const meeting = await Meeting.findOne({ meetingId: meetingId.toLowerCase() });

  if (!meeting) {
    throw new ApiError(404, 'Meeting not found.');
  }

  if (!isUserHost(meeting, userId)) {
    throw new ApiError(403, 'Only the meeting host can update this meeting.');
  }

  if (meeting.status === 'ended' || meeting.status === 'cancelled') {
    throw new ApiError(400, `Cannot update a meeting that is already ${meeting.status}.`);
  }

  if (updates.title !== undefined) {
    meeting.title = updates.title.trim();
  }

  if (updates.description !== undefined) {
    meeting.description = updates.description.trim();
  }

  if (updates.scheduledAt !== undefined) {
    if (meeting.status !== 'scheduled') {
      throw new ApiError(400, 'Cannot change scheduledAt once a meeting is active.');
    }
    meeting.scheduledAt = new Date(updates.scheduledAt);
  }

  if (updates.settings) {
    const safeSettings = pickPermittedSettings(updates.settings);
    meeting.settings = {
      ...meeting.settings.toObject(),
      ...safeSettings,
    };
  }

  await meeting.save();

  return {
    meeting: await populateMeetingDoc(meeting),
  };
}

/**
 * Cancels a scheduled or active meeting (soft cancellation to preserve history).
 * Prevents deletion of already-ended meeting history.
 */
export async function cancelMeeting(meetingId, userId) {
  const meeting = await Meeting.findOne({ meetingId: meetingId.toLowerCase() });

  if (!meeting) {
    throw new ApiError(404, 'Meeting not found.');
  }

  if (!isUserHost(meeting, userId)) {
    throw new ApiError(403, 'Only the meeting host can cancel this meeting.');
  }

  if (meeting.status === 'ended') {
    throw new ApiError(
      400,
      'Ended meetings are preserved in meeting history and cannot be deleted.'
    );
  }

  if (meeting.status === 'cancelled') {
    throw new ApiError(400, 'Meeting is already cancelled.');
  }

  const now = new Date();
  meeting.status = 'cancelled';
  meeting.endedAt = now;

  for (const participant of meeting.participants) {
    if (participant.status === 'joined' || participant.status === 'waiting') {
      participant.status = 'left';
      participant.leftAt = now;
    }
  }

  await meeting.save();

  return {
    meeting: await populateMeetingDoc(meeting),
  };
}

/**
 * Returns the authenticated user's meeting history (ended and cancelled meetings).
 */
export async function getMeetingHistory(userId, queryParams = {}) {
  const page = Math.max(1, Number(queryParams.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(queryParams.limit) || 10));
  const role = queryParams.role || 'all';
  const status = queryParams.status || null;
  const search = queryParams.search ? queryParams.search.trim() : '';
  const sortBy = queryParams.sortBy || 'endedAt';
  const sortOrder = queryParams.sortOrder === 'asc' ? 1 : -1;

  const conditions = [];

  if (role === 'hosted') {
    conditions.push({ host: userId });
  } else if (role === 'attended') {
    conditions.push({ 'participants.user': userId, host: { $ne: userId } });
  } else {
    conditions.push(buildUserScopeFilter(userId));
  }

  if (status) {
    conditions.push({ status });
  } else {
    conditions.push({ status: { $in: ['ended', 'cancelled'] } });
  }

  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    conditions.push({
      $or: [{ title: regex }, { meetingId: regex }],
    });
  }

  const mongoFilter = conditions.length === 1 ? conditions[0] : { $and: conditions };
  const skip = (page - 1) * limit;

  const [docs, total] = await Promise.all([
    Meeting.find(mongoFilter)
      .sort({ [sortBy]: sortOrder, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate('host', SAFE_USER_FIELDS)
      .populate('participants.user', SAFE_USER_FIELDS),
    Meeting.countDocuments(mongoFilter),
  ]);

  const history = docs.map((doc) => {
    const json = doc.toJSON();
    const entry = findParticipantEntry(doc, userId);
    const { durationMinutes, durationSeconds } = calculateDuration(
      doc.startedAt,
      doc.endedAt
    );

    return {
      _id: json._id,
      title: json.title,
      description: json.description,
      meetingId: json.meetingId,
      meetingLink: json.meetingLink,
      status: json.status,
      isInstant: json.isInstant,
      host: json.host,
      scheduledAt: json.scheduledAt,
      startedAt: json.startedAt,
      endedAt: json.endedAt,
      durationMinutes,
      durationSeconds,
      participantsCount: json.participants.length,
      userParticipation: {
        isHost: isUserHost(doc, userId),
        status: entry ? entry.status : null,
        joinedAt: entry ? entry.joinedAt : null,
        leftAt: entry ? entry.leftAt : null,
      },
    };
  });

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    history,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

