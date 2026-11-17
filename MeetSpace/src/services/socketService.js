import { io } from 'socket.io-client';
import { API_BASE_URL, getAccessToken, refreshAccessToken } from './apiClient';

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  API_BASE_URL.replace(/\/api\/?$/, '') ||
  'http://localhost:5000';

class SocketService {
  constructor() {
    this.socket = null;
    this.currentMeetingId = null;
  }

  getSocket() {
    return this.socket;
  }

  isConnected() {
    return Boolean(this.socket?.connected);
  }

  connect(customToken) {
    const token = customToken || getAccessToken();

    if (this.socket) {
      if (token && this.socket.auth?.token !== token) {
        this.socket.auth = { token };
        if (this.socket.connected) {
          this.socket.disconnect();
          this.socket.connect();
        }
      }
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      auth: { token },
      withCredentials: true,
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 15000,
    });

    this.socket.on('connect_error', async (err) => {
      console.warn('[SocketService] Connection error:', err.message);
      // Re-authenticate if access token has expired
      if (
        err.message?.includes('expired') ||
        err.message?.includes('Authentication required') ||
        err.message?.includes('Invalid')
      ) {
        try {
          const refreshData = await refreshAccessToken();
          if (refreshData?.accessToken && this.socket) {
            this.socket.auth = { token: refreshData.accessToken };
            this.socket.connect();
          }
        } catch (refreshErr) {
          console.error(
            '[SocketService] Token refresh on connect error failed:',
            refreshErr.message
          );
        }
      }
    });

    this.socket.on('connect', () => {
      // Re-join meeting room automatically on reconnect
      if (this.currentMeetingId) {
        this.socket.emit('meeting:join', { meetingId: this.currentMeetingId });
      }
    });

    return this.socket;
  }

  joinMeeting(meetingId, mediaStateOrAck, onAck) {
    if (!meetingId) return;
    this.currentMeetingId = meetingId.trim().toLowerCase();

    let mediaState = {};
    let callback = onAck;
    if (typeof mediaStateOrAck === 'function') {
      callback = mediaStateOrAck;
    } else if (mediaStateOrAck && typeof mediaStateOrAck === 'object') {
      mediaState = mediaStateOrAck;
    }

    if (!this.socket) {
      this.connect();
    }

    const payload = { meetingId: this.currentMeetingId, mediaState };

    if (this.socket.connected) {
      this.socket.emit('meeting:join', payload, callback);
    } else {
      this.socket.once('connect', () => {
        this.socket.emit('meeting:join', payload, callback);
      });
    }
  }

  leaveMeeting(meetingId, onAck) {
    const targetId = (
      meetingId ||
      this.currentMeetingId ||
      ''
    )
      .trim()
      .toLowerCase();

    if (this.socket && this.socket.connected && targetId) {
      this.socket.emit('meeting:leave', { meetingId: targetId }, onAck);
    }
    this.currentMeetingId = null;
  }

  sendMessage(meetingId, text, onAck) {
    if (!this.socket || !this.socket.connected) {
      throw new Error('Real-time connection is not active.');
    }
    this.socket.emit(
      'chat:send',
      { meetingId: meetingId.trim().toLowerCase(), text: text.trim() },
      onAck
    );
  }

  sendOffer(meetingId, targetUserId, offer, onAck) {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit(
      'webrtc:offer',
      {
        meetingId: meetingId.trim().toLowerCase(),
        targetUserId,
        offer,
      },
      onAck
    );
  }

  sendAnswer(meetingId, targetUserId, answer, onAck) {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit(
      'webrtc:answer',
      {
        meetingId: meetingId.trim().toLowerCase(),
        targetUserId,
        answer,
      },
      onAck
    );
  }

  sendIceCandidate(meetingId, targetUserId, candidate, onAck) {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit(
      'webrtc:ice-candidate',
      {
        meetingId: meetingId.trim().toLowerCase(),
        targetUserId,
        candidate,
      },
      onAck
    );
  }

  sendMediaState(meetingId, { isMuted, isCameraOn }, onAck) {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit(
      'participant:media-state',
      {
        meetingId: meetingId.trim().toLowerCase(),
        isMuted,
        isCameraOn,
      },
      onAck
    );
  }

  sendHandState(meetingId, isHandRaised, onAck) {
    if (!this.socket || !this.socket.connected) {
      if (typeof onAck === 'function') {
        onAck({ success: false, message: 'Real-time connection is not active.' });
      }
      return;
    }
    this.socket.emit(
      'participant:hand-state',
      {
        meetingId: meetingId.trim().toLowerCase(),
        isHandRaised: Boolean(isHandRaised),
      },
      onAck
    );
  }

  startScreenShare(meetingId, onAck) {
    if (!this.socket || !this.socket.connected) {
      if (typeof onAck === 'function') {
        onAck({ success: false, message: 'Real-time connection is not active.' });
      }
      return;
    }
    this.socket.emit(
      'screenshare:start',
      { meetingId: meetingId.trim().toLowerCase() },
      onAck
    );
  }

  stopScreenShare(meetingId, onAck) {
    if (!this.socket || !this.socket.connected) {
      if (typeof onAck === 'function') {
        onAck({ success: false, message: 'Real-time connection is not active.' });
      }
      return;
    }
    this.socket.emit(
      'screenshare:stop',
      { meetingId: meetingId.trim().toLowerCase() },
      onAck
    );
  }

  on(event, handler) {
    if (!this.socket) {
      this.connect();
    }
    this.socket.on(event, handler);
    return () => {
      this.socket?.off(event, handler);
    };
  }

  off(event, handler) {
    this.socket?.off(event, handler);
  }

  disconnect() {
    if (this.socket) {
      if (this.currentMeetingId && this.socket.connected) {
        this.socket.emit('meeting:leave', {
          meetingId: this.currentMeetingId,
        });
      }
      this.currentMeetingId = null;
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();
export default socketService;

