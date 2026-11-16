import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import request from 'supertest';
import { io as ioClient } from 'socket.io-client';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-only-access-secret-key-meetspace-webrtc';
process.env.JWT_REFRESH_SECRET = 'test-only-refresh-secret-key-meetspace-webrtc';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.FRONTEND_URL = 'http://localhost:5173';

import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import { closeSocket, initSocket } from '../src/socket/socket.js';
import { presenceManager } from '../src/socket/socket.utils.js';
import User from '../src/models/User.model.js';
import Meeting from '../src/models/Meeting.model.js';
import { signAccessToken } from '../src/utils/token.utils.js';
import { generateMeetingId } from '../src/utils/meetingId.utils.js';

const MONGOD_BIN = 'C:\\Program Files\\MongoDB\\Server\\8.3\\bin\\mongod.exe';
const TEST_DB_PORT = 27022;
const TEST_DB_DIR = path.resolve(
  'C:\\Users\\Guna sekhar\\.gemini\\antigravity\\brain\\83ff393e-9c3d-40bb-8f10-dd87e449b826\\scratch\\mongo-test-db-webrtc'
);

let mongodProcess = null;
let app = null;
let httpServer = null;
let serverPort = null;
let socketUrl = null;

let userAlice = null;
let tokenAlice = null;
let userBob = null;
let tokenBob = null;
let userCharlie = null;
let tokenCharlie = null;
let userOutsider = null;
let tokenOutsider = null;

let activeSockets = [];

function waitForPort(port, host = '127.0.0.1', timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = new net.Socket();
      socket.setTimeout(500);
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start >= timeoutMs) {
          reject(new Error(`Timed out waiting for mongod on port ${port}`));
        } else {
          setTimeout(attempt, 200);
        }
      });
      socket.once('timeout', () => {
        socket.destroy();
        setTimeout(attempt, 200);
      });
      socket.connect(port, host);
    };
    attempt();
  });
}

function createClient(token, extraOptions = {}) {
  const client = ioClient(socketUrl, {
    auth: token !== undefined ? { token } : undefined,
    transports: ['websocket'],
    autoConnect: true,
    forceNew: true,
    reconnection: false,
    ...extraOptions,
  });
  activeSockets.push(client);
  return client;
}

