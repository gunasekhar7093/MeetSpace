import { Room, RoomEvent, Track, VideoPresets } from 'livekit-client';

export class LiveKitService {
  constructor() {
    this.room = null;
    this.localStream = null;
    this.screenStream = null;
    this.remoteStreams = new Map(); // Map<userId, MediaStream>
    this.audioElements = new Map(); // Map<trackSid, HTMLAudioElement>
    this.connectionStates = new Map(); // Map<userId, string>
    this.callbacks = {
      onLocalStream: () => {},
      onLocalScreenStream: () => {},
      onRemoteStream: () => {},
      onRemoteStreamRemove: () => {},
      onConnectionStateChange: () => {},
      onRoomConnectionStateChange: () => {},
      onScreenShareEnded: () => {},
      onParticipantConnected: () => {},
      onParticipantDisconnected: () => {},
      onError: () => {},
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

  getRemoteStream(userId) {
    return this.remoteStreams.get(String(userId)) || null;
  }

  getConnectionState(userId) {
    return this.connectionStates.get(String(userId)) || 'connected';
  }

  isScreenSharing() {
    return Boolean(this.screenStream && this.screenStream.active);
  }

  getOrCreateRemoteStream(userId) {
    const id = String(userId);
    let stream = this.remoteStreams.get(id);
    if (!stream) {
      stream = new MediaStream();
      this.remoteStreams.set(id, stream);
    }
    return stream;
  }

  attachRemoteAudio(userId, track) {
    try {
      if (typeof document === 'undefined') return;
      if (!this.audioElements.has(track.sid)) {
        const el = track.attach();
        el.id = `ms-lk-audio-${userId}-${track.sid}`;
        el.style.display = 'none';
        document.body.appendChild(el);
        this.audioElements.set(track.sid, el);
      }
    } catch (err) {
      console.warn('[LiveKit] Remote audio element attach failed:', err);
    }
  }

  detachRemoteAudio(trackSid) {
    const el = this.audioElements.get(trackSid);
    if (el) {
      try {
        el.pause();
        el.srcObject = null;
        el.remove();
      } catch (err) {
        console.warn('[LiveKit] Remote audio element detach warning:', err);
      }
      this.audioElements.delete(trackSid);
    }
  }

  updateLocalStream() {
    if (!this.localStream) {
      this.localStream = new MediaStream();
    }

    const camPub = this.room?.localParticipant?.getTrackPublication(Track.Source.Camera);
    const micPub = this.room?.localParticipant?.getTrackPublication(Track.Source.Microphone);

    // Synchronize video tracks
    const currentVideoTracks = this.localStream.getVideoTracks();
    if (camPub?.track?.mediaStreamTrack) {
      if (!currentVideoTracks.includes(camPub.track.mediaStreamTrack)) {
        currentVideoTracks.forEach((t) => this.localStream.removeTrack(t));
        this.localStream.addTrack(camPub.track.mediaStreamTrack);
      }
    } else {
      currentVideoTracks.forEach((t) => this.localStream.removeTrack(t));
    }

    // Synchronize audio tracks
    const currentAudioTracks = this.localStream.getAudioTracks();
    if (micPub?.track?.mediaStreamTrack) {
      if (!currentAudioTracks.includes(micPub.track.mediaStreamTrack)) {
        currentAudioTracks.forEach((t) => this.localStream.removeTrack(t));
        this.localStream.addTrack(micPub.track.mediaStreamTrack);
      }
    } else {
      currentAudioTracks.forEach((t) => this.localStream.removeTrack(t));
    }

    this.callbacks.onLocalStream(this.localStream);
    return this.localStream;
  }

  /**
   * Connect to LiveKit SFU Room
   */
  async connect(url, token, options = {}) {
    if (this.room && this.room.state === 'connected') {
      return this.room;
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
      },
      ...options,
    });

    this.room = room;

    // Room connection state listeners
    room.on(RoomEvent.Connected, () => {
      this.callbacks.onRoomConnectionStateChange('connected');
    });

    room.on(RoomEvent.Reconnecting, () => {
      this.callbacks.onRoomConnectionStateChange('reconnecting');
    });

    room.on(RoomEvent.Reconnected, () => {
      this.callbacks.onRoomConnectionStateChange('connected');
    });

    room.on(RoomEvent.Disconnected, (reason) => {
      this.callbacks.onRoomConnectionStateChange('disconnected', reason);
    });

    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      this.callbacks.onRoomConnectionStateChange(state);
    });

    // Remote participant lifecycle
    room.on(RoomEvent.ParticipantConnected, (participant) => {
      const uId = String(participant.identity);
      this.connectionStates.set(uId, 'connected');
      this.callbacks.onConnectionStateChange(uId, 'connected');
      this.callbacks.onParticipantConnected(participant);
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      const uId = String(participant.identity);
      this.connectionStates.delete(uId);
      this.remoteStreams.delete(uId);

      // Clean up audio elements associated with participant
      participant.trackPublications?.forEach((pub) => {
        if (pub.trackSid) {
          this.detachRemoteAudio(pub.trackSid);
        }
      });

      this.callbacks.onRemoteStreamRemove(uId);
      this.callbacks.onConnectionStateChange(uId, 'disconnected');
      this.callbacks.onParticipantDisconnected(participant);
    });

    // Remote track subscription events
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      const uId = String(participant.identity);
      const stream = this.getOrCreateRemoteStream(uId);

      if (track.kind === Track.Kind.Video) {
        // If incoming is screen share, replace camera video track in stream with screen share
        // If incoming is camera, add if no screen share or replace old camera
        const existingVideoTracks = stream.getVideoTracks();
        if (track.source === Track.Source.ScreenShare) {
          existingVideoTracks.forEach((t) => stream.removeTrack(t));
          if (track.mediaStreamTrack) {
            stream.addTrack(track.mediaStreamTrack);
          }
        } else if (track.source === Track.Source.Camera) {
          // If already has screen share, don't override active screen share
          const hasScreenTrack = existingVideoTracks.some(
            (t) => t.label && t.label.toLowerCase().includes('screen')
          );
          if (!hasScreenTrack) {
            existingVideoTracks.forEach((t) => stream.removeTrack(t));
            if (track.mediaStreamTrack) {
              stream.addTrack(track.mediaStreamTrack);
            }
          }
        } else if (track.mediaStreamTrack) {
          existingVideoTracks.forEach((t) => stream.removeTrack(t));
          stream.addTrack(track.mediaStreamTrack);
        }
      } else if (track.kind === Track.Kind.Audio) {
        const existingAudioTracks = stream.getAudioTracks();
        existingAudioTracks.forEach((t) => stream.removeTrack(t));
        if (track.mediaStreamTrack) {
          stream.addTrack(track.mediaStreamTrack);
        }
        // Direct audio playback guarantee
        this.attachRemoteAudio(uId, track);
      }

      this.connectionStates.set(uId, 'connected');
      this.callbacks.onConnectionStateChange(uId, 'connected');
      this.callbacks.onRemoteStream(uId, stream);
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      const uId = String(participant.identity);
      const stream = this.remoteStreams.get(uId);

      if (stream && track.mediaStreamTrack) {
        stream.removeTrack(track.mediaStreamTrack);
      }

      if (track.kind === Track.Kind.Audio && track.sid) {
        this.detachRemoteAudio(track.sid);
      }

      // If screen share was unsubscribed, restore camera track if available
      if (track.source === Track.Source.ScreenShare && stream) {
        const cameraPub = participant.getTrackPublication(Track.Source.Camera);
        if (cameraPub?.track?.mediaStreamTrack) {
          stream.getVideoTracks().forEach((t) => stream.removeTrack(t));
          stream.addTrack(cameraPub.track.mediaStreamTrack);
        }
      }

      if (stream) {
        this.callbacks.onRemoteStream(uId, stream);
      }
    });

    room.on(RoomEvent.TrackMuted, (_publication, participant) => {
      const uId = String(participant.identity);
      const stream = this.remoteStreams.get(uId);
      if (stream) {
        this.callbacks.onRemoteStream(uId, stream);
      }
    });

    room.on(RoomEvent.TrackUnmuted, (_publication, participant) => {
      const uId = String(participant.identity);
      const stream = this.remoteStreams.get(uId);
      if (stream) {
        this.callbacks.onRemoteStream(uId, stream);
      }
    });

    // Local track published / unpublished
    room.on(RoomEvent.LocalTrackPublished, (publication) => {
      if (publication.source === Track.Source.ScreenShare) {
        const track = publication.track?.mediaStreamTrack;
        if (track) {
          this.screenStream = new MediaStream([track]);
          track.onended = () => {
            this.handleScreenShareEnded();
          };
          this.callbacks.onLocalScreenStream(this.screenStream);
        }
      } else {
        this.updateLocalStream();
      }
    });

    room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
      if (publication.source === Track.Source.ScreenShare) {
        if (this.screenStream) {
          this.screenStream.getTracks().forEach((t) => {
            try {
              t.stop();
            } catch {
              // Ignore track stop error
            }
          });
          this.screenStream = null;
        }
        this.callbacks.onLocalScreenStream(null);
        this.callbacks.onScreenShareEnded();
      } else {
        this.updateLocalStream();
      }
    });

    // Connect to SFU
    await room.connect(url, token);

    // Initial sync for any participants already present
    room.remoteParticipants?.forEach((participant) => {
      const uId = String(participant.identity);
      this.connectionStates.set(uId, 'connected');
      this.callbacks.onConnectionStateChange(uId, 'connected');

      participant.trackPublications?.forEach((pub) => {
        if (pub.isSubscribed && pub.track) {
          const stream = this.getOrCreateRemoteStream(uId);
          if (pub.track.mediaStreamTrack) {
            if (pub.kind === Track.Kind.Video) {
              stream.getVideoTracks().forEach((t) => stream.removeTrack(t));
              stream.addTrack(pub.track.mediaStreamTrack);
            } else if (pub.kind === Track.Kind.Audio) {
              stream.getAudioTracks().forEach((t) => stream.removeTrack(t));
              stream.addTrack(pub.track.mediaStreamTrack);
              this.attachRemoteAudio(uId, pub.track);
            }
          }
          this.callbacks.onRemoteStream(uId, stream);
        }
      });
    });

    return room;
  }

  /**
   * Start local camera and microphone publishing to LiveKit
   */
  async startLocalMedia({ audio = true, video = true } = {}) {
    if (!this.room || !this.room.localParticipant) {
      throw new Error('LiveKit room is not connected.');
    }

    // Try microphone
    if (audio) {
      try {
        await this.room.localParticipant.setMicrophoneEnabled(true);
      } catch (err) {
        console.warn('[LiveKit] Microphone initial enable warning:', err.message);
        this.callbacks.onError(err);
      }
    } else {
      try {
        await this.room.localParticipant.setMicrophoneEnabled(false);
      } catch (err) {
        console.warn('[LiveKit] Microphone initial disable warning:', err.message);
      }
    }

    // Try camera
    if (video) {
      try {
        await this.room.localParticipant.setCameraEnabled(true);
      } catch (err) {
        console.warn('[LiveKit] Camera initial enable warning:', err.message);
        this.callbacks.onError(err);
      }
    } else {
      try {
        await this.room.localParticipant.setCameraEnabled(false);
      } catch (err) {
        console.warn('[LiveKit] Camera initial disable warning:', err.message);
      }
    }

    this.updateLocalStream();
    return this.localStream;
  }

  /**
   * Toggle microphone
   */
  async setMicrophoneEnabled(enabled) {
    if (!this.room?.localParticipant) return;
    try {
      await this.room.localParticipant.setMicrophoneEnabled(enabled);
      this.updateLocalStream();
    } catch (err) {
      console.error('[LiveKit] setMicrophoneEnabled error:', err);
      this.callbacks.onError(err);
      throw err;
    }
  }

  /**
   * Toggle camera
   */
  async setCameraEnabled(enabled) {
    if (!this.room?.localParticipant) return;
    try {
      await this.room.localParticipant.setCameraEnabled(enabled);
      this.updateLocalStream();
    } catch (err) {
      console.error('[LiveKit] setCameraEnabled error:', err);
      this.callbacks.onError(err);
      throw err;
    }
  }

  /**
   * Start screen sharing
   */
  async startScreenShare() {
    if (!this.room?.localParticipant) {
      throw new Error('Not connected to LiveKit room.');
    }

    try {
      const pub = await this.room.localParticipant.setScreenShareEnabled(true);
      const track =
        pub?.track?.mediaStreamTrack ||
        this.room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track
          ?.mediaStreamTrack;

      if (track) {
        this.screenStream = new MediaStream([track]);
        track.onended = () => {
          this.handleScreenShareEnded();
        };
        this.callbacks.onLocalScreenStream(this.screenStream);
      }
      return this.screenStream;
    } catch (err) {
      console.error('[LiveKit] startScreenShare error:', err);
      this.callbacks.onError(err);
      throw err;
    }
  }

  /**
   * Stop screen sharing
   */
  async stopScreenShare() {
    if (this.room?.localParticipant) {
      try {
        await this.room.localParticipant.setScreenShareEnabled(false);
      } catch (err) {
        console.warn('[LiveKit] stopScreenShare error:', err);
      }
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // Ignore track stop error
        }
      });
      this.screenStream = null;
    }
    this.callbacks.onLocalScreenStream(null);
  }

  handleScreenShareEnded() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // Ignore track stop error
        }
      });
      this.screenStream = null;
    }
    if (this.room?.localParticipant) {
      this.room.localParticipant.setScreenShareEnabled(false).catch(() => {});
    }
    this.callbacks.onLocalScreenStream(null);
    this.callbacks.onScreenShareEnded();
  }

  /**
   * Complete cleanup on leave or meeting end
   */
  cleanup() {
    // 1. Stop local screen stream
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // Ignore
        }
      });
      this.screenStream = null;
    }

    // 2. Stop local camera/audio stream
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // Ignore
        }
      });
      this.localStream = null;
    }

    // 3. Detach and remove all audio elements
    this.audioElements.forEach((el) => {
      try {
        el.pause();
        el.srcObject = null;
        el.remove();
      } catch {
        // Ignore
      }
    });
    this.audioElements.clear();

    // 4. Disconnect LiveKit room
    if (this.room) {
      try {
        this.room.disconnect(true);
      } catch {
        // Ignore
      }
      this.room = null;
    }

    // 5. Clear participant maps
    this.remoteStreams.clear();
    this.connectionStates.clear();
  }
}

export const livekitService = new LiveKitService();
