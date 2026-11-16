import { socketService } from './socketService';

function getIceServers() {
  const customStun = import.meta.env.VITE_STUN_SERVER_URL;
  const servers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  if (customStun && typeof customStun === 'string' && customStun.trim()) {
    servers.unshift({ urls: customStun.trim() });
  }
  return servers;
}

export class WebRTCService {
  constructor() {
    this.localStream = null;
    this.screenStream = null;
    this.isScreenSharingActive = false;
    this.onScreenShareEndedCallback = null;
    this.peerConnections = new Map(); // Map<userId, RTCPeerConnection>
    this.remoteStreams = new Map(); // Map<userId, MediaStream>
    this.iceQueues = new Map(); // Map<userId, RTCIceCandidateInit[]>
    this.connectionStates = new Map(); // Map<userId, string>
    this.callbacks = {
      onLocalStream: () => {},
      onRemoteStream: () => {},
      onRemoteStreamRemove: () => {},
      onConnectionStateChange: () => {},
      onDeviceError: () => {},
    };
  }

  setCallbacks(callbacks = {}) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  getLocalStream() {
    return this.localStream;
  }

  getScreenStream() {
    return this.screenStream;
  }

  isScreenSharing() {
    return Boolean(this.isScreenSharingActive && this.screenStream);
  }

  setOnScreenShareEnded(callback) {
    this.onScreenShareEndedCallback = callback;
  }

  getRemoteStream(userId) {
    return this.remoteStreams.get(String(userId)) || null;
  }

  getConnectionState(userId) {
    return this.connectionStates.get(String(userId)) || 'new';
  }

