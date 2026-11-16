import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Copy,
  MonitorUp,
  Lock,
  ShieldCheck,
  X,
  ArrowLeft,
  RotateCcw,
  AlertCircle,
  Users,
  Loader2,
} from 'lucide-react';
import { VideoTile } from '../components/meeting/VideoTile';
import { MeetingChat } from '../components/meeting/MeetingChat';
import { ParticipantsPanel } from '../components/meeting/ParticipantsPanel';
import { MeetingControlsBar } from '../components/meeting/MeetingControlsBar';
import { MeetingInfoModal } from '../components/meeting/MeetingInfoModal';
import { HostControlsModal } from '../components/meeting/HostControlsModal';
import { RecordingsModal } from '../components/meeting/RecordingsModal';
import { Modal } from '../components/common/Modal';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { useAuth, useMeetings, useToast } from '../hooks/useAppContext';
import { meetingService } from '../services/meetingService';
import { socketService } from '../services/socketService';
import { livekitService } from '../services/livekitService';
import { recordingService } from '../services/recordingService';
import apiClient from '../services/apiClient';
import { formatElapsedTimer } from '../utils/formatters';
import { buildMeetingLink, copyTextToClipboard } from '../utils/meetingHelpers';
import '../components/meeting/meeting.css';

function formatChatTime(isoOrStr) {
  if (!isoOrStr) {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date());
  }
  try {
    const d = new Date(isoOrStr);
    if (isNaN(d.getTime())) return isoOrStr;
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return isoOrStr;
  }
}

const PARTICIPANT_PALETTE = [
  '#0284c7',
  '#0d9488',
  '#7c3aed',
  '#d97706',
  '#e11d48',
  '#059669',
  '#4f46e5',
];

function getParticipantColor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PARTICIPANT_PALETTE.length;
  return PARTICIPANT_PALETTE[index];
}