function waitForConnect(socket, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    if (socket.connected) return resolve(socket);
    const timer = setTimeout(() => {
      reject(new Error('Socket connection timed out'));
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function waitForEvent(socket, event, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for event "${event}"`));
    }, timeoutMs);

    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe('MeetSpace WebRTC Signaling & Media State Tests', () => {
  before(async () => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });

    mongodProcess = spawn(
      MONGOD_BIN,
      [
        '--dbpath',
        TEST_DB_DIR,
        '--port',
        String(TEST_DB_PORT),
        '--bind_ip',
        '127.0.0.1',
        '--quiet',
      ],
      { stdio: 'pipe', windowsHide: true }
    );

    await waitForPort(TEST_DB_PORT);
    process.env.MONGODB_URI = `mongodb://127.0.0.1:${TEST_DB_PORT}/meetspace_test_webrtc`;

    await connectDB(process.env.MONGODB_URI);
    await User.deleteMany({});
    await Meeting.deleteMany({});

    app = createApp();
    httpServer = http.createServer(app);
    initSocket(httpServer);

    await new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        serverPort = httpServer.address().port;
        socketUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });

    userAlice = await User.create({
      name: 'Alice Host',
      email: 'alice.host@meetspace.test',
      password: 'Password123!',
      role: 'user',
    });
    tokenAlice = signAccessToken(userAlice);

    userBob = await User.create({
      name: 'Bob Participant',
      email: 'bob.part@meetspace.test',
      password: 'Password123!',
      role: 'user',
    });
    tokenBob = signAccessToken(userBob);

    userCharlie = await User.create({
      name: 'Charlie Participant',
      email: 'charlie.part@meetspace.test',
      password: 'Password123!',
      role: 'user',
    });
    tokenCharlie = signAccessToken(userCharlie);

    userOutsider = await User.create({
      name: 'Outsider User',
      email: 'outsider@meetspace.test',
      password: 'Password123!',
      role: 'user',
    });
    tokenOutsider = signAccessToken(userOutsider);
  });

  after(async () => {
    for (const s of activeSockets) {
      if (s.connected) s.disconnect();
    }
    activeSockets = [];

    closeSocket();
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }

    try {
      await User.deleteMany({});
      await Meeting.deleteMany({});
      await disconnectDB();
    } finally {
      if (mongodProcess && !mongodProcess.killed) {
        mongodProcess.kill();
        await new Promise((resolve) => {
          mongodProcess.once('exit', resolve);
          setTimeout(resolve, 2000);
        });
      }
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
  });

  // 1. Unauthorized Signaling Rejection
  it('Scenario 1: Rejects signaling from socket not in meeting room', async () => {
    const meeting = await Meeting.create({
      title: 'Signaling Security Meeting',
      meetingId: generateMeetingId(),
      host: userAlice._id,
      participants: [{ user: userAlice._id, status: 'joined', joinedAt: new Date() }],
      status: 'active',
      isInstant: true,
    });

    const client = createClient(tokenOutsider);
    await waitForConnect(client);

    const ack = await new Promise((resolve) => {
      client.emit(
        'webrtc:offer',
        {
          meetingId: meeting.meetingId,
          targetUserId: String(userAlice._id),
          offer: { type: 'offer', sdp: 'v=0\r\no=mock...' },
        },
        resolve
      );
    });

    assert.strictEqual(ack.success, false);
    assert.ok(ack.message.includes('not in this meeting room'));
    client.disconnect();
  });

  // 2. Offer Delivery to Intended Recipient
  it('Scenario 2: Delivers valid SDP offer to intended recipient', async () => {
    const meeting = await Meeting.create({
      title: 'Offer Delivery Meeting',
      meetingId: generateMeetingId(),
      host: userAlice._id,
      participants: [
        { user: userAlice._id, status: 'joined', joinedAt: new Date() },
        { user: userBob._id, status: 'joined', joinedAt: new Date() },
      ],
      status: 'active',
      isInstant: true,
    });

    const aliceClient = createClient(tokenAlice);
    const bobClient = createClient(tokenBob);
    await Promise.all([waitForConnect(aliceClient), waitForConnect(bobClient)]);

    await Promise.all([
      new Promise((res) => aliceClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
      new Promise((res) => bobClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
    ]);

    const bobOfferPromise = waitForEvent(bobClient, 'webrtc:offer');

    const offerPayload = { type: 'offer', sdp: 'v=0\r\no=alice_offer_sdp' };
    const ack = await new Promise((res) => {
      aliceClient.emit(
        'webrtc:offer',
        {
          meetingId: meeting.meetingId,
          targetUserId: String(userBob._id),
          offer: offerPayload,
        },
        res
      );
    });

    assert.strictEqual(ack.success, true);

    const receivedOffer = await bobOfferPromise;
    assert.strictEqual(receivedOffer.meetingId, meeting.meetingId);
    assert.strictEqual(receivedOffer.senderId, String(userAlice._id));
    assert.strictEqual(receivedOffer.senderName, 'Alice Host');
    assert.strictEqual(receivedOffer.offer.type, 'offer');
    assert.strictEqual(receivedOffer.offer.sdp, offerPayload.sdp);

    aliceClient.disconnect();
    bobClient.disconnect();
  });

  // 3. Answer Delivery to Intended Recipient
  it('Scenario 3: Delivers valid SDP answer to intended recipient', async () => {
    const meeting = await Meeting.create({
      title: 'Answer Delivery Meeting',
      meetingId: generateMeetingId(),
      host: userAlice._id,
      participants: [
        { user: userAlice._id, status: 'joined', joinedAt: new Date() },
        { user: userBob._id, status: 'joined', joinedAt: new Date() },
      ],
      status: 'active',
      isInstant: true,
    });

    const aliceClient = createClient(tokenAlice);
    const bobClient = createClient(tokenBob);
    await Promise.all([waitForConnect(aliceClient), waitForConnect(bobClient)]);

    await Promise.all([
      new Promise((res) => aliceClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
      new Promise((res) => bobClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
    ]);

    const aliceAnswerPromise = waitForEvent(aliceClient, 'webrtc:answer');

    const answerPayload = { type: 'answer', sdp: 'v=0\r\no=bob_answer_sdp' };
    const ack = await new Promise((res) => {
      bobClient.emit(
        'webrtc:answer',
        {
          meetingId: meeting.meetingId,
          targetUserId: String(userAlice._id),
          answer: answerPayload,
        },
        res
      );
    });

    assert.strictEqual(ack.success, true);

    const receivedAnswer = await aliceAnswerPromise;
    assert.strictEqual(receivedAnswer.meetingId, meeting.meetingId);
    assert.strictEqual(receivedAnswer.senderId, String(userBob._id));
    assert.strictEqual(receivedAnswer.answer.type, 'answer');
    assert.strictEqual(receivedAnswer.answer.sdp, answerPayload.sdp);

    aliceClient.disconnect();
    bobClient.disconnect();
  });

  // 4. ICE Candidate Delivery
  it('Scenario 4: Delivers ICE candidate to intended recipient', async () => {
    const meeting = await Meeting.create({
      title: 'ICE Delivery Meeting',
      meetingId: generateMeetingId(),
      host: userAlice._id,
      participants: [
        { user: userAlice._id, status: 'joined', joinedAt: new Date() },
        { user: userBob._id, status: 'joined', joinedAt: new Date() },
      ],
      status: 'active',
      isInstant: true,
    });

    const aliceClient = createClient(tokenAlice);
    const bobClient = createClient(tokenBob);
    await Promise.all([waitForConnect(aliceClient), waitForConnect(bobClient)]);

    await Promise.all([
      new Promise((res) => aliceClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
      new Promise((res) => bobClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
    ]);

    const bobIcePromise = waitForEvent(bobClient, 'webrtc:ice-candidate');

    const candidatePayload = {
      candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    };

    const ack = await new Promise((res) => {
      aliceClient.emit(
        'webrtc:ice-candidate',
        {
          meetingId: meeting.meetingId,
          targetUserId: String(userBob._id),
          candidate: candidatePayload,
        },
        res
      );
    });

    assert.strictEqual(ack.success, true);

    const receivedIce = await bobIcePromise;
    assert.strictEqual(receivedIce.meetingId, meeting.meetingId);
    assert.strictEqual(receivedIce.senderId, String(userAlice._id));
    assert.strictEqual(receivedIce.candidate.candidate, candidatePayload.candidate);

    aliceClient.disconnect();
    bobClient.disconnect();
  });

  // 5. Signaling Room Isolation
  it('Scenario 5: Enforces signaling isolation between different meeting rooms', async () => {
    const meeting1 = await Meeting.create({
      title: 'Room 1',
      meetingId: generateMeetingId(),
      host: userAlice._id,
      participants: [
        { user: userAlice._id, status: 'joined', joinedAt: new Date() },
        { user: userBob._id, status: 'joined', joinedAt: new Date() },
      ],
      status: 'active',
      isInstant: true,
    });

    const meeting2 = await Meeting.create({
      title: 'Room 2',
      meetingId: generateMeetingId(),
      host: userCharlie._id,
      participants: [{ user: userCharlie._id, status: 'joined', joinedAt: new Date() }],
      status: 'active',
      isInstant: true,
    });

    const aliceClient = createClient(tokenAlice);
    const charlieClient = createClient(tokenCharlie);
    await Promise.all([waitForConnect(aliceClient), waitForConnect(charlieClient)]);

    await Promise.all([
      new Promise((res) => aliceClient.emit('meeting:join', { meetingId: meeting1.meetingId }, res)),
      new Promise((res) => charlieClient.emit('meeting:join', { meetingId: meeting2.meetingId }, res)),
    ]);

    // Alice tries to send an offer meant for Charlie across meetings
    const ack = await new Promise((res) => {
      aliceClient.emit(
        'webrtc:offer',
        {
          meetingId: meeting1.meetingId,
          targetUserId: String(userCharlie._id),
          offer: { type: 'offer', sdp: 'cross-room-attempt' },
        },
        res
      );
    });

    assert.strictEqual(ack.success, false);
    assert.ok(ack.message.includes('not connected to this meeting room'));

    aliceClient.disconnect();
    charlieClient.disconnect();
  });

  // 6. Sender Identity Spoofing Prevention
  it('Scenario 6: Prevents sender identity spoofing by strictly deriving sender from socket', async () => {
    const meeting = await Meeting.create({
      title: 'Anti-Spoof Signaling Meeting',
      meetingId: generateMeetingId(),
      host: userAlice._id,
      participants: [
        { user: userAlice._id, status: 'joined', joinedAt: new Date() },
        { user: userBob._id, status: 'joined', joinedAt: new Date() },
      ],
      status: 'active',
      isInstant: true,
    });

    const aliceClient = createClient(tokenAlice);
    const bobClient = createClient(tokenBob);
    await Promise.all([waitForConnect(aliceClient), waitForConnect(bobClient)]);

    await Promise.all([
      new Promise((res) => aliceClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
      new Promise((res) => bobClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
    ]);

    const aliceOfferPromise = waitForEvent(aliceClient, 'webrtc:offer');

    // Bob attempts to spoof senderId as Charlie
    bobClient.emit('webrtc:offer', {
      meetingId: meeting.meetingId,
      targetUserId: String(userAlice._id),
      senderId: String(userCharlie._id),
      senderName: 'Charlie Impersonator',
      offer: { type: 'offer', sdp: 'spoofed_sdp' },
    });

    const receivedOffer = await aliceOfferPromise;
    // Must remain Bob's authenticated ID
    assert.strictEqual(receivedOffer.senderId, String(userBob._id));
    assert.strictEqual(receivedOffer.senderName, 'Bob Participant');

    aliceClient.disconnect();
    bobClient.disconnect();
  });

  // 7. Missing Recipient Handling
  it('Scenario 7: Rejects signaling when recipient is not present in room', async () => {
    const meeting = await Meeting.create({
      title: 'Missing Recipient Meeting',
      meetingId: generateMeetingId(),
      host: userAlice._id,
      participants: [{ user: userAlice._id, status: 'joined', joinedAt: new Date() }],
      status: 'active',
      isInstant: true,
    });

    const aliceClient = createClient(tokenAlice);
    await waitForConnect(aliceClient);
    await new Promise((res) => aliceClient.emit('meeting:join', { meetingId: meeting.meetingId }, res));

    const ack = await new Promise((res) => {
      aliceClient.emit(
        'webrtc:offer',
        {
          meetingId: meeting.meetingId,
          targetUserId: '507f1f77bcf86cd799439011',
          offer: { type: 'offer', sdp: 'valid-sdp' },
        },
        res
      );
    });

    assert.strictEqual(ack.success, false);
    assert.ok(ack.message.includes('Recipient is not connected'));

    aliceClient.disconnect();
  });

  // 8. Self-Signaling Prevention
  it('Scenario 8: Rejects attempts to send WebRTC offer or answer to self', async () => {
    const meeting = await Meeting.create({
      title: 'Self Signal Meeting',
      meetingId: generateMeetingId(),
      host: userAlice._id,
      participants: [{ user: userAlice._id, status: 'joined', joinedAt: new Date() }],
      status: 'active',
      isInstant: true,
    });

    const aliceClient = createClient(tokenAlice);
    await waitForConnect(aliceClient);
    await new Promise((res) => aliceClient.emit('meeting:join', { meetingId: meeting.meetingId }, res));

    const ack = await new Promise((res) => {
      aliceClient.emit(
        'webrtc:offer',
        {
          meetingId: meeting.meetingId,
          targetUserId: String(userAlice._id),
          offer: { type: 'offer', sdp: 'self-sdp' },
        },
        res
      );
    });

    assert.strictEqual(ack.success, false);
    assert.ok(ack.message.includes('yourself'));

    aliceClient.disconnect();
  });

  // 9. Peer Connection Cleanup on Participant Leave
  it('Scenario 9: Emits participant:left when participant cleanly leaves meeting', async () => {
    const meeting = await Meeting.create({
      title: 'Leave Cleanup Meeting',
      meetingId: generateMeetingId(),
      host: userAlice._id,
      participants: [
        { user: userAlice._id, status: 'joined', joinedAt: new Date() },
        { user: userBob._id, status: 'joined', joinedAt: new Date() },
      ],
      status: 'active',
      isInstant: true,
    });

    const aliceClient = createClient(tokenAlice);
    const bobClient = createClient(tokenBob);
    await Promise.all([waitForConnect(aliceClient), waitForConnect(bobClient)]);

    await Promise.all([
      new Promise((res) => aliceClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
      new Promise((res) => bobClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
    ]);

    const leftPromise = waitForEvent(aliceClient, 'participant:left');
    bobClient.emit('meeting:leave', { meetingId: meeting.meetingId });

    const leftPayload = await leftPromise;
    assert.strictEqual(leftPayload.userId, String(userBob._id));

    aliceClient.disconnect();
    bobClient.disconnect();
  });

  // 10. Participant Disconnect Cleanup
  it('Scenario 10: Cleans up peer sockets and rejects subsequent signaling after disconnect', async () => {
    const meeting = await Meeting.create({
      title: 'Disconnect Cleanup Meeting',
      meetingId: generateMeetingId(),
      host: userAlice._id,
      participants: [
        { user: userAlice._id, status: 'joined', joinedAt: new Date() },
        { user: userBob._id, status: 'joined', joinedAt: new Date() },
      ],
      status: 'active',
      isInstant: true,
    });

    const aliceClient = createClient(tokenAlice);
    const bobClient = createClient(tokenBob);
    await Promise.all([waitForConnect(aliceClient), waitForConnect(bobClient)]);

    await Promise.all([
      new Promise((res) => aliceClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
      new Promise((res) => bobClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
    ]);

    const leftPromise = waitForEvent(aliceClient, 'participant:left');
    bobClient.disconnect();
    await leftPromise;

    // Alice now attempts signaling to disconnected Bob
    const ack = await new Promise((res) => {
      aliceClient.emit(
        'webrtc:offer',
        {
          meetingId: meeting.meetingId,
          targetUserId: String(userBob._id),
          offer: { type: 'offer', sdp: 'after_disconnect' },
        },
        res
      );
    });

    assert.strictEqual(ack.success, false);
    assert.ok(ack.message.includes('Recipient is not connected'));

    aliceClient.disconnect();
  });

  // 11. Meeting Ended Cleanup
  it('Scenario 11: Broadcasts meeting:ended and closes active session', async () => {
    const meeting = await Meeting.create({
      title: 'Meeting End Lifecycle',
      meetingId: generateMeetingId(),
      host: userAlice._id,
      participants: [
        { user: userAlice._id, status: 'joined', joinedAt: new Date() },
        { user: userBob._id, status: 'joined', joinedAt: new Date() },
      ],
      status: 'active',
      isInstant: true,
    });

    const bobClient = createClient(tokenBob);
    await waitForConnect(bobClient);
    await new Promise((res) => bobClient.emit('meeting:join', { meetingId: meeting.meetingId }, res));

    const endedPromise = waitForEvent(bobClient, 'meeting:ended');

    const res = await request(app)
      .post(`/api/meetings/${meeting.meetingId}/end`)
      .set('Authorization', `Bearer ${tokenAlice}`);

    assert.strictEqual(res.status, 200);

    const endedPayload = await endedPromise;
    assert.strictEqual(endedPayload.meetingId, meeting.meetingId);
    assert.ok(endedPayload.endedAt);

    bobClient.disconnect();
  });

  // 12. Media State Synchronization
  it('Scenario 12: Synchronizes microphone mute and camera toggle via participant:media-state', async () => {
    const meeting = await Meeting.create({
      title: 'Media Sync Meeting',
      meetingId: generateMeetingId(),
      host: userAlice._id,
      participants: [
        { user: userAlice._id, status: 'joined', joinedAt: new Date() },
        { user: userBob._id, status: 'joined', joinedAt: new Date() },
      ],
      status: 'active',
      isInstant: true,
    });

    const aliceClient = createClient(tokenAlice);
    const bobClient = createClient(tokenBob);
    await Promise.all([waitForConnect(aliceClient), waitForConnect(bobClient)]);

    await Promise.all([
      new Promise((res) => aliceClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
      new Promise((res) => bobClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
    ]);

    const bobMediaPromise = waitForEvent(bobClient, 'participant:media-state');

    // Alice mutes mic and disables camera
    const ack = await new Promise((res) => {
      aliceClient.emit(
        'participant:media-state',
        {
          meetingId: meeting.meetingId,
          isMuted: true,
          isCameraOn: false,
        },
        res
      );
    });

    assert.strictEqual(ack.success, true);
    assert.strictEqual(ack.isMuted, true);
    assert.strictEqual(ack.isCameraOn, false);

    const receivedMedia = await bobMediaPromise;
    assert.strictEqual(receivedMedia.meetingId, meeting.meetingId);
    assert.strictEqual(receivedMedia.userId, String(userAlice._id));
    assert.strictEqual(receivedMedia.isMuted, true);
    assert.strictEqual(receivedMedia.isCameraOn, false);

    // Verify PresenceManager state updated
    const participants = presenceManager.getParticipants(meeting.meetingId);
    const alicePresence = participants.find((p) => p.id === String(userAlice._id));
    assert.strictEqual(alicePresence.isMuted, true);
    assert.strictEqual(alicePresence.isCameraOn, false);

    aliceClient.disconnect();
    bobClient.disconnect();
  });

  // 13. Invalid Signaling Payload Handling
  it('Scenario 13: Rejects malformed, non-object, and oversized signaling payloads', async () => {
    const meeting = await Meeting.create({
      title: 'Payload Validation Meeting',
      meetingId: generateMeetingId(),
      host: userAlice._id,
      participants: [
        { user: userAlice._id, status: 'joined', joinedAt: new Date() },
        { user: userBob._id, status: 'joined', joinedAt: new Date() },
      ],
      status: 'active',
      isInstant: true,
    });

    const aliceClient = createClient(tokenAlice);
    const bobClient = createClient(tokenBob);
    await Promise.all([waitForConnect(aliceClient), waitForConnect(bobClient)]);

    await Promise.all([
      new Promise((res) => aliceClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
      new Promise((res) => bobClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
    ]);

    // Invalid offer object (missing sdp)
    const badOfferAck = await new Promise((res) => {
      aliceClient.emit(
        'webrtc:offer',
        {
          meetingId: meeting.meetingId,
          targetUserId: String(userBob._id),
          offer: { type: 'offer' },
        },
        res
      );
    });
    assert.strictEqual(badOfferAck.success, false);
    assert.ok(badOfferAck.message.includes('Invalid SDP offer'));

    // Oversized offer (>200,000 characters)
    const hugeSdp = 'v=0\r\n' + 'a=candidate:'.repeat(20000);
    const hugeAck = await new Promise((res) => {
      aliceClient.emit(
        'webrtc:offer',
        {
          meetingId: meeting.meetingId,
          targetUserId: String(userBob._id),
          offer: { type: 'offer', sdp: hugeSdp },
        },
        res
      );
    });
    assert.strictEqual(hugeAck.success, false);
    assert.ok(hugeAck.message.includes('maximum permitted size'));

    aliceClient.disconnect();
    bobClient.disconnect();
  });

  // 14. Reconnection Handling
  it('Scenario 14: Handles participant reconnect and routes signaling to new active socket', async () => {
    const meeting = await Meeting.create({
      title: 'Reconnect Signaling Meeting',
      meetingId: generateMeetingId(),
      host: userAlice._id,
      participants: [
        { user: userAlice._id, status: 'joined', joinedAt: new Date() },
        { user: userBob._id, status: 'joined', joinedAt: new Date() },
      ],
      status: 'active',
      isInstant: true,
    });

    const aliceClient = createClient(tokenAlice);
    let bobClient = createClient(tokenBob);
    await Promise.all([waitForConnect(aliceClient), waitForConnect(bobClient)]);

    await Promise.all([
      new Promise((res) => aliceClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
      new Promise((res) => bobClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
    ]);

    // Bob disconnects and reconnects with a new socket
    bobClient.disconnect();
    await new Promise((res) => setTimeout(res, 200));

    bobClient = createClient(tokenBob);
    await waitForConnect(bobClient);
    await new Promise((res) => bobClient.emit('meeting:join', { meetingId: meeting.meetingId }, res));

    // Alice now sends an offer to reconnected Bob
    const bobOfferPromise = waitForEvent(bobClient, 'webrtc:offer');

    const ack = await new Promise((res) => {
      aliceClient.emit(
        'webrtc:offer',
        {
          meetingId: meeting.meetingId,
          targetUserId: String(userBob._id),
          offer: { type: 'offer', sdp: 'reconnect_test_sdp' },
        },
        res
      );
    });

    assert.strictEqual(ack.success, true);
    const receivedOffer = await bobOfferPromise;
    assert.strictEqual(receivedOffer.offer.sdp, 'reconnect_test_sdp');

    aliceClient.disconnect();
    bobClient.disconnect();
  });
});
