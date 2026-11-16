import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import request from 'supertest';
import { io as ioClient } from 'socket.io-client';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-only-access-secret-key-meetspace-socket';
process.env.JWT_REFRESH_SECRET = 'test-only-refresh-secret-key-meetspace-socket';
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

const MONGOD_BIN = 'C:\\Program Files\\MongoDB\\Server\\8.3\\bin\\mongod.exe';
const TEST_DB_PORT = 27021;
const TEST_DB_DIR = path.resolve(
  'C:\\Users\\Guna sekhar\\.gemini\\antigravity\\brain\\83ff393e-9c3d-40bb-8f10-dd87e449b826\\scratch\\mongo-test-db-socket'
);

let mongodProcess = null;
let app = null;
let httpServer = null;
let serverPort = null;
let socketUrl = null;

let hostUser = null;
let hostToken = null;
let participantUser = null;
let participantToken = null;
let participantUser2 = null;
let participantToken2 = null;
let unauthorizedUser = null;
let unauthorizedToken = null;

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

describe('MeetSpace Socket.IO Real-Time Communication Tests', () => {
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
    process.env.MONGODB_URI = `mongodb://127.0.0.1:${TEST_DB_PORT}/meetspace_test_socket`;

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

    // Seed test users
    hostUser = await User.create({
      name: 'Host Alice',
      email: 'host.alice@meetspace.dev',
      password: 'Password123!',
      role: 'user',
    });
    hostToken = signAccessToken(hostUser);

    participantUser = await User.create({
      name: 'Bob Participant',
      email: 'bob@meetspace.dev',
      password: 'Password123!',
      role: 'user',
    });
    participantToken = signAccessToken(participantUser);

    participantUser2 = await User.create({
      name: 'Charlie Participant',
      email: 'charlie@meetspace.dev',
      password: 'Password123!',
      role: 'user',
    });
    participantToken2 = signAccessToken(participantUser2);

    unauthorizedUser = await User.create({
      name: 'Eve Intruder',
      email: 'eve@meetspace.dev',
      password: 'Password123!',
      role: 'user',
    });
    unauthorizedToken = signAccessToken(unauthorizedUser);
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

  // 1. Connection Authentication
  it('Scenario 1: Connects successfully with valid JWT access token', async () => {
    const client = createClient(hostToken);
    await waitForConnect(client);
    assert.strictEqual(client.connected, true);
    client.disconnect();
  });

  it('Scenario 2: Rejects connection when JWT token is missing', async () => {
    const client = createClient(undefined);
    await assert.rejects(
      waitForConnect(client),
      (err) => err.message.includes('Authentication required')
    );
  });

  it('Scenario 3: Rejects connection when JWT token is invalid', async () => {
    const client = createClient('invalid.jwt.token');
    await assert.rejects(
      waitForConnect(client),
      (err) => err.message.includes('Invalid access token')
    );
  });

  it('Scenario 4: Rejects connection when JWT token is expired', async () => {
    const expiredToken = jwt.sign(
      { sub: String(hostUser._id), role: hostUser.role, type: 'access' },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '-1s' }
    );
    const client = createClient(expiredToken);
    await assert.rejects(
      waitForConnect(client),
      (err) => err.message.includes('Access token has expired')
    );
  });

  // 2. Room Authorization & Join
  it('Scenario 5: Rejects meeting:join when user is unauthorized', async () => {
    const meeting = await Meeting.create({
      title: 'Private Meeting',
      meetingId: 'prv-sec5-rm1',
      host: hostUser._id,
      participants: [{ user: hostUser._id, status: 'joined', joinedAt: new Date() }],
      status: 'active',
      isInstant: true,
    });

    const client = createClient(unauthorizedToken);
    await waitForConnect(client);

    const ack = await new Promise((resolve) => {
      client.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });

    assert.strictEqual(ack.success, false);
    assert.ok(ack.message.includes('not authorized'));
    client.disconnect();
  });

  it('Scenario 6: Allows authorized meeting host to join room', async () => {
    const meeting = await Meeting.create({
      title: 'Host Meeting',
      meetingId: 'hst-sec6-rm1',
      host: hostUser._id,
      participants: [{ user: hostUser._id, status: 'joined', joinedAt: new Date() }],
      status: 'active',
      isInstant: true,
    });

    const client = createClient(hostToken);
    await waitForConnect(client);

    const ack = await new Promise((resolve) => {
      client.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });

    assert.strictEqual(ack.success, true);
    assert.strictEqual(ack.isHost, true);
    assert.strictEqual(ack.meetingId, meeting.meetingId);
    client.disconnect();
  });

  it('Scenario 7: Allows authorized participant to join room', async () => {
    const meeting = await Meeting.create({
      title: 'Team Meeting',
      meetingId: 'ptc-sec7-rm1',
      host: hostUser._id,
      participants: [
        { user: hostUser._id, status: 'joined', joinedAt: new Date() },
        { user: participantUser._id, status: 'joined', joinedAt: new Date() },
      ],
      status: 'active',
      isInstant: true,
    });

    const client = createClient(participantToken);
    await waitForConnect(client);

    const ack = await new Promise((resolve) => {
      client.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });

    assert.strictEqual(ack.success, true);
    assert.strictEqual(ack.isHost, false);
    client.disconnect();
  });

  // 3. Presence & List Synchronization
  it('Scenario 8: Emits meeting:participants to joining socket with complete active participant list', async () => {
    const meeting = await Meeting.create({
      title: 'Sync Meeting',
      meetingId: 'syn-sec8-rm1',
      host: hostUser._id,
      participants: [
        { user: hostUser._id, status: 'joined', joinedAt: new Date() },
        { user: participantUser._id, status: 'joined', joinedAt: new Date() },
      ],
      status: 'active',
      isInstant: true,
    });

    const hostClient = createClient(hostToken);
    await waitForConnect(hostClient);
    await new Promise((resolve) => {
      hostClient.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });

    const participantClient = createClient(participantToken);
    await waitForConnect(participantClient);

    const participantsEventPromise = waitForEvent(participantClient, 'meeting:participants');
    participantClient.emit('meeting:join', { meetingId: meeting.meetingId });
    const payload = await participantsEventPromise;

    assert.strictEqual(payload.meetingId, meeting.meetingId);
    assert.strictEqual(Array.isArray(payload.participants), true);
    assert.strictEqual(payload.participants.length, 2);

    const hostPresence = payload.participants.find((p) => p.id === String(hostUser._id));
    assert.ok(hostPresence);
    assert.strictEqual(hostPresence.name, 'Host Alice');
    assert.strictEqual(hostPresence.isHost, true);

    const partPresence = payload.participants.find((p) => p.id === String(participantUser._id));
    assert.ok(partPresence);
    assert.strictEqual(partPresence.name, 'Bob Participant');
    assert.strictEqual(partPresence.isHost, false);

    hostClient.disconnect();
    participantClient.disconnect();
  });

  it('Scenario 9: Broadcasts participant:joined to existing members when new participant joins', async () => {
    const meeting = await Meeting.create({
      title: 'Broadcast Join Meeting',
      meetingId: 'joi-sec9-rm1',
      host: hostUser._id,
      participants: [
        { user: hostUser._id, status: 'joined', joinedAt: new Date() },
        { user: participantUser._id, status: 'joined', joinedAt: new Date() },
      ],
      status: 'active',
      isInstant: true,
    });

    const hostClient = createClient(hostToken);
    await waitForConnect(hostClient);
    await new Promise((resolve) => {
      hostClient.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });

    const joinedPromise = waitForEvent(hostClient, 'participant:joined');

    const participantClient = createClient(participantToken);
    await waitForConnect(participantClient);
    await new Promise((resolve) => {
      participantClient.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });

    const joinedPayload = await joinedPromise;
    assert.strictEqual(joinedPayload.meetingId, meeting.meetingId);
    assert.strictEqual(joinedPayload.participant.id, String(participantUser._id));
    assert.strictEqual(joinedPayload.participant.name, 'Bob Participant');

    hostClient.disconnect();
    participantClient.disconnect();
  });

  it('Scenario 10: Broadcasts participant:left when member leaves room', async () => {
    const meeting = await Meeting.create({
      title: 'Broadcast Leave Meeting',
      meetingId: 'lev-sc10-rm1',
      host: hostUser._id,
      participants: [
        { user: hostUser._id, status: 'joined', joinedAt: new Date() },
        { user: participantUser._id, status: 'joined', joinedAt: new Date() },
      ],
      status: 'active',
      isInstant: true,
    });

    const hostClient = createClient(hostToken);
    await waitForConnect(hostClient);
    await new Promise((resolve) => {
      hostClient.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });

    const participantClient = createClient(participantToken);
    await waitForConnect(participantClient);
    await new Promise((resolve) => {
      participantClient.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });

    const leftPromise = waitForEvent(hostClient, 'participant:left');
    participantClient.emit('meeting:leave', { meetingId: meeting.meetingId });

    const leftPayload = await leftPromise;
    assert.strictEqual(leftPayload.meetingId, meeting.meetingId);
    assert.strictEqual(leftPayload.userId, String(participantUser._id));

    hostClient.disconnect();
    participantClient.disconnect();
  });

  // 4. Multi-Tab & Reconnection
  it('Scenario 11: Multi-tab presence: maintains user without duplicate entries and prevents false offline on single tab close', async () => {
    const meeting = await Meeting.create({
      title: 'Multi Tab Meeting',
      meetingId: 'mtb-sc11-rm1',
      host: hostUser._id,
      participants: [
        { user: hostUser._id, status: 'joined', joinedAt: new Date() },
        { user: participantUser._id, status: 'joined', joinedAt: new Date() },
      ],
      status: 'active',
      isInstant: true,
    });

    const hostClient = createClient(hostToken);
    await waitForConnect(hostClient);
    await new Promise((resolve) => {
      hostClient.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });

    // Bob opens Tab 1
    const bobTab1 = createClient(participantToken);
    await waitForConnect(bobTab1);
    const ack1 = await new Promise((resolve) => {
      bobTab1.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });
    assert.strictEqual(ack1.participants.length, 2);

    // Bob opens Tab 2
    const bobTab2 = createClient(participantToken);
    await waitForConnect(bobTab2);
    const ack2 = await new Promise((resolve) => {
      bobTab2.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });

    // Participant list count must still be 2 (no duplicate Bob)
    assert.strictEqual(ack2.participants.length, 2);
    const bobs = ack2.participants.filter((p) => p.id === String(participantUser._id));
    assert.strictEqual(bobs.length, 1);

    // Track if host receives participant:left
    let hostSawLeft = false;
    hostClient.on('participant:left', () => {
      hostSawLeft = true;
    });

    // Close Tab 1
    bobTab1.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Host should NOT have received participant:left because Tab 2 is still active
    assert.strictEqual(hostSawLeft, false);

    // Close Tab 2: Now participant:left should be emitted
    const leftPromise = waitForEvent(hostClient, 'participant:left');
    bobTab2.disconnect();
    const leftPayload = await leftPromise;
    assert.strictEqual(leftPayload.userId, String(participantUser._id));

    hostClient.disconnect();
  });

  it('Scenario 12: Disconnect and reconnect restores user presence accurately', async () => {
    const meeting = await Meeting.create({
      title: 'Reconnect Meeting',
      meetingId: 'rec-sc12-rm1',
      host: hostUser._id,
      participants: [{ user: hostUser._id, status: 'joined', joinedAt: new Date() }],
      status: 'active',
      isInstant: true,
    });

    const client = createClient(hostToken);
    await waitForConnect(client);

    await new Promise((resolve) => {
      client.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });

    let currentParticipants = presenceManager.getParticipants(meeting.meetingId);
    assert.strictEqual(currentParticipants.length, 1);

    // Disconnect
    client.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 200));
    currentParticipants = presenceManager.getParticipants(meeting.meetingId);
    assert.strictEqual(currentParticipants.length, 0);

    // Reconnect
    client.connect();
    await waitForConnect(client);
    const ack = await new Promise((resolve) => {
      client.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });

    assert.strictEqual(ack.success, true);
    assert.strictEqual(ack.participants.length, 1);
    client.disconnect();
  });

  // 5. Real-Time Chat
  it('Scenario 13: Delivers chat message to all sockets in meeting room (chat:send -> chat:message)', async () => {
    const meeting = await Meeting.create({
      title: 'Chat Meeting',
      meetingId: 'cht-sc13-rm1',
      host: hostUser._id,
      participants: [
        { user: hostUser._id, status: 'joined', joinedAt: new Date() },
        { user: participantUser._id, status: 'joined', joinedAt: new Date() },
      ],
      settings: { chatEnabled: true },
      status: 'active',
      isInstant: true,
    });

    const hostClient = createClient(hostToken);
    await waitForConnect(hostClient);
    await new Promise((resolve) => {
      hostClient.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });

    const participantClient = createClient(participantToken);
    await waitForConnect(participantClient);
    await new Promise((resolve) => {
      participantClient.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });

    const hostMsgPromise = waitForEvent(hostClient, 'chat:message');
    const partMsgPromise = waitForEvent(participantClient, 'chat:message');

    const sendAck = await new Promise((resolve) => {
      participantClient.emit(
        'chat:send',
        { meetingId: meeting.meetingId, text: 'Hello MeetSpace!' },
        resolve
      );
    });

    assert.strictEqual(sendAck.success, true);
    assert.strictEqual(sendAck.message.text, 'Hello MeetSpace!');

    const [hostMsg, partMsg] = await Promise.all([hostMsgPromise, partMsgPromise]);
    assert.strictEqual(hostMsg.text, 'Hello MeetSpace!');
    assert.strictEqual(hostMsg.senderName, 'Bob Participant');
    assert.strictEqual(hostMsg.senderId, String(participantUser._id));
    assert.ok(hostMsg.id);
    assert.ok(hostMsg.timestamp);

    assert.strictEqual(partMsg.id, hostMsg.id);

    hostClient.disconnect();
    participantClient.disconnect();
  });

  it('Scenario 14: Spoofing prevention: chat:message senderId and senderName derived strictly from socket session', async () => {
    const meeting = await Meeting.create({
      title: 'Anti-Spoof Meeting',
      meetingId: 'spf-sc14-rm1',
      host: hostUser._id,
      participants: [
        { user: hostUser._id, status: 'joined', joinedAt: new Date() },
        { user: participantUser._id, status: 'joined', joinedAt: new Date() },
      ],
      settings: { chatEnabled: true },
      status: 'active',
      isInstant: true,
    });

    const hostClient = createClient(hostToken);
    await waitForConnect(hostClient);
    await new Promise((resolve) => {
      hostClient.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });

    const participantClient = createClient(participantToken);
    await waitForConnect(participantClient);
    await new Promise((resolve) => {
      participantClient.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });

    const msgPromise = waitForEvent(hostClient, 'chat:message');

    // Bob tries to spoof senderId and senderName as Alice
    participantClient.emit('chat:send', {
      meetingId: meeting.meetingId,
      text: 'Trying to spoof identity',
      senderId: String(hostUser._id),
      senderName: 'Host Alice Impersonator',
    });

    const received = await msgPromise;
    // Must remain Bob Participant
    assert.strictEqual(received.senderId, String(participantUser._id));
    assert.strictEqual(received.senderName, 'Bob Participant');

    hostClient.disconnect();
    participantClient.disconnect();
  });

  it('Scenario 15: Rejects chat message when chat is disabled in meeting settings', async () => {
    const meeting = await Meeting.create({
      title: 'No Chat Meeting',
      meetingId: 'dht-sc15-rm1',
      host: hostUser._id,
      participants: [{ user: hostUser._id, status: 'joined', joinedAt: new Date() }],
      settings: { chatEnabled: false },
      status: 'active',
      isInstant: true,
    });

    const hostClient = createClient(hostToken);
    await waitForConnect(hostClient);
    await new Promise((resolve) => {
      hostClient.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });

    const ack = await new Promise((resolve) => {
      hostClient.emit(
        'chat:send',
        { meetingId: meeting.meetingId, text: 'This should fail' },
        resolve
      );
    });

    assert.strictEqual(ack.success, false);
    assert.ok(ack.message.includes('Chat is disabled'));

    hostClient.disconnect();
  });

  it('Scenario 16: Rejects empty or oversized (>2000 chars) chat messages with chat:error', async () => {
    const meeting = await Meeting.create({
      title: 'Validation Chat Meeting',
      meetingId: 'val-sc16-rm1',
      host: hostUser._id,
      participants: [{ user: hostUser._id, status: 'joined', joinedAt: new Date() }],
      settings: { chatEnabled: true },
      status: 'active',
      isInstant: true,
    });

    const hostClient = createClient(hostToken);
    await waitForConnect(hostClient);
    await new Promise((resolve) => {
      hostClient.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });

    // Empty message
    const emptyAck = await new Promise((resolve) => {
      hostClient.emit(
        'chat:send',
        { meetingId: meeting.meetingId, text: '   ' },
        resolve
      );
    });
    assert.strictEqual(emptyAck.success, false);
    assert.ok(emptyAck.message.includes('empty'));

    // Oversized message
    const oversizedText = 'A'.repeat(2001);
    const overAck = await new Promise((resolve) => {
      hostClient.emit(
        'chat:send',
        { meetingId: meeting.meetingId, text: oversizedText },
        resolve
      );
    });
    assert.strictEqual(overAck.success, false);
    assert.ok(overAck.message.includes('maximum length'));

    hostClient.disconnect();
  });

  it('Scenario 17: Enforces meeting room chat isolation (messages do not leak across rooms)', async () => {
    const meetingA = await Meeting.create({
      title: 'Room A',
      meetingId: 'iso-sc17-rma',
      host: hostUser._id,
      participants: [{ user: hostUser._id, status: 'joined', joinedAt: new Date() }],
      settings: { chatEnabled: true },
      status: 'active',
      isInstant: true,
    });

    const meetingB = await Meeting.create({
      title: 'Room B',
      meetingId: 'iso-sc17-rmb',
      host: participantUser._id,
      participants: [{ user: participantUser._id, status: 'joined', joinedAt: new Date() }],
      settings: { chatEnabled: true },
      status: 'active',
      isInstant: true,
    });

    const clientA = createClient(hostToken);
    await waitForConnect(clientA);
    await new Promise((resolve) => {
      clientA.emit('meeting:join', { meetingId: meetingA.meetingId }, resolve);
    });

    const clientB = createClient(participantToken);
    await waitForConnect(clientB);
    await new Promise((resolve) => {
      clientB.emit('meeting:join', { meetingId: meetingB.meetingId }, resolve);
    });

    let clientBReceived = false;
    clientB.on('chat:message', () => {
      clientBReceived = true;
    });

    const msgPromiseA = waitForEvent(clientA, 'chat:message');
    clientA.emit('chat:send', {
      meetingId: meetingA.meetingId,
      text: 'Secret Room A Message',
    });

    const receivedA = await msgPromiseA;
    assert.strictEqual(receivedA.text, 'Secret Room A Message');

    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.strictEqual(clientBReceived, false, 'Room B must NOT receive messages from Room A');

    clientA.disconnect();
    clientB.disconnect();
  });

  // 6. Meeting Lifecycle Broadcasts
  it('Scenario 18: Broadcasts meeting:ended event to room when meeting is ended via REST controller', async () => {
    const meeting = await Meeting.create({
      title: 'End Broadcast Meeting',
      meetingId: 'end-sc18-rm1',
      host: hostUser._id,
      participants: [
        { user: hostUser._id, status: 'joined', joinedAt: new Date() },
        { user: participantUser._id, status: 'joined', joinedAt: new Date() },
      ],
      status: 'active',
      isInstant: true,
    });

    const participantClient = createClient(participantToken);
    await waitForConnect(participantClient);
    await new Promise((resolve) => {
      participantClient.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });

    const endedPromise = waitForEvent(participantClient, 'meeting:ended');

    // Host ends meeting via REST endpoint
    const res = await request(app)
      .post(`/api/meetings/${meeting.meetingId}/end`)
      .set('Authorization', `Bearer ${hostToken}`);

    assert.strictEqual(res.status, 200);

    const endedPayload = await endedPromise;
    assert.strictEqual(endedPayload.meetingId, meeting.meetingId);
    assert.ok(endedPayload.endedAt);
    assert.ok(endedPayload.summary);

    participantClient.disconnect();
  });

  it('Scenario 19: Broadcasts meeting:cancelled event to room when meeting is cancelled via REST controller', async () => {
    const meeting = await Meeting.create({
      title: 'Cancel Broadcast Meeting',
      meetingId: 'ccl-sc19-rm1',
      host: hostUser._id,
      participants: [
        { user: hostUser._id, status: 'joined', joinedAt: new Date() },
        { user: participantUser._id, status: 'joined', joinedAt: new Date() },
      ],
      status: 'scheduled',
      isInstant: false,
    });

    const participantClient = createClient(participantToken);
    await waitForConnect(participantClient);
    await new Promise((resolve) => {
      participantClient.emit('meeting:join', { meetingId: meeting.meetingId }, resolve);
    });

    const cancelledPromise = waitForEvent(participantClient, 'meeting:cancelled');

    // Host cancels meeting via REST endpoint
    const res = await request(app)
      .delete(`/api/meetings/${meeting.meetingId}`)
      .set('Authorization', `Bearer ${hostToken}`);

    assert.strictEqual(res.status, 200);

    const cancelledPayload = await cancelledPromise;
    assert.strictEqual(cancelledPayload.meetingId, meeting.meetingId);
    assert.ok(cancelledPayload.cancelledAt);

    participantClient.disconnect();
  });

  it('Scenario 20: Rejects meeting:join for already ended or cancelled meetings', async () => {
    const endedMeeting = await Meeting.create({
      title: 'Past Meeting',
      meetingId: 'pst-sc20-end',
      host: hostUser._id,
      participants: [{ user: hostUser._id, status: 'joined', joinedAt: new Date() }],
      status: 'ended',
      isInstant: true,
    });

    const cancelledMeeting = await Meeting.create({
      title: 'Cancelled Meeting',
      meetingId: 'ccl-sc20-can',
      host: hostUser._id,
      participants: [{ user: hostUser._id, status: 'joined', joinedAt: new Date() }],
      status: 'cancelled',
      isInstant: false,
    });

    const client = createClient(hostToken);
    await waitForConnect(client);

    // Try joining ended meeting
    const endedAck = await new Promise((resolve) => {
      client.emit('meeting:join', { meetingId: endedMeeting.meetingId }, resolve);
    });
    assert.strictEqual(endedAck.success, false);
    assert.ok(endedAck.message.includes('ended'));

    // Try joining cancelled meeting
    const cancelAck = await new Promise((resolve) => {
      client.emit('meeting:join', { meetingId: cancelledMeeting.meetingId }, resolve);
    });
    assert.strictEqual(cancelAck.success, false);
    assert.ok(cancelAck.message.includes('cancelled'));

    client.disconnect();
  });
});