export function MeetingRoomPage() {
  const { meetingId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { syncMeetingInList, fetchDashboardMeetings } = useMeetings();
  const { showToast } = useToast();

  const [meeting, setMeeting] = useState(location.state?.preloadedMeeting || null);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [roomError, setRoomError] = useState('');

  const [isMuted, setIsMuted] = useState(
    location.state?.initialMicOn === false
  );
  const [isCameraOn, setIsCameraOn] = useState(
    location.state?.initialCameraOn ?? true
  );
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [activeScreenSharerId, setActiveScreenSharerId] = useState(null);
  const [isHandRaised, setIsHandRaised] = useState(false);

  const initialMediaRef = useRef({
    isMuted: location.state?.initialMicOn === false,
    isCameraOn: location.state?.initialCameraOn ?? true,
  });

  // Real-time participant presence and chat messages via Socket.IO
  const [realParticipants, setRealParticipants] = useState([]);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [peerConnectionStates, setPeerConnectionStates] = useState({});
  const [messages, setMessages] = useState([]);
  const [activeSidebar, setActiveSidebar] = useState(null); // 'chat' | 'participants' | null
  const [unreadCount, setUnreadCount] = useState(0);
  const [pinnedId, setPinnedId] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [isLockedLocal, setIsLockedLocal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showHostModal, setShowHostModal] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [submittingLeaveOrEnd, setSubmittingLeaveOrEnd] = useState(false);
  const [exitState, setExitState] = useState(null); // null | 'left' | 'ended'
  const [endedSummary, setEndedSummary] = useState(null);

  // Phase 8: LiveKit Egress Recording State
  const [recordingState, setRecordingState] = useState({
    status: 'idle', // 'idle' | 'starting' | 'recording' | 'stopping' | 'completed' | 'failed'
    recordingId: null,
    startedAt: null,
  });
  const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);
  const [showRecordingsModal, setShowRecordingsModal] = useState(false);
  const [showStartRecordConfirm, setShowStartRecordConfirm] = useState(false);
  const [showStopRecordConfirm, setShowStopRecordConfirm] = useState(false);
  const [submittingRecordAction, setSubmittingRecordAction] = useState(false);

  const activeSidebarRef = useRef(activeSidebar);
  useEffect(() => {
    activeSidebarRef.current = activeSidebar;
  }, [activeSidebar]);

  const loadAndJoinMeeting = useCallback(async () => {
    if (!meetingId) {
      setRoomError('No Meeting ID provided in the URL.');
      setLoadingRoom(false);
      return;
    }

    setLoadingRoom(true);
    setRoomError('');
    try {
      const joinData = await meetingService.joinMeeting(meetingId);
      let loadedMeeting = joinData?.meeting || null;
      if (!loadedMeeting) {
        loadedMeeting = await meetingService.getMeetingDetails(meetingId);
      }
      setMeeting(loadedMeeting);
      syncMeetingInList(loadedMeeting);
    } catch (err) {
      setRoomError(err.message || 'Unable to enter this meeting room.');
    } finally {
      setLoadingRoom(false);
    }
  }, [meetingId, syncMeetingInList]);

  useEffect(() => {
    let active = true;

    async function connectRoom() {
      if (!meetingId) {
        if (active) {
          setRoomError('No Meeting ID provided in the URL.');
          setLoadingRoom(false);
        }
        return;
      }

      try {
        const joinData = await meetingService.joinMeeting(meetingId);
        let loadedMeeting = joinData?.meeting || null;
        if (!loadedMeeting) {
          loadedMeeting = await meetingService.getMeetingDetails(meetingId);
        }
        if (active) {
          setMeeting(loadedMeeting);
          setRoomError('');
          syncMeetingInList(loadedMeeting);
        }
      } catch (err) {
        if (active) {
          setRoomError(err.message || 'Unable to enter this meeting room.');
        }
      } finally {
        if (active) {
          setLoadingRoom(false);
        }
      }
    }

    connectRoom();
    return () => {
      active = false;
    };
  }, [meetingId, syncMeetingInList]);

  useEffect(() => {
    if (loadingRoom || roomError || exitState) return undefined;
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [loadingRoom, roomError, exitState]);

  useEffect(() => {
    if (recordingState.status !== 'recording') return undefined;
    const recTimer = setInterval(() => {
      setRecordingElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(recTimer);
  }, [recordingState.status]);

  const hostId = meeting?.host?._id || meeting?.host?.id || meeting?.host;
  const isCurrentUserHost = Boolean(
    user?.id && hostId && String(hostId) === String(user.id)
  );
  const displayName =
    location.state?.displayName || user?.fullName || user?.name || 'Participant';
  const meetingTitle = meeting?.title || 'MeetSpace Collaboration Room';
  const hostName = meeting?.host?.name || 'Host';

  const backendActiveCount = useMemo(() => {
    if (!meeting?.participants) return 1;
    return meeting.participants.filter((p) => p.status === 'joined').length;
  }, [meeting]);

  const roomSettings = useMemo(
    () => ({
      isLocked: isLockedLocal,
      waitingRoom: Boolean(meeting?.settings?.waitingRoomEnabled),
      allowScreenShare: meeting?.settings?.allowParticipantScreenShare ?? true,
      allowChat: meeting?.settings?.chatEnabled ?? true,
    }),
    [isLockedLocal, meeting]
  );

  const selfParticipant = useMemo(
    () => ({
      id: String(user?.id || 'self'),
      name: displayName,
      email: user?.email || '',
      isSelf: true,
      isHost: isCurrentUserHost,
      isMuted,
      isCameraOn,
      isScreenSharing,
      isSpeaking: !isMuted,
      isHandRaised,
      avatarColor: user?.avatarColor || '#1a73e8',
      stream: isScreenSharing ? (livekitService.getScreenStream() || localStream) : localStream,
      connectionState: 'connected',
    }),
    [user?.id, user?.email, displayName, isCurrentUserHost, isMuted, isCameraOn, isScreenSharing, isHandRaised, user?.avatarColor, localStream]
  );

  const otherParticipants = useMemo(() => {
    return realParticipants
      .filter((p) => String(p.id) !== String(user?.id))
      .map((p) => {
        const uId = String(p.id);
        const remoteStream = remoteStreams[uId] || null;
        const connState = peerConnectionStates[uId] || 'new';
        const isSharing = Boolean(p.isScreenSharing || String(activeScreenSharerId) === uId);
        return {
          id: uId,
          name: p.name || 'Participant',
          email: p.email || '',
          role: p.role || 'user',
          isHost: Boolean(p.isHost),
          isSelf: false,
          isMuted: p.isMuted ?? true,
          isCameraOn: p.isCameraOn ?? false,
          isScreenSharing: isSharing,
          isSpeaking: !p.isMuted && connState === 'connected',
          isHandRaised: Boolean(p.isHandRaised),
          avatarColor: p.avatarColor || getParticipantColor(p.name),
          stream: remoteStream,
          connectionState: connState,
        };
      });
  }, [realParticipants, user?.id, remoteStreams, peerConnectionStates, activeScreenSharerId]);

  const allDisplayParticipants = useMemo(
    () => [selfParticipant, ...otherParticipants],
    [selfParticipant, otherParticipants]
  );

  useEffect(() => {
    if (!meetingId || loadingRoom || roomError || exitState) return undefined;

    let isSubscribed = true;

    // 1. Configure LiveKit service callbacks
    livekitService.setCallbacks({
      onLocalStream: (stream) => {
        if (isSubscribed) setLocalStream(stream);
      },
      onLocalScreenStream: (_stream) => {
        // Automatically updates local screen stream reference
      },
      onRemoteStream: (userId, stream) => {
        if (isSubscribed) {
          setRemoteStreams((prev) => ({ ...prev, [userId]: stream }));
        }
      },
      onRemoteStreamRemove: (userId) => {
        if (isSubscribed) {
          setRemoteStreams((prev) => {
            const next = { ...prev };
            delete next[userId];
            return next;
          });
          setPeerConnectionStates((prev) => {
            const next = { ...prev };
            delete next[userId];
            return next;
          });
        }
      },
      onConnectionStateChange: (userId, state) => {
        if (isSubscribed) {
          setPeerConnectionStates((prev) => ({ ...prev, [userId]: state }));
        }
      },
      onScreenShareEnded: () => {
        setIsScreenSharing(false);
        setActiveScreenSharerId((current) => (current === String(user?.id) ? null : current));
        socketService.stopScreenShare(meetingId);
        showToast('Screen sharing stopped.', 'info');
      },
      onError: (err) => {
        showToast(err.message || 'Media server communication error.', 'error');
      },
    });

    // 2. Obtain LiveKit token & connect to LiveKit SFU room
    async function initLiveKitRoom() {
      try {
        const tokenRes = await apiClient.post('/livekit/token', { meetingId });
        if (!isSubscribed) return;
        const { token, url } = tokenRes.data;
        await livekitService.connect(url, token);
        if (!isSubscribed) return;
        await livekitService.startLocalMedia({
          audio: !initialMediaRef.current.isMuted,
          video: initialMediaRef.current.isCameraOn,
        });
      } catch (lkErr) {
        console.warn('[LiveKit SFU] Connection error:', lkErr);
        if (isSubscribed) {
          showToast(lkErr.message || 'Unable to connect to media server.', 'error');
        }
      }
    }

    initLiveKitRoom();

    // 3. Connect socket for presence, chat, and host controls
    socketService.connect();
    socketService.joinMeeting(
      meetingId,
      initialMediaRef.current,
      (ack) => {
        if (ack?.success && Array.isArray(ack?.participants)) {
          setRealParticipants(ack.participants);
          const sharer = ack.participants.find((p) => p.isScreenSharing);
          if (sharer) {
            setActiveScreenSharerId(String(sharer.id));
            if (String(sharer.id) === String(user?.id)) {
              setIsScreenSharing(true);
            }
          }
        }
      }
    );

    // 4. Socket.IO presence and chat event listeners
    const unsubParticipants = socketService.on('meeting:participants', (payload) => {
      if (Array.isArray(payload?.participants)) {
        setRealParticipants(payload.participants);
        const sharer = payload.participants.find((p) => p.isScreenSharing);
        if (sharer) {
          setActiveScreenSharerId(String(sharer.id));
          if (String(sharer.id) === String(user?.id)) {
            setIsScreenSharing(true);
          }
        }
      }
    });

    const unsubJoined = socketService.on('participant:joined', (payload) => {
      if (payload?.participant) {
        setRealParticipants((prev) => {
          const id = String(payload.participant.id);
          const filtered = prev.filter((p) => String(p.id) !== id);
          return [...filtered, payload.participant];
        });
        showToast(`${payload.participant.name} joined the meeting.`, 'info');
      }
    });

    const unsubLeft = socketService.on('participant:left', (payload) => {
      if (payload?.userId) {
        const leftId = String(payload.userId);
        setRealParticipants((prev) => prev.filter((p) => String(p.id) !== leftId));
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[leftId];
          return next;
        });
        const name = payload.user?.name || 'A participant';
        showToast(`${name} left the meeting.`, 'info');
      }
    });

    const unsubMediaState = socketService.on('participant:media-state', (payload) => {
      if (!payload?.userId) return;
      setRealParticipants((prev) =>
        prev.map((p) =>
          String(p.id) === String(payload.userId)
            ? {
                ...p,
                isMuted: typeof payload.isMuted === 'boolean' ? payload.isMuted : p.isMuted,
                isCameraOn: typeof payload.isCameraOn === 'boolean' ? payload.isCameraOn : p.isCameraOn,
              }
            : p
        )
      );
    });

    const unsubScreenState = socketService.on('participant:screenshare-state', (payload) => {
      if (!payload?.meetingId) return;
      const uId = String(payload.userId);
      const isSharing = Boolean(payload.isSharing);

      if (isSharing) {
        setActiveScreenSharerId(uId);
        if (uId === String(user?.id)) {
          setIsScreenSharing(true);
        } else {
          const sharerName = payload.userName || 'A participant';
          showToast(`${sharerName} started sharing their screen.`, 'info');
        }
      } else {
        setActiveScreenSharerId((current) => (current === uId ? null : current));
        if (uId === String(user?.id)) {
          setIsScreenSharing(false);
        } else {
          const sharerName = payload.userName || 'A participant';
          showToast(`${sharerName} stopped sharing their screen.`, 'info');
        }
      }

      setRealParticipants((prev) =>
        prev.map((p) =>
          String(p.id) === uId ? { ...p, isScreenSharing: isSharing } : p
        )
      );
    });

    const unsubScreenError = socketService.on('screenshare:error', (payload) => {
      showToast(payload?.message || 'Screen sharing error.', 'error');
    });

    const unsubMessage = socketService.on('chat:message', (payload) => {
      if (!payload?.id) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === payload.id)) return prev;
        return [
          ...prev,
          {
            id: payload.id,
            senderId: payload.senderId,
            senderName: payload.senderName,
            text: payload.text,
            timestamp: formatChatTime(payload.timestamp),
            isSelf: String(payload.senderId) === String(user?.id),
          },
        ];
      });

      const isOwn = String(payload.senderId) === String(user?.id);
      if (!isOwn && activeSidebarRef.current !== 'chat') {
        setUnreadCount((cnt) => cnt + 1);
      }
    });

    const unsubChatError = socketService.on('chat:error', (payload) => {
      showToast(payload?.message || 'Chat error occurred.', 'error');
    });

    const unsubMeetingError = socketService.on('meeting:error', (payload) => {
      showToast(payload?.message || 'Meeting real-time error.', 'error');
    });

    const unsubRecStarted = socketService.on('recording:started', (payload) => {
      setRecordingState({
        status: 'recording',
        recordingId: payload?.recordingId || null,
        startedAt: payload?.startedAt || new Date().toISOString(),
      });
      setRecordingElapsedSeconds(0);
      showToast('Meeting recording has started.', 'info');
    });

    const unsubRecStopping = socketService.on('recording:stopping', (_payload) => {
      setRecordingState((prev) => ({
        ...prev,
        status: 'stopping',
      }));
      showToast('Recording is stopping and finalizing...', 'info');
    });

    const unsubRecCompleted = socketService.on('recording:completed', (_payload) => {
      setRecordingState((prev) => ({
        ...prev,
        status: 'completed',
      }));
      showToast('Meeting recording completed and saved.', 'success');
    });

    const unsubRecFailed = socketService.on('recording:failed', (payload) => {
      setRecordingState((prev) => ({
        ...prev,
        status: 'failed',
      }));
      showToast(`Recording failed: ${payload?.error || 'Unknown error'}`, 'error');
    });

    const offEnded = socketService.on('meeting:ended', (payload) => {
      livekitService.cleanup();
      setEndedSummary(payload?.summary || null);
      setExitState('ended');
      showToast('The host has ended this meeting for everyone.', 'info');
    });

    const offCancelled = socketService.on('meeting:cancelled', () => {
      livekitService.cleanup();
      setRoomError('This meeting was cancelled by the host.');
      showToast('This meeting was cancelled by the host.', 'error');
    });

    return () => {
      isSubscribed = false;
      unsubParticipants?.();
      unsubJoined?.();
      unsubLeft?.();
      unsubMediaState?.();
      unsubScreenState?.();
      unsubScreenError?.();
      unsubMessage?.();
      unsubChatError?.();
      unsubMeetingError?.();
      unsubRecStarted?.();
      unsubRecStopping?.();
      unsubRecCompleted?.();
      unsubRecFailed?.();
      offEnded?.();
      offCancelled?.();
      livekitService.cleanup();
      socketService.leaveMeeting(meetingId);
    };
  }, [meetingId, loadingRoom, roomError, exitState, user?.id, showToast]);

  const handleToggleSidebar = (panel) => {
    setActiveSidebar((prev) => {
      const next = prev === panel ? null : panel;
      if (next === 'chat') setUnreadCount(0);
      return next;
    });
  };

  const handleSendMessage = (text) => {
    if (!roomSettings.allowChat) {
      showToast('In-meeting chat is currently disabled by the host.', 'error');
      return;
    }
    if (!text || !text.trim()) return;

    try {
      socketService.sendMessage(meetingId, text.trim(), (ack) => {
        if (!ack?.success) {
          showToast(ack?.message || 'Failed to send message.', 'error');
        }
      });
    } catch (err) {
      showToast(err.message || 'Unable to send message via socket.', 'error');
    }
  };

  const handleToggleScreenShare = async () => {
    if (!roomSettings.allowScreenShare && !isCurrentUserHost) {
      showToast('Screen sharing is disabled by the host.', 'error');
      return;
    }

    if (isScreenSharing) {
      try {
        await livekitService.stopScreenShare();
        setIsScreenSharing(false);
        setActiveScreenSharerId((current) => (current === String(user?.id) ? null : current));
        socketService.stopScreenShare(meetingId, (ack) => {
          if (!ack?.success && ack?.message) {
            console.warn('[ScreenShare Stop]', ack.message);
          }
        });
        showToast('Screen sharing stopped.', 'info');
      } catch (err) {
        showToast(err.message || 'Failed to stop screen sharing.', 'error');
      }
    } else {
      if (activeScreenSharerId && String(activeScreenSharerId) !== String(user?.id)) {
        showToast('Another participant is already sharing their screen.', 'error');
        return;
      }

      socketService.startScreenShare(meetingId, async (ack) => {
        if (!ack?.success) {
          showToast(ack?.message || 'Unable to start screen sharing at this time.', 'error');
          return;
        }

        try {
          await livekitService.startScreenShare();
          setIsScreenSharing(true);
          setActiveScreenSharerId(String(user?.id));
          showToast('Screen sharing started.', 'success');
        } catch (captureErr) {
          socketService.stopScreenShare(meetingId);
          showToast(captureErr.message || 'Screen capture was cancelled or failed.', 'error');
        }
      });
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    livekitService.setMicrophoneEnabled(!nextMuted).catch((err) => {
      console.warn('[LiveKit Mute error]', err.message);
    });
    socketService.sendMediaState(meetingId, { isMuted: nextMuted, isCameraOn });
    showToast(nextMuted ? 'Microphone muted.' : 'Microphone unmuted.', 'info');
  };

  const handleToggleCamera = () => {
    const nextCamera = !isCameraOn;
    setIsCameraOn(nextCamera);
    livekitService.setCameraEnabled(nextCamera).catch((err) => {
      console.warn('[LiveKit Camera error]', err.message);
    });
    socketService.sendMediaState(meetingId, { isMuted, isCameraOn: nextCamera });
    showToast(nextCamera ? 'Camera turned on.' : 'Camera turned off.', 'info');
  };

  const handleToggleParticipantMute = (_id) => {
    showToast('Participant microphone muted in local view.', 'info');
  };

  const handleMuteAll = () => {
    showToast('All participants have been muted.', 'success');
  };

  const handleRemoveParticipant = (id) => {
    if (pinnedId === id) setPinnedId(null);
    showToast('Participant removal requires host authorization.', 'info');
  };

  const handleToggleRecording = () => {
    if (recordingState.status === 'recording' || recordingState.status === 'starting') {
      setShowStopRecordConfirm(true);
    } else {
      setShowStartRecordConfirm(true);
    }
  };

  const handleStartRecordingConfirm = async () => {
    setSubmittingRecordAction(true);
    try {
      setRecordingState({
        status: 'starting',
        recordingId: null,
        startedAt: new Date().toISOString(),
      });
      const rec = await recordingService.startRecording(meetingId, 'grid');
      if (rec) {
        setRecordingState({
          status: rec.status,
          recordingId: rec.recordingId,
          startedAt: rec.startedAt,
        });
      }
      setShowStartRecordConfirm(false);
      showToast('Recording initiated.', 'success');
    } catch (err) {
      setRecordingState({ status: 'idle', recordingId: null, startedAt: null });
      showToast(err.message || 'Failed to start recording.', 'error');
    } finally {
      setSubmittingRecordAction(false);
    }
  };

  const handleStopRecordingConfirm = async () => {
    setSubmittingRecordAction(true);
    try {
      setRecordingState((prev) => ({ ...prev, status: 'stopping' }));
      await recordingService.stopRecording(meetingId, recordingState.recordingId);
      setShowStopRecordConfirm(false);
      showToast('Stop recording requested.', 'info');
    } catch (err) {
      showToast(err.message || 'Failed to stop recording.', 'error');
    } finally {
      setSubmittingRecordAction(false);
    }
  };

  const handleUpdateRoomSetting = async (key, value) => {
    if (key === 'isLocked') {
      setIsLockedLocal(value);
      showToast(`Room ${value ? 'locked' : 'unlocked'} locally.`, 'info');
      return;
    }

    const fieldMap = {
      waitingRoom: 'waitingRoomEnabled',
      allowScreenShare: 'allowParticipantScreenShare',
      allowChat: 'chatEnabled',
    };
    const backendKey = fieldMap[key];
    if (!backendKey || !isCurrentUserHost) return;

    try {
      const updated = await meetingService.updateMeeting(meetingId, {
        settings: { [backendKey]: value },
      });
      setMeeting(updated);
      syncMeetingInList(updated);
      showToast('Meeting room setting saved.', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to update meeting setting.', 'error');
    }
  };

  const handleCopyInvite = async () => {
    const link = meeting?.meetingLink || buildMeetingLink(meetingId);
    const ok = await copyTextToClipboard(link);
    if (ok) showToast('Meeting invite link copied.', 'success');
  };

  const handleLeave = async () => {
    setSubmittingLeaveOrEnd(true);
    try {
      livekitService.cleanup();
      socketService.leaveMeeting(meetingId);
      await meetingService.leaveMeeting(meetingId);
      await fetchDashboardMeetings();
      setExitState('left');
      showToast('You left the meeting.', 'info');
    } catch (err) {
      showToast(err.message || 'Unable to record meeting leave.', 'error');
    } finally {
      setSubmittingLeaveOrEnd(false);
    }
  };

  const handleEndForAll = async () => {
    setSubmittingLeaveOrEnd(true);
    try {
      livekitService.cleanup();
      const result = await meetingService.endMeeting(meetingId);
      if (result?.meeting) {
        setMeeting(result.meeting);
        syncMeetingInList(result.meeting);
      }
      setEndedSummary(result?.summary || null);
      await fetchDashboardMeetings();
      setShowEndConfirm(false);
      setShowHostModal(false);
      setExitState('ended');
      showToast('Meeting ended for all participants.', 'info');
    } catch (err) {
      showToast(err.message || 'Unable to end meeting.', 'error');
    } finally {
      setSubmittingLeaveOrEnd(false);
    }
  };

  const handleRejoin = async () => {
    setExitState(null);
    setEndedSummary(null);
    await loadAndJoinMeeting();
  };

  if (loadingRoom) {
    return (
      <div
        className="ms-room-shell"
        style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <p style={{ fontSize: 16, color: '#e8eaed' }}>
          Connecting to MeetSpace room <strong>{meetingId}</strong>...
        </p>
      </div>
    );
  }

  if (roomError) {
    return (
      <div
        className="ms-room-shell"
        style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <div
          style={{
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            borderRadius: 'var(--radius-xl)',
            padding: '34px 30px',
            maxWidth: 460,
            width: '100%',
            textAlign: 'center',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <AlertCircle size={36} color="var(--color-danger)" style={{ marginBottom: 12 }} />
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Unable to Join Room</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14.5, marginBottom: 22 }}>
            {roomError}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {meetingId && (
              <Button variant="outline" onClick={loadAndJoinMeeting}>
                Retry
              </Button>
            )}
            <Button variant="primary" onClick={() => navigate('/dashboard')}>
              <ArrowLeft size={16} />
              <span>Back to Dashboard</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (exitState) {
    return (
      <div
        className="ms-room-shell"
        style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <div
          style={{
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            borderRadius: 'var(--radius-xl)',
            padding: '36px 32px',
            maxWidth: 460,
            width: '100%',
            textAlign: 'center',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <Badge variant={exitState === 'ended' ? 'danger' : 'neutral'} style={{ marginBottom: 12 }}>
            {exitState === 'ended' ? 'Session Ended by Host' : 'Left Meeting'}
          </Badge>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>
            {exitState === 'ended'
              ? 'The meeting has ended'
              : 'You left the meeting'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
            {meetingTitle} ({meetingId}) · Session timer {formatElapsedTimer(elapsedSeconds)}
            {endedSummary && ` · ${endedSummary.totalParticipants} recorded participant(s)`}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {exitState === 'left' && meeting?.status !== 'ended' && (
              <Button variant="outline" onClick={handleRejoin}>
                <RotateCcw size={16} />
                <span>Rejoin Room</span>
              </Button>
            )}
            <Button variant="primary" onClick={() => navigate('/dashboard')}>
              <ArrowLeft size={16} />
              <span>Return to Dashboard</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ms-room-shell">
      <header className="ms-room-header">
        <div className="ms-room-header__left">
          <h1 className="ms-room-title">{meetingTitle}</h1>
          <button
            type="button"
            className="ms-room-code-btn"
            onClick={handleCopyInvite}
            title="Copy meeting link"
          >
            <span>{meetingId}</span>
            <Copy size={12} />
          </button>
          <span
            className="ms-room-timer"
            title="Active real-time participants in this room"
          >
            <Users size={13} />
            {allDisplayParticipants.length} joined
          </span>
          {roomSettings.isLocked && (
            <Badge variant="warning">
              <Lock size={11} /> Locked
            </Badge>
          )}
        </div>

        <div className="ms-room-header__right">
          {recordingState.status === 'recording' && (
            <div className="ms-rec-badge" title="Recording is active">
              <span className="ms-rec-dot" />
              <span>REC {formatElapsedTimer(recordingElapsedSeconds)}</span>
            </div>
          )}
          {recordingState.status === 'starting' && (
            <div
              className="ms-rec-badge"
              style={{ background: '#78350f', borderColor: '#f59e0b', color: '#fde68a' }}
              title="Recording is starting..."
            >
              <Loader2 size={12} className="ms-spin" />
              <span>Starting REC...</span>
            </div>
          )}
          {recordingState.status === 'stopping' && (
            <div
              className="ms-rec-badge"
              style={{ background: '#78350f', borderColor: '#f59e0b', color: '#fde68a' }}
              title="Recording is saving..."
            >
              <Loader2 size={12} className="ms-spin" />
              <span>Saving REC...</span>
            </div>
          )}
          <Badge variant={isCurrentUserHost ? 'primary' : 'neutral'}>
            <ShieldCheck size={12} /> {isCurrentUserHost ? 'Host' : 'Participant'}
          </Badge>
          <span className="ms-room-timer" title="Elapsed meeting duration">
            <span className="ms-live-dot" />
            {formatElapsedTimer(elapsedSeconds)}
          </span>
        </div>
      </header>

      <div className="ms-room-workspace">
        <section className="ms-room-stage" aria-label="Video stage">
          {/* Recording Consent & Progress Banner */}
          {(recordingState.status === 'recording' || recordingState.status === 'starting') && (
            <div className="ms-recording-banner">
              <div className="ms-recording-banner__content">
                <span className="ms-rec-dot" />
                <div className="ms-recording-banner__text">
                  <strong style={{ fontSize: 13.5, color: '#fecaca' }}>
                    Recording is in progress
                  </strong>
                  <span style={{ fontSize: 12, color: '#fca5a5' }}>
                    This meeting is being recorded by the host. All participant audio, video, and screen shares are being saved.
                  </span>
                </div>
              </div>
              {isCurrentUserHost && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setShowStopRecordConfirm(true)}
                  disabled={recordingState.status === 'stopping'}
                  title="Stop recording"
                >
                  Stop Recording
                </Button>
              )}
            </div>
          )}
          {isScreenSharing && (
            <div className="ms-screenshare-banner">
              <div className="ms-screenshare-stage-preview">
                <MonitorUp size={24} color="#93c5fd" />
                <div>
                  <strong style={{ display: 'block', fontSize: 15, color: '#ffffff' }}>
                    You are presenting your screen
                  </strong>
                  <span style={{ fontSize: 13, color: '#bfdbfe' }}>
                    Your screen is being shared in real time with all participants.
                  </span>
                </div>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={handleToggleScreenShare}
              >
                Stop Sharing
              </Button>
            </div>
          )}

          {!isScreenSharing && activeScreenSharerId && (
            <div className="ms-screenshare-banner ms-screenshare-banner--remote">
              <div className="ms-screenshare-stage-preview">
                <MonitorUp size={24} color="#93c5fd" />
                <div>
                  <strong style={{ display: 'block', fontSize: 15, color: '#ffffff' }}>
                    {realParticipants.find((p) => String(p.id) === String(activeScreenSharerId))?.name || 'A participant'} is presenting
                  </strong>
                  <span style={{ fontSize: 13, color: '#bfdbfe' }}>
                    Viewing shared screen in real time.
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="ms-video-grid">
            {allDisplayParticipants.map((participant) => (
              <VideoTile
                key={participant.id}
                participant={participant}
                isSelf={Boolean(participant.isSelf)}
                isPinned={pinnedId === participant.id}
                onTogglePin={(id) =>
                  setPinnedId((prev) => (prev === id ? null : id))
                }
              />
            ))}
          </div>
        </section>

        {activeSidebar && (
          <aside className="ms-room-sidebar" aria-label="Meeting side panel">
            <div className="ms-sidebar-header">
              <div className="ms-sidebar-tabs">
                <button
                  type="button"
                  className={`ms-sidebar-tab ${
                    activeSidebar === 'chat' ? 'ms-sidebar-tab--active' : ''
                  }`}
                  onClick={() => {
                    setActiveSidebar('chat');
                    setUnreadCount(0);
                  }}
                >
                  In-call Chat
                </button>
                <button
                  type="button"
                  className={`ms-sidebar-tab ${
                    activeSidebar === 'participants' ? 'ms-sidebar-tab--active' : ''
                  }`}
                  onClick={() => setActiveSidebar('participants')}
                >
                  People ({allDisplayParticipants.length})
                </button>
              </div>
              <button
                type="button"
                className="ms-modal__close"
                onClick={() => setActiveSidebar(null)}
                aria-label="Close side panel"
              >
                <X size={18} />
              </button>
            </div>

            {activeSidebar === 'chat' ? (
              <MeetingChat
                messages={messages}
                onSendMessage={handleSendMessage}
              />
            ) : (
              <ParticipantsPanel
                participants={allDisplayParticipants}
                isCurrentUserHost={isCurrentUserHost}
                pinnedId={pinnedId}
                onTogglePin={(id) =>
                  setPinnedId((prev) => (prev === id ? null : id))
                }
                onToggleParticipantMute={handleToggleParticipantMute}
                onMuteAll={handleMuteAll}
                onRemoveParticipant={handleRemoveParticipant}
              />
            )}
          </aside>
        )}
      </div>

      <MeetingControlsBar
        isMuted={isMuted}
        isCameraOn={isCameraOn}
        isScreenSharing={isScreenSharing}
        isHandRaised={isHandRaised}
        activeSidebar={activeSidebar}
        participantCount={allDisplayParticipants.length}
        unreadCount={unreadCount}
        isHost={isCurrentUserHost}
        isRecording={
          recordingState.status === 'recording' ||
          recordingState.status === 'starting' ||
          recordingState.status === 'stopping'
        }
        recordingStatus={recordingState.status}
        onToggleRecording={handleToggleRecording}
        onOpenRecordings={() => setShowRecordingsModal(true)}
        onToggleMute={handleToggleMute}
        onToggleCamera={handleToggleCamera}
        onToggleScreenShare={handleToggleScreenShare}
        onToggleHand={() => setIsHandRaised((prev) => !prev)}
        onToggleSidebar={handleToggleSidebar}
        onOpenInfo={() => setShowInfoModal(true)}
        onOpenHostControls={() => setShowHostModal(true)}
        onLeaveMeeting={handleLeave}
        onRequestEndMeeting={() => setShowEndConfirm(true)}
      />

      {/* Meeting Recordings Modal */}
      <RecordingsModal
        isOpen={showRecordingsModal}
        onClose={() => setShowRecordingsModal(false)}
        meetingId={meetingId}
        meetingTitle={meetingTitle}
      />

      {/* Start Recording Notice & Confirmation Modal */}
      <Modal
        isOpen={showStartRecordConfirm}
        onClose={() => setShowStartRecordConfirm(false)}
        title="Start recording this meeting?"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setShowStartRecordConfirm(false)}
              disabled={submittingRecordAction}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleStartRecordingConfirm}
              loading={submittingRecordAction}
            >
              Start Recording
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
            By starting the recording, LiveKit Egress will capture the meeting stage layout including all participant video streams, microphone audio, and shared screens into an MP4 file.
          </p>
          <div
            style={{
              padding: 10,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #ef4444',
              borderRadius: 8,
              fontSize: 12.5,
              color: '#fca5a5',
            }}
          >
            <strong>Participant Consent Notice:</strong> All attendees in this meeting room will be notified in real time that recording has started.
          </div>
        </div>
      </Modal>

      {/* Stop Recording Confirmation Modal */}
      <Modal
        isOpen={showStopRecordConfirm}
        onClose={() => setShowStopRecordConfirm(false)}
        title="Stop recording?"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setShowStopRecordConfirm(false)}
              disabled={submittingRecordAction}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleStopRecordingConfirm}
              loading={submittingRecordAction}
            >
              Stop & Save
            </Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
          Are you sure you want to stop recording? LiveKit Egress will finalize the MP4 file and make it available in the meeting recordings history.
        </p>
      </Modal>

      <MeetingInfoModal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        meetingId={meetingId}
        title={meetingTitle}
        hostName={hostName}
      />

      <HostControlsModal
        isOpen={showHostModal}
        onClose={() => setShowHostModal(false)}
        roomSettings={roomSettings}
        onUpdateRoomSetting={handleUpdateRoomSetting}
        onMuteAll={handleMuteAll}
        onEndMeetingForAll={() => {
          setShowHostModal(false);
          setShowEndConfirm(true);
        }}
      />

      <Modal
        isOpen={showEndConfirm}
        onClose={() => setShowEndConfirm(false)}
        title="End meeting for everyone?"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowEndConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleEndForAll}
              loading={submittingLeaveOrEnd}
            >
              End Meeting for All
            </Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: 14.5 }}>
          Ending the meeting will mark this session as ended in the backend for all{' '}
          {backendActiveCount} active participant(s).
        </p>
      </Modal>
    </div>
  );
}