  async startLocalMedia({ audio = true, video = true } = {}) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = new Error(
        'Camera and microphone access is not supported or blocked in this browser context. HTTPS or localhost is required.'
      );
      this.callbacks.onDeviceError(err);
      throw err;
    }

    // If local stream already active, return it
    if (this.localStream && this.localStream.active) {
      this.setAudioEnabled(audio);
      this.setVideoEnabled(video);
      return this.localStream;
    }

    try {
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          facingMode: 'user',
        },
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (primaryErr) {
        // Fallback: try basic video + audio without advanced constraints
        console.warn(
          '[WebRTC] Primary getUserMedia failed, retrying with basic constraints:',
          primaryErr.message
        );
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
      }

      this.localStream = stream;

      // Apply initial audio / video enabled flags
      this.setAudioEnabled(audio);
      this.setVideoEnabled(video);

      this.callbacks.onLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('[WebRTC] getUserMedia failed:', err);
      let userFriendlyMessage = 'Failed to access camera and microphone.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        userFriendlyMessage =
          'Camera and microphone permission was denied. Please allow camera and microphone permissions in your browser address bar.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        userFriendlyMessage =
          'No camera or microphone was detected on this device.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        userFriendlyMessage =
          'Camera or microphone is already in use by another application.';
      }

      const formattedError = new Error(userFriendlyMessage);
      formattedError.original = err;
      this.callbacks.onDeviceError(formattedError);
      throw formattedError;
    }
  }

  setAudioEnabled(enabled) {
    if (!this.localStream) return;
    const audioTracks = this.localStream.getAudioTracks();
    for (const track of audioTracks) {
      track.enabled = Boolean(enabled);
    }
  }

  setVideoEnabled(enabled) {
    if (!this.localStream) return;
    const videoTracks = this.localStream.getVideoTracks();
    for (const track of videoTracks) {
      track.enabled = Boolean(enabled);
    }
  }

  async startScreenShare() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      const err = new Error(
        'Screen sharing is not supported by your browser or environment.'
      );
      this.callbacks.onDeviceError(err);
      throw err;
    }

    if (this.screenStream && this.screenStream.active) {
      return this.screenStream;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
        },
        audio: false,
      });

      this.screenStream = stream;
      this.isScreenSharingActive = true;
      const screenVideoTrack = stream.getVideoTracks()[0];

      if (!screenVideoTrack) {
        await this.stopScreenShare();
        throw new Error('No video track found in screen share stream.');
      }

      // Handle user clicking native browser "Stop sharing" control
      screenVideoTrack.onended = () => {
        console.log('[WebRTC] Screen sharing track ended via browser UI.');
        this.handleNativeScreenShareEnded();
      };

      // Replace video track on each connected peer's RTCRtpSender
      await this.replaceVideoTrackAcrossPeers(screenVideoTrack);

      return stream;
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        const userDeniedErr = new Error('Screen sharing permission was denied or cancelled.');
        userDeniedErr.original = err;
        throw userDeniedErr;
      }
      throw err;
    }
  }

  async stopScreenShare() {
    if (this.screenStream) {
      for (const track of this.screenStream.getTracks()) {
        track.onended = null;
        track.stop();
      }
      this.screenStream = null;
    }
    this.isScreenSharingActive = false;

    // Restore original camera video track to all connected peers
    const cameraVideoTrack = this.localStream ? this.localStream.getVideoTracks()[0] : null;
    if (cameraVideoTrack) {
      await this.replaceVideoTrackAcrossPeers(cameraVideoTrack);
    }
  }

  async handleNativeScreenShareEnded() {
    await this.stopScreenShare();
    if (typeof this.onScreenShareEndedCallback === 'function') {
      this.onScreenShareEndedCallback();
    }
  }

  async replaceVideoTrackAcrossPeers(newVideoTrack) {
    for (const [userId, pc] of this.peerConnections.entries()) {
      try {
        const senders = pc.getSenders();
        const videoSender = senders.find(
          (s) => (s.track && s.track.kind === 'video') || (!s.track && s.dtlsTransport)
        );

        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack);
        } else if (newVideoTrack) {
          pc.addTrack(newVideoTrack, this.localStream || new MediaStream());
        }
      } catch (err) {
        console.warn(`[WebRTC] Failed to replace video track for peer ${userId}:`, err);
      }
    }
  }

  createPeerConnection(remoteUserId, meetingId) {
    const uId = String(remoteUserId);
    // Close existing connection if any
    if (this.peerConnections.has(uId)) {
      this.closePeerConnection(uId);
    }

    const iceServers = getIceServers();
    const pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 2,
    });

    // Add local media tracks
    if (this.isScreenSharingActive && this.screenStream) {
      // Audio from microphone stream
      if (this.localStream) {
        for (const track of this.localStream.getAudioTracks()) {
          pc.addTrack(track, this.localStream);
        }
      }
      // Video from active screen share stream
      for (const track of this.screenStream.getVideoTracks()) {
        pc.addTrack(track, this.screenStream);
      }
    } else if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    // ICE candidate discovery
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketService.sendIceCandidate(meetingId, uId, event.candidate.toJSON ? event.candidate.toJSON() : event.candidate);
      }
    };

    // Remote track arrival
    pc.ontrack = (event) => {
      let remoteStream = this.remoteStreams.get(uId);
      if (!remoteStream) {
        remoteStream = new MediaStream();
        this.remoteStreams.set(uId, remoteStream);
      }

      if (event.streams && event.streams[0]) {
        for (const track of event.streams[0].getTracks()) {
          if (!remoteStream.getTracks().some((t) => t.id === track.id)) {
            remoteStream.addTrack(track);
          }
        }
      } else if (event.track) {
        if (!remoteStream.getTracks().some((t) => t.id === event.track.id)) {
          remoteStream.addTrack(event.track);
        }
      }

      this.callbacks.onRemoteStream(uId, remoteStream);
    };

    // Connection state changes
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      this.connectionStates.set(uId, state);
      this.callbacks.onConnectionStateChange(uId, state);

      if (state === 'failed') {
        console.warn(`[WebRTC] Peer connection with ${uId} failed, attempting ICE restart...`);
        try {
          if (typeof pc.restartIce === 'function') {
            pc.restartIce();
          }
        } catch (e) {
          console.warn('[WebRTC] restartIce failed:', e);
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        console.warn(`[WebRTC] ICE connection with ${uId} failed.`);
      }
    };

    this.peerConnections.set(uId, pc);
    this.iceQueues.set(uId, []);
    this.connectionStates.set(uId, pc.connectionState);

    return pc;
  }

  async initiateConnection(meetingId, remoteUserId) {
    const uId = String(remoteUserId);
    try {
      const pc = this.createPeerConnection(uId, meetingId);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);

      socketService.sendOffer(meetingId, uId, {
        type: offer.type,
        sdp: offer.sdp,
      });
    } catch (err) {
      console.error(`[WebRTC] Failed to initiate connection to ${uId}:`, err);
    }
  }

  async handleIncomingOffer(meetingId, senderId, offer) {
    const uId = String(senderId);
    try {
      const pc = this.createPeerConnection(uId, meetingId);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Process any queued ICE candidates for this sender
      await this.flushIceQueue(uId, pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketService.sendAnswer(meetingId, uId, {
        type: answer.type,
        sdp: answer.sdp,
      });
    } catch (err) {
      console.error(`[WebRTC] Failed to handle incoming offer from ${uId}:`, err);
    }
  }

  async handleIncomingAnswer(senderId, answer) {
    const uId = String(senderId);
    const pc = this.peerConnections.get(uId);
    if (!pc) {
      console.warn(`[WebRTC] Received answer from unknown peer ${uId}`);
      return;
    }

    try {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await this.flushIceQueue(uId, pc);
      }
    } catch (err) {
      console.error(`[WebRTC] Failed to set remote answer from ${uId}:`, err);
    }
  }

  async handleIncomingIceCandidate(senderId, candidate) {
    if (!candidate) return;
    const uId = String(senderId);
    const pc = this.peerConnections.get(uId);

    if (!pc || !pc.remoteDescription) {
      // Queue candidate until remote description is set
      let queue = this.iceQueues.get(uId);
      if (!queue) {
        queue = [];
        this.iceQueues.set(uId, queue);
      }
      queue.push(candidate);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn(`[WebRTC] Error adding ICE candidate from ${uId}:`, err);
    }
  }

  async flushIceQueue(userId, pc) {
    const queue = this.iceQueues.get(userId) || [];
    while (queue.length > 0) {
      const candidate = queue.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn(`[WebRTC] Error processing queued ICE candidate for ${userId}:`, err);
      }
    }
  }

  closePeerConnection(remoteUserId) {
    const uId = String(remoteUserId);
    const pc = this.peerConnections.get(uId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.close();
      this.peerConnections.delete(uId);
    }

    const stream = this.remoteStreams.get(uId);
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      this.remoteStreams.delete(uId);
    }

    this.iceQueues.delete(uId);
    this.connectionStates.delete(uId);
    this.callbacks.onRemoteStreamRemove(uId);
  }

  cleanup() {
    if (this.screenStream) {
      for (const track of this.screenStream.getTracks()) {
        track.onended = null;
        track.stop();
      }
      this.screenStream = null;
    }
    this.isScreenSharingActive = false;
    this.onScreenShareEndedCallback = null;

    for (const userId of Array.from(this.peerConnections.keys())) {
      this.closePeerConnection(userId);
    }

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }

    this.peerConnections.clear();
    this.remoteStreams.clear();
    this.iceQueues.clear();
    this.connectionStates.clear();
  }
}

export const webrtcService = new WebRTCService();
export default webrtcService;

