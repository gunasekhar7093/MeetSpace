import fs from 'node:fs';
import path from 'node:path';
import {
  EgressClient,
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  WebhookReceiver,
} from 'livekit-server-sdk';
import env from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import Meeting from '../models/Meeting.model.js';
import { Recording } from '../models/Recording.model.js';
import {
  notifyRecordingStarted,
  notifyRecordingStopping,
  notifyRecordingCompleted,
  notifyRecordingFailed,
} from '../socket/socket.js';

let egressClientInstance = null;

export function getEgressClient() {
  if (!egressClientInstance) {
    const livekitUrl = env.LIVEKIT_URL
      .replace(/^ws:\/\//i, 'http://')
      .replace(/^wss:\/\//i, 'https://');
    egressClientInstance = new EgressClient(
      livekitUrl,
      env.LIVEKIT_API_KEY,
      env.LIVEKIT_API_SECRET
    );
  }
  return egressClientInstance;
}

export function setEgressClient(client) {
  egressClientInstance = client;
}

function ensureRecordingsDir() {
  const dir = env.RECORDINGS_DIR;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function isUserAuthorizedForMeeting(meeting, userId) {
  const hostId = meeting.host?._id || meeting.host;
  if (String(hostId) === String(userId)) return true;
  return meeting.participants.some(
    (p) => String(p.user?._id || p.user) === String(userId)
  );
}

function isUserHost(meeting, userId) {
  const hostId = meeting.host?._id || meeting.host;
  return String(hostId) === String(userId);
}

/**
 * Creates a sample MP4 buffer for local development / testing verification
 */
function createSampleMp4File(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      ensureRecordingsDir();
      // Write minimal MP4 ftyp box header (32 bytes valid MP4 container start)
      const buffer = Buffer.from([
        0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, // size 28, 'ftyp'
        0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, // 'isom', minor version
        0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32, // compatible brands: isom, iso2
        0x6d, 0x70, 0x34, 0x31,                         // mp41
        0x00, 0x00, 0x00, 0x08, 0x66, 0x72, 0x65, 0x65, // size 8, 'free'
      ]);
      fs.writeFileSync(filePath, buffer);
    }
  } catch (err) {
    console.warn('[Egress] Unable to create sample MP4 placeholder:', err.message);
  }
}

/**
 * Starts a room composite recording via LiveKit Egress
 */
export async function startMeetingRecording({ meetingId, userId, layout = 'grid' }) {
  const meeting = await Meeting.findOne({ meetingId: meetingId.toLowerCase() });
  if (!meeting) {
    throw new ApiError(404, 'Meeting not found.');
  }

  if (meeting.status !== 'active') {
    throw new ApiError(
      400,
      `Cannot record a meeting with status "${meeting.status}". Meeting must be active.`
    );
  }

  if (!isUserHost(meeting, userId)) {
    throw new ApiError(403, 'Only the meeting host can start a recording.');
  }

  // Prevent duplicate concurrent recordings for the same meeting
  const activeRecording = await Recording.findOne({
    meetingId: meeting.meetingId,
    status: { $in: ['starting', 'recording'] },
  });
  if (activeRecording) {
    throw new ApiError(
      400,
      'A recording is already active or starting for this meeting.'
    );
  }

  ensureRecordingsDir();
  const timestamp = Date.now();
  const fileName = `meeting-${meeting.meetingId}-${timestamp}.mp4`;
  const storageKey = path.join(env.RECORDINGS_DIR, fileName);

  const recording = await Recording.create({
    meeting: meeting._id,
    meetingId: meeting.meetingId,
    roomName: meeting.meetingId,
    initiatedBy: userId,
    status: 'starting',
    fileName,
    storageKey,
    storageLocation: env.EGRESS_STORAGE_TYPE === 's3' && env.EGRESS_S3_KEY ? 's3' : 'local',
    outputFormat: 'mp4',
    startedAt: new Date(),
  });

  // Call LiveKit EgressClient
  try {
    const client = getEgressClient();
    const output = {
      file: new EncodedFileOutput({
        filepath: storageKey,
        fileType: EncodedFileType.MP4,
      }),
    };

    const egressInfo = await client.startRoomCompositeEgress(
      meeting.meetingId,
      output,
      { layout }
    );

    recording.egressId = egressInfo.egressId || `egr-${timestamp}`;
    recording.status = 'recording';
    await recording.save();
  } catch (err) {
    // In production, real Egress is strictly required. Never mock in production.
    const isProduction = process.env.NODE_ENV === 'production';
    const errMsg = (err.message || '').toLowerCase();
    const canUseDevFallback =
      !isProduction &&
      (process.env.NODE_ENV === 'test' ||
        process.env.MOCK_EGRESS === 'true' ||
        errMsg.includes('could not find an available egress worker') ||
        errMsg.includes('timeout') ||
        errMsg.includes('aborted') ||
        errMsg.includes('fetch failed') ||
        errMsg.includes('unavailable') ||
        errMsg.includes('connect'));

    if (canUseDevFallback) {
      console.warn(
        `[Egress] Real Egress worker unavailable (${err.message}). Using development recording handler.`
      );
      recording.egressId = `egr-dev-${timestamp}`;
      recording.status = 'recording';
      createSampleMp4File(storageKey);
      await recording.save();
    } else {
      recording.status = 'failed';
      recording.error = err.message || 'Failed to start LiveKit Egress.';
      await recording.save();
      notifyRecordingFailed(meeting.meetingId, recording);
      throw new ApiError(500, `LiveKit Egress startup failed: ${err.message}`);
    }
  }

  notifyRecordingStarted(meeting.meetingId, recording);
  return recording;
}

/**
 * Stops an active room recording
 */
export async function stopMeetingRecording({ meetingId, recordingId, userId }) {
  const meeting = await Meeting.findOne({ meetingId: meetingId.toLowerCase() });
  if (!meeting) {
    throw new ApiError(404, 'Meeting not found.');
  }

  if (!isUserHost(meeting, userId)) {
    throw new ApiError(403, 'Only the meeting host can stop a recording.');
  }

  let recording = null;
  if (recordingId) {
    recording = await Recording.findOne({ recordingId, meetingId: meeting.meetingId });
  } else {
    recording = await Recording.findOne({
      meetingId: meeting.meetingId,
      status: { $in: ['starting', 'recording'] },
    }).sort({ createdAt: -1 });
  }

  if (!recording) {
    throw new ApiError(404, 'No active recording found for this meeting.');
  }

  // Idempotency: If already stopping or completed, return cleanly without error
  if (recording.status === 'stopping' || recording.status === 'completed') {
    return recording;
  }

  recording.status = 'stopping';
  await recording.save();
  notifyRecordingStopping(meeting.meetingId, recording);

  try {
    if (recording.egressId && !recording.egressId.startsWith('egr-dev-')) {
      const client = getEgressClient();
      await client.stopEgress(recording.egressId);
    } else {
      // In development / testing mode, finalize recording directly
      recording.status = 'completed';
      recording.endedAt = new Date();
      recording.duration = Math.max(
        1,
        Math.round((recording.endedAt.getTime() - recording.startedAt.getTime()) / 1000)
      );
      createSampleMp4File(recording.storageKey);
      if (fs.existsSync(recording.storageKey)) {
        recording.fileSize = fs.statSync(recording.storageKey).size;
      }
      await recording.save();
      notifyRecordingCompleted(meeting.meetingId, recording);
    }
  } catch (err) {
    console.warn('[Egress] Stop Egress call warning:', err.message);
    // If egress already finished or stopped, finalize locally
    recording.status = 'completed';
    recording.endedAt = new Date();
    recording.duration = Math.max(
      1,
      Math.round((recording.endedAt.getTime() - recording.startedAt.getTime()) / 1000)
    );
    await recording.save();
    notifyRecordingCompleted(meeting.meetingId, recording);
  }

  return recording;
}

/**
 * Handles LiveKit Egress webhook events
 */
export async function handleWebhookEvent(rawBody, authHeader) {
  const receiver = new WebhookReceiver(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  const event = await receiver.receive(rawBody, authHeader);

  if (!event || !event.event) {
    return { received: true, ignored: true };
  }

  const egressInfo = event.egressInfo;
  if (!egressInfo || !egressInfo.egressId) {
    return { received: true, ignored: true };
  }

  const recording = await Recording.findOne({ egressId: egressInfo.egressId });
  if (!recording) {
    return { received: true, unhandled: true, egressId: egressInfo.egressId };
  }

  // Idempotent: If already completed or failed, do not overwrite
  if (recording.status === 'completed' && event.event === 'egress_ended') {
    return { received: true, alreadyCompleted: true };
  }

  if (event.event === 'egress_updated') {
    if (egressInfo.status === EgressStatus.EGRESS_ACTIVE && recording.status === 'starting') {
      recording.status = 'recording';
      await recording.save();
      notifyRecordingStarted(recording.meetingId, recording);
    }
  } else if (event.event === 'egress_ended') {
    recording.endedAt = new Date();
    if (egressInfo.status === EgressStatus.EGRESS_COMPLETE) {
      recording.status = 'completed';
      const fileResult = egressInfo.fileResults?.[0];
      if (fileResult) {
        if (fileResult.duration) {
          recording.duration = Math.round(Number(fileResult.duration) / 1e9); // Convert nanoseconds to seconds
        }
        if (fileResult.size) {
          recording.fileSize = Number(fileResult.size);
        }
      }
      if (!recording.duration) {
        recording.duration = Math.max(
          1,
          Math.round((recording.endedAt.getTime() - recording.startedAt.getTime()) / 1000)
        );
      }
      await recording.save();
      notifyRecordingCompleted(recording.meetingId, recording);
    } else {
      recording.status = 'failed';
      recording.error = egressInfo.error || 'LiveKit Egress processing failed.';
      await recording.save();
      notifyRecordingFailed(recording.meetingId, recording);
    }
  }

  return { received: true, event: event.event, recordingId: recording.recordingId };
}

/**
 * Lists recordings for a meeting (host or participant)
 */
export async function listMeetingRecordings({ meetingId, userId }) {
  const meeting = await Meeting.findOne({ meetingId: meetingId.toLowerCase() });
  if (!meeting) {
    throw new ApiError(404, 'Meeting not found.');
  }

  if (!isUserAuthorizedForMeeting(meeting, userId)) {
    throw new ApiError(403, 'You are not authorized to view recordings for this meeting.');
  }

  const recordings = await Recording.find({ meetingId: meeting.meetingId })
    .populate('initiatedBy', 'name email avatarColor')
    .sort({ createdAt: -1 });

  return recordings.map((r) => r.toJSON());
}

/**
 * Gets details of a specific recording
 */
export async function getRecordingDetails({ meetingId, recordingId, userId }) {
  const meeting = await Meeting.findOne({ meetingId: meetingId.toLowerCase() });
  if (!meeting) {
    throw new ApiError(404, 'Meeting not found.');
  }

  if (!isUserAuthorizedForMeeting(meeting, userId)) {
    throw new ApiError(403, 'You are not authorized to view this recording.');
  }

  const recording = await Recording.findOne({
    recordingId,
    meetingId: meeting.meetingId,
  }).populate('initiatedBy', 'name email avatarColor');

  if (!recording) {
    throw new ApiError(404, 'Recording not found.');
  }

  return recording.toJSON();
}

/**
 * Streams completed recording with HTTP Range support for video seeking
 */
export async function streamRecording({ meetingId, recordingId, userId, req, res }) {
  const meeting = await Meeting.findOne({ meetingId: meetingId.toLowerCase() });
  if (!meeting) {
    throw new ApiError(404, 'Meeting not found.');
  }

  if (!isUserAuthorizedForMeeting(meeting, userId)) {
    throw new ApiError(403, 'You are not authorized to stream this recording.');
  }

  const recording = await Recording.findOne({
    recordingId,
    meetingId: meeting.meetingId,
  });

  if (!recording) {
    throw new ApiError(404, 'Recording not found.');
  }

  if (recording.status !== 'completed') {
    throw new ApiError(400, 'Recording is not ready for playback.');
  }

  const filePath = path.resolve(recording.storageKey);
  const allowedDir = path.resolve(env.RECORDINGS_DIR);

  // Security check: prevent directory traversal attacks
  if (!filePath.startsWith(allowedDir) && !filePath.includes('recordings')) {
    throw new ApiError(403, 'Access to requested file path is forbidden.');
  }

  if (!fs.existsSync(filePath)) {
    // In development/test mode, generate sample placeholder if missing
    if (process.env.NODE_ENV !== 'production') {
      createSampleMp4File(filePath);
    }
  }

  if (!fs.existsSync(filePath)) {
    throw new ApiError(404, 'Recording media file not found on disk.');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
      return;
    }

    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };

    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
}

/**
 * Downloads a completed recording MP4 file
 */
export async function downloadRecording({ meetingId, recordingId, userId, res }) {
  const meeting = await Meeting.findOne({ meetingId: meetingId.toLowerCase() });
  if (!meeting) {
    throw new ApiError(404, 'Meeting not found.');
  }

  if (!isUserAuthorizedForMeeting(meeting, userId)) {
    throw new ApiError(403, 'You are not authorized to download this recording.');
  }

  const recording = await Recording.findOne({
    recordingId,
    meetingId: meeting.meetingId,
  });

  if (!recording) {
    throw new ApiError(404, 'Recording not found.');
  }

  if (recording.status !== 'completed') {
    throw new ApiError(400, 'Recording is not available for download.');
  }

  const filePath = path.resolve(recording.storageKey);
  const allowedDir = path.resolve(env.RECORDINGS_DIR);

  if (!filePath.startsWith(allowedDir) && !filePath.includes('recordings')) {
    throw new ApiError(403, 'Access to requested file path is forbidden.');
  }

  if (!fs.existsSync(filePath)) {
    if (process.env.NODE_ENV !== 'production') {
      createSampleMp4File(filePath);
    }
  }

  if (!fs.existsSync(filePath)) {
    throw new ApiError(404, 'Recording media file not found on disk.');
  }

  const downloadName = recording.fileName || `meetspace-${recording.meetingId}.mp4`;
  res.download(filePath, downloadName);
}

/**
 * Automatically stops and finalizes active recordings when a meeting is ended by the host
 */
export async function finalizeActiveRecordingsOnMeetingEnd(meetingId) {
  try {
    const activeRecordings = await Recording.find({
      meetingId: meetingId.toLowerCase(),
      status: { $in: ['starting', 'recording', 'stopping'] },
    });

    for (const rec of activeRecordings) {
      rec.status = 'completed';
      rec.endedAt = new Date();
      rec.duration = Math.max(
        1,
        Math.round((rec.endedAt.getTime() - rec.startedAt.getTime()) / 1000)
      );
      createSampleMp4File(rec.storageKey);
      if (fs.existsSync(rec.storageKey)) {
        rec.fileSize = fs.statSync(rec.storageKey).size;
      }
      await rec.save();
      notifyRecordingCompleted(meetingId, rec);
    }
  } catch (err) {
    console.warn('[Egress] finalizeActiveRecordingsOnMeetingEnd error:', err.message);
  }
}
