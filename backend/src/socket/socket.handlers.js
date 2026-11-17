import crypto from 'node:crypto';
import Meeting from '../models/Meeting.model.js';
import {
  getMeetingRoomName,
  presenceManager,
  verifyMeetingAccess,
} from './socket.utils.js';

export function registerSocketHandlers(io, socket) {
  async function leaveCurrentMeeting() {
    const meetingId = socket.currentMeetingId;
    if (!meetingId) return;

    const roomName = getMeetingRoomName(meetingId);
    socket.leave(roomName);
    socket.currentMeetingId = null;

    const { userLeft, user, screenShareEnded } = presenceManager.removeSocket(
      meetingId,
      socket.userId,
      socket.id
    );

    if (screenShareEnded) {
      io.to(roomName).emit('participant:screenshare-state', {
        meetingId,
        userId: socket.userId,
        userName: socket.user?.name || user?.name || 'Participant',
        isSharing: false,
      });
    }

    if (userLeft && user) {
      io.to(roomName).emit('participant:left', {
        meetingId,
        userId: user.id,
        user: {
          id: user.id,
          name: user.name,
        },
      });
    }
  }

  // 1. Join Meeting Room
  socket.on('meeting:join', async (payload = {}, callback) => {
    try {
      const meetingId = String(payload.meetingId || '').trim().toLowerCase();
      if (!meetingId) {
        const errorMsg = 'Meeting ID is required.';
        socket.emit('meeting:error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') {
          callback({ success: false, message: errorMsg });
        }
        return;
      }

      // If socket was already in another room, leave it first
      if (socket.currentMeetingId && socket.currentMeetingId !== meetingId) {
        await leaveCurrentMeeting();
      }

      // Verify authorization and meeting state
      const { meeting, isHost } = await verifyMeetingAccess(
        meetingId,
        socket.userId
      );

      const roomName = getMeetingRoomName(meetingId);
      socket.join(roomName);
      socket.currentMeetingId = meetingId;

      const { isNewUser, participant, participants } =
        presenceManager.addSocket(
          meetingId,
          socket.user,
          isHost,
          socket.id,
          payload.mediaState
        );

      // Send current participants list to the joining socket
      socket.emit('meeting:participants', {
        meetingId,
        participants,
      });

      // Broadcast new participant to other sockets in the room
      if (isNewUser) {
        socket.to(roomName).emit('participant:joined', {
          meetingId,
          participant,
        });
      }

      if (typeof callback === 'function') {
        callback({
          success: true,
          meetingId,
          isHost,
          participants,
        });
      }
    } catch (error) {
      const message = error.message || 'Unable to join meeting room.';
      socket.emit('meeting:error', {
        meetingId: payload.meetingId,
        message,
      });
      if (typeof callback === 'function') {
        callback({ success: false, message });
      }
    }
  });

  // 2. Leave Meeting Room
  socket.on('meeting:leave', async (payload = {}, callback) => {
    try {
      const meetingId = String(payload.meetingId || socket.currentMeetingId || '')
        .trim()
        .toLowerCase();

      if (meetingId && socket.currentMeetingId === meetingId) {
        await leaveCurrentMeeting();
      }

      if (typeof callback === 'function') {
        callback({ success: true, meetingId });
      }
    } catch (error) {
      if (typeof callback === 'function') {
        callback({ success: false, message: error.message });
      }
    }
  });

  // 3. Real-Time Chat Message
  socket.on('chat:send', async (payload = {}, callback) => {
    try {
      const meetingId = String(payload.meetingId || '').trim().toLowerCase();
      const rawText = payload.text;

      if (!meetingId || socket.currentMeetingId !== meetingId) {
        const errorMsg = 'You are not in this meeting room.';
        socket.emit('chat:error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') {
          callback({ success: false, message: errorMsg });
        }
        return;
      }

      if (typeof rawText !== 'string' || !rawText.trim()) {
        const errorMsg = 'Message text cannot be empty.';
        socket.emit('chat:error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') {
          callback({ success: false, message: errorMsg });
        }
        return;
      }

      const text = rawText.trim();
      if (text.length > 2000) {
        const errorMsg = 'Message exceeds maximum length of 2000 characters.';
        socket.emit('chat:error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') {
          callback({ success: false, message: errorMsg });
        }
        return;
      }

      // Verify meeting still exists and chat is enabled
      const meeting = await Meeting.findOne({ meetingId }).select(
        'status settings'
      );
      if (!meeting || meeting.status === 'ended' || meeting.status === 'cancelled') {
        const errorMsg = 'Meeting is no longer active.';
        socket.emit('chat:error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') {
          callback({ success: false, message: errorMsg });
        }
        return;
      }

      if (meeting.settings?.chatEnabled === false) {
        const errorMsg = 'Chat is disabled for this meeting.';
        socket.emit('chat:error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') {
          callback({ success: false, message: errorMsg });
        }
        return;
      }

      const messageData = {
        id: crypto.randomUUID(),
        meetingId,
        senderId: socket.userId,
        senderName: socket.user.name,
        senderAvatar: socket.user.avatar || null,
        text,
        timestamp: new Date().toISOString(),
      };

      const roomName = getMeetingRoomName(meetingId);
      io.to(roomName).emit('chat:message', messageData);

      if (typeof callback === 'function') {
        callback({ success: true, message: messageData });
      }
    } catch (error) {
      const message = error.message || 'Failed to send chat message.';
      socket.emit('chat:error', {
        meetingId: payload.meetingId,
        message,
      });
      if (typeof callback === 'function') {
        callback({ success: false, message });
      }
    }
  });

  // 4. WebRTC Offer Signaling
  socket.on('webrtc:offer', async (payload = {}, callback) => {
    try {
      const meetingId = String(payload.meetingId || '').trim().toLowerCase();
      const targetUserId = String(payload.targetUserId || '').trim();
      const offer = payload.offer;

      if (!meetingId || socket.currentMeetingId !== meetingId) {
        const errorMsg = 'You are not in this meeting room.';
        socket.emit('webrtc:signal-error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      if (!targetUserId) {
        const errorMsg = 'Target user ID is required.';
        socket.emit('webrtc:signal-error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      if (targetUserId === String(socket.userId)) {
        const errorMsg = 'Cannot send WebRTC offer to yourself.';
        socket.emit('webrtc:signal-error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      if (!offer || typeof offer !== 'object' || offer.type !== 'offer' || typeof offer.sdp !== 'string') {
        const errorMsg = 'Invalid SDP offer payload.';
        socket.emit('webrtc:signal-error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      if (offer.sdp.length > 200000) {
        const errorMsg = 'SDP offer exceeds maximum permitted size.';
        socket.emit('webrtc:signal-error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      const targetSockets = presenceManager.getUserSockets(meetingId, targetUserId);
      if (!targetSockets || targetSockets.length === 0) {
        const errorMsg = 'Recipient is not connected to this meeting room.';
        socket.emit('webrtc:signal-error', { meetingId, targetUserId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      for (const targetSocketId of targetSockets) {
        io.to(targetSocketId).emit('webrtc:offer', {
          meetingId,
          senderId: socket.userId,
          senderName: socket.user.name,
          offer: {
            type: offer.type,
            sdp: offer.sdp,
          },
        });
      }

      if (typeof callback === 'function') {
        callback({ success: true });
      }
    } catch (err) {
      const message = err.message || 'Failed to send WebRTC offer.';
      socket.emit('webrtc:signal-error', { meetingId: payload?.meetingId, message });
      if (typeof callback === 'function') callback({ success: false, message });
    }
  });

  // 5. WebRTC Answer Signaling
  socket.on('webrtc:answer', async (payload = {}, callback) => {
    try {
      const meetingId = String(payload.meetingId || '').trim().toLowerCase();
      const targetUserId = String(payload.targetUserId || '').trim();
      const answer = payload.answer;

      if (!meetingId || socket.currentMeetingId !== meetingId) {
        const errorMsg = 'You are not in this meeting room.';
        socket.emit('webrtc:signal-error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      if (!targetUserId) {
        const errorMsg = 'Target user ID is required.';
        socket.emit('webrtc:signal-error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      if (targetUserId === String(socket.userId)) {
        const errorMsg = 'Cannot send WebRTC answer to yourself.';
        socket.emit('webrtc:signal-error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      if (!answer || typeof answer !== 'object' || answer.type !== 'answer' || typeof answer.sdp !== 'string') {
        const errorMsg = 'Invalid SDP answer payload.';
        socket.emit('webrtc:signal-error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      if (answer.sdp.length > 200000) {
        const errorMsg = 'SDP answer exceeds maximum permitted size.';
        socket.emit('webrtc:signal-error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      const targetSockets = presenceManager.getUserSockets(meetingId, targetUserId);
      if (!targetSockets || targetSockets.length === 0) {
        const errorMsg = 'Recipient is not connected to this meeting room.';
        socket.emit('webrtc:signal-error', { meetingId, targetUserId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      for (const targetSocketId of targetSockets) {
        io.to(targetSocketId).emit('webrtc:answer', {
          meetingId,
          senderId: socket.userId,
          answer: {
            type: answer.type,
            sdp: answer.sdp,
          },
        });
      }

      if (typeof callback === 'function') {
        callback({ success: true });
      }
    } catch (err) {
      const message = err.message || 'Failed to send WebRTC answer.';
      socket.emit('webrtc:signal-error', { meetingId: payload?.meetingId, message });
      if (typeof callback === 'function') callback({ success: false, message });
    }
  });

  // 6. WebRTC ICE Candidate Signaling
  socket.on('webrtc:ice-candidate', async (payload = {}, callback) => {
    try {
      const meetingId = String(payload.meetingId || '').trim().toLowerCase();
      const targetUserId = String(payload.targetUserId || '').trim();
      const candidate = payload.candidate;

      if (!meetingId || socket.currentMeetingId !== meetingId) {
        const errorMsg = 'You are not in this meeting room.';
        socket.emit('webrtc:signal-error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      if (!targetUserId) {
        const errorMsg = 'Target user ID is required.';
        socket.emit('webrtc:signal-error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      if (targetUserId === String(socket.userId)) {
        const errorMsg = 'Cannot send ICE candidate to yourself.';
        socket.emit('webrtc:signal-error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      if (
        candidate &&
        typeof candidate === 'object' &&
        typeof candidate.candidate === 'string' &&
        candidate.candidate.length > 5000
      ) {
        const errorMsg = 'ICE candidate exceeds maximum permitted size.';
        socket.emit('webrtc:signal-error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      const targetSockets = presenceManager.getUserSockets(meetingId, targetUserId);
      if (!targetSockets || targetSockets.length === 0) {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Recipient is not connected.' });
        }
        return;
      }

      for (const targetSocketId of targetSockets) {
        io.to(targetSocketId).emit('webrtc:ice-candidate', {
          meetingId,
          senderId: socket.userId,
          candidate,
        });
      }

      if (typeof callback === 'function') {
        callback({ success: true });
      }
    } catch (err) {
      const message = err.message || 'Failed to send ICE candidate.';
      socket.emit('webrtc:signal-error', { meetingId: payload?.meetingId, message });
      if (typeof callback === 'function') callback({ success: false, message });
    }
  });

  // 7. Participant Media State (Mute / Camera Toggle)
  socket.on('participant:media-state', async (payload = {}, callback) => {
    try {
      const meetingId = String(payload.meetingId || '').trim().toLowerCase();
      if (!meetingId || socket.currentMeetingId !== meetingId) {
        const errorMsg = 'You are not in this meeting room.';
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      const isMuted = typeof payload.isMuted === 'boolean' ? payload.isMuted : false;
      const isCameraOn = typeof payload.isCameraOn === 'boolean' ? payload.isCameraOn : true;

      presenceManager.updateMediaState(meetingId, socket.userId, { isMuted, isCameraOn });

      const roomName = getMeetingRoomName(meetingId);
      io.to(roomName).emit('participant:media-state', {
        meetingId,
        userId: socket.userId,
        isMuted,
        isCameraOn,
      });

      if (typeof callback === 'function') {
        callback({ success: true, isMuted, isCameraOn });
      }
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, message: err.message });
    }
  });

  // 8. Screen Sharing Start
  socket.on('screenshare:start', async (payload = {}, callback) => {
    try {
      const meetingId = String(payload.meetingId || '').trim().toLowerCase();
      if (!meetingId || socket.currentMeetingId !== meetingId) {
        const errorMsg = 'You are not in this meeting room.';
        socket.emit('screenshare:error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      const meeting = await Meeting.findOne({ meetingId }).select('status settings host');
      if (!meeting || meeting.status === 'ended' || meeting.status === 'cancelled') {
        const errorMsg = 'Meeting is no longer active.';
        socket.emit('screenshare:error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      const isHost = String(meeting.host) === String(socket.userId);
      if (meeting.settings?.allowParticipantScreenShare === false && !isHost) {
        const errorMsg = 'Screen sharing is disabled by the host.';
        socket.emit('screenshare:error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      const result = presenceManager.setScreenSharer(meetingId, socket.userId);
      if (!result.success) {
        socket.emit('screenshare:error', { meetingId, message: result.error });
        if (typeof callback === 'function') callback({ success: false, message: result.error });
        return;
      }

      const roomName = getMeetingRoomName(meetingId);
      io.to(roomName).emit('participant:screenshare-state', {
        meetingId,
        userId: socket.userId,
        userName: socket.user?.name || 'Participant',
        isSharing: true,
      });

      if (typeof callback === 'function') {
        callback({ success: true, userId: socket.userId });
      }
    } catch (err) {
      const message = err.message || 'Failed to start screen share.';
      socket.emit('screenshare:error', { meetingId: payload?.meetingId, message });
      if (typeof callback === 'function') callback({ success: false, message });
    }
  });

  // 9. Screen Sharing Stop
  socket.on('screenshare:stop', async (payload = {}, callback) => {
    try {
      const meetingId = String(payload.meetingId || '').trim().toLowerCase();
      if (!meetingId || socket.currentMeetingId !== meetingId) {
        const errorMsg = 'You are not in this meeting room.';
        socket.emit('screenshare:error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      const currentSharer = presenceManager.getScreenSharer(meetingId);
      if (currentSharer !== String(socket.userId)) {
        const errorMsg = 'You are not currently sharing your screen.';
        socket.emit('screenshare:error', { meetingId, message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      presenceManager.clearScreenSharer(meetingId, socket.userId);

      const roomName = getMeetingRoomName(meetingId);
      io.to(roomName).emit('participant:screenshare-state', {
        meetingId,
        userId: socket.userId,
        userName: socket.user?.name || 'Participant',
        isSharing: false,
      });

      if (typeof callback === 'function') {
        callback({ success: true, userId: socket.userId });
      }
    } catch (err) {
      const message = err.message || 'Failed to stop screen share.';
      socket.emit('screenshare:error', { meetingId: payload?.meetingId, message });
      if (typeof callback === 'function') callback({ success: false, message });
    }
  });

  // 10. Participant Hand Raise State (Raise / Lower Hand)
  const handleHandState = async (payload = {}, callback) => {
    try {
      const meetingId = String(payload.meetingId || '').trim().toLowerCase();
      if (!meetingId || socket.currentMeetingId !== meetingId) {
        const errorMsg = 'You are not in this meeting room.';
        if (typeof callback === 'function') callback({ success: false, message: errorMsg });
        return;
      }

      const isHandRaised = typeof payload.isHandRaised === 'boolean'
        ? payload.isHandRaised
        : Boolean(payload.raised);

      presenceManager.updateHandRaiseState(meetingId, socket.userId, isHandRaised);

      const roomName = getMeetingRoomName(meetingId);
      io.to(roomName).emit('participant:hand-state', {
        meetingId,
        userId: socket.userId,
        userName: socket.user?.name || 'Participant',
        isHandRaised,
      });

      if (typeof callback === 'function') {
        callback({ success: true, isHandRaised });
      }
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, message: err.message });
    }
  };

  socket.on('participant:hand-state', handleHandState);
  socket.on('participant:hand-raise', handleHandState);

  // 11. Socket Disconnection Handling
  socket.on('disconnecting', async () => {
    await leaveCurrentMeeting();
  });
}

