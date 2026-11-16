import { Server } from 'socket.io';
import { socketAuthMiddleware } from './socket.middleware.js';
import { registerSocketHandlers } from './socket.handlers.js';
import { getMeetingRoomName, presenceManager } from './socket.utils.js';

let ioInstance = null;

export function initSocket(httpServer) {
  const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';

  ioInstance = new Server(httpServer, {
    cors: {
      origin: allowedOrigin,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  ioInstance.use(socketAuthMiddleware);

  ioInstance.on('connection', (socket) => {
    registerSocketHandlers(ioInstance, socket);
  });

  return ioInstance;
}

export function getIO() {
  return ioInstance;
}

export function closeSocket() {
  if (ioInstance) {
    ioInstance.close();
    ioInstance = null;
  }
}

/**
 * Broadcasts meeting ended notification to all connected participants in the meeting room
 * after the database status has been updated to 'ended'.
 */
export function notifyMeetingEnded(meetingId, summary = null) {
  if (!ioInstance || !meetingId) return;

  const mId = String(meetingId).trim().toLowerCase();
  const roomName = getMeetingRoomName(mId);

  ioInstance.to(roomName).emit('meeting:ended', {
    meetingId: mId,
    endedAt: summary?.endedAt || new Date().toISOString(),
    summary,
  });

  presenceManager.removeRoom(mId);
}

/**
 * Broadcasts meeting cancelled notification to all connected participants in the meeting room
 * after the database status has been updated to 'cancelled'.
 */
export function notifyMeetingCancelled(meetingId) {
  if (!ioInstance || !meetingId) return;

  const mId = String(meetingId).trim().toLowerCase();
  const roomName = getMeetingRoomName(mId);

  ioInstance.to(roomName).emit('meeting:cancelled', {
    meetingId: mId,
    cancelledAt: new Date().toISOString(),
  });

  presenceManager.removeRoom(mId);
}

/**
 * Broadcasts recording status updates to all participants in the meeting room
 */
export function notifyRecordingStarted(meetingId, recording) {
  if (!ioInstance || !meetingId || !recording) return;

  const mId = String(meetingId).trim().toLowerCase();
  const roomName = getMeetingRoomName(mId);

  ioInstance.to(roomName).emit('recording:started', {
    meetingId: mId,
    recordingId: recording.recordingId,
    status: recording.status,
    startedAt: recording.startedAt,
    initiatedBy: recording.initiatedBy,
  });
}

export function notifyRecordingStopping(meetingId, recording) {
  if (!ioInstance || !meetingId || !recording) return;

  const mId = String(meetingId).trim().toLowerCase();
  const roomName = getMeetingRoomName(mId);

  ioInstance.to(roomName).emit('recording:stopping', {
    meetingId: mId,
    recordingId: recording.recordingId,
    status: recording.status,
  });
}

export function notifyRecordingCompleted(meetingId, recording) {
  if (!ioInstance || !meetingId || !recording) return;

  const mId = String(meetingId).trim().toLowerCase();
  const roomName = getMeetingRoomName(mId);

  ioInstance.to(roomName).emit('recording:completed', {
    meetingId: mId,
    recordingId: recording.recordingId,
    status: recording.status,
    duration: recording.duration,
    fileSize: recording.fileSize,
    endedAt: recording.endedAt,
  });
}

export function notifyRecordingFailed(meetingId, recording) {
  if (!ioInstance || !meetingId || !recording) return;

  const mId = String(meetingId).trim().toLowerCase();
  const roomName = getMeetingRoomName(mId);

  ioInstance.to(roomName).emit('recording:failed', {
    meetingId: mId,
    recordingId: recording.recordingId,
    status: recording.status,
    error: recording.error || 'Recording failed.',
  });
}


