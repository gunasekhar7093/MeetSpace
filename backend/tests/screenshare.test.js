import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import { io as ioClient } from 'socket.io-client';
import request from 'supertest';

// Configure test environment variables before importing app modules
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-only-access-secret-key-meetspace-phase6';
process.env.JWT_REFRESH_SECRET = 'test-only-refresh-secret-key-meetspace-phase6';
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
const TEST_DB_PORT = 27023;
const TEST_DB_DIR = path.resolve(
  'C:\\Users\\Guna sekhar\\.gemini\\antigravity\\brain\\83ff393e-9c3d-40bb-8f10-dd87e449b826\\scratch\\mongo-test-db-screenshare'
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

describe('MeetSpace Screen Sharing Tests (Phase 6)', () => {
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
      { stdio: 'ignore', windowsHide: true }
    );

    await waitForPort(TEST_DB_PORT);
    process.env.MONGODB_URI = `mongodb://127.0.0.1:${TEST_DB_PORT}/meetspace_test_screenshare`;

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
      email: 'alice.screenshare@meetspace.test',
      password: 'Password123!',
      role: 'user',
    });
    tokenAlice = signAccessToken(userAlice);

    userBob = await User.create({
      name: 'Bob Participant',
      email: 'bob.screenshare@meetspace.test',
      password: 'Password123!',
      role: 'user',
    });
    tokenBob = signAccessToken(userBob);

    userCharlie = await User.create({
      name: 'Charlie Participant',
      email: 'charlie.screenshare@meetspace.test',
      password: 'Password123!',
      role: 'user',
    });
    tokenCharlie = signAccessToken(userCharlie);

    userOutsider = await User.create({
      name: 'Outsider User',
      email: 'outsider.screenshare@meetspace.test',
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

  // 1. Valid screen-sharing start
  it('Scenario 1: Allows room participant to start screen sharing and broadcasts state', async () => {
    const meeting = await Meeting.create({
      title: 'Valid Share Meeting',
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

    const bobScreenStatePromise = waitForEvent(bobClient, 'participant:screenshare-state');

    const ack = await new Promise((resolve) => {
      aliceClient.emit('screenshare:start', { meetingId: meeting.meetingId }, resolve);
    });

    assert.strictEqual(ack.success, true);
    assert.strictEqual(ack.userId, String(userAlice._id));

    const broadcast = await bobScreenStatePromise;
    assert.strictEqual(broadcast.meetingId, meeting.meetingId);
    assert.strictEqual(broadcast.userId, String(userAlice._id));
    assert.strictEqual(broadcast.isSharing, true);

    // Verify presence manager state
    assert.strictEqual(presenceManager.getScreenSharer(meeting.meetingId), String(userAlice._id));

    aliceClient.disconnect();
    bobClient.disconnect();
  });

  // 2. Valid screen-sharing stop
  it('Scenario 2: Allows active sharer to stop screen sharing and releases slot', async () => {
    const meeting = await Meeting.create({
      title: 'Stop Share Meeting',
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

    // Alice starts
    const bobStartPromise = waitForEvent(bobClient, 'participant:screenshare-state');
    await new Promise((res) => aliceClient.emit('screenshare:start', { meetingId: meeting.meetingId }, res));
    const startBroadcast = await bobStartPromise;
    assert.strictEqual(startBroadcast.isSharing, true);

    const bobStopPromise = waitForEvent(bobClient, 'participant:screenshare-state');

    // Alice stops
    const ack = await new Promise((resolve) => {
      aliceClient.emit('screenshare:stop', { meetingId: meeting.meetingId }, resolve);
    });

    assert.strictEqual(ack.success, true);
    assert.strictEqual(ack.userId, String(userAlice._id));

    const broadcast = await bobStopPromise;
    assert.strictEqual(broadcast.meetingId, meeting.meetingId);
    assert.strictEqual(broadcast.userId, String(userAlice._id));
    assert.strictEqual(broadcast.isSharing, false);

    assert.strictEqual(presenceManager.getScreenSharer(meeting.meetingId), null);

    aliceClient.disconnect();
    bobClient.disconnect();
  });

  // 3. Unauthorized screen-sharing start (socket not in room)
  it('Scenario 3: Rejects screen sharing from a socket not in the meeting room', async () => {
    const meeting = await Meeting.create({
      title: 'Unauthorized Meeting',
      meetingId: generateMeetingId(),
      host: userAlice._id,
      participants: [{ user: userAlice._id, status: 'joined', joinedAt: new Date() }],
      status: 'active',
      isInstant: true,
    });

    const outsiderClient = createClient(tokenOutsider);
    await waitForConnect(outsiderClient);

    const ack = await new Promise((resolve) => {
      outsiderClient.emit('screenshare:start', { meetingId: meeting.meetingId }, resolve);
    });

    assert.strictEqual(ack.success, false);
    assert.ok(ack.message.includes('not in this meeting room'));

    outsiderClient.disconnect();
  });

  // 4. Wrong meeting room attempt
  it('Scenario 4: Rejects screen sharing for a different meeting ID than the joined room', async () => {
    const meeting1 = await Meeting.create({
      title: 'Meeting One',
      meetingId: generateMeetingId(),
      host: userAlice._id,
      participants: [{ user: userAlice._id, status: 'joined', joinedAt: new Date() }],
      status: 'active',
      isInstant: true,
    });
    const meeting2 = await Meeting.create({
      title: 'Meeting Two',
      meetingId: generateMeetingId(),
      host: userAlice._id,
      participants: [{ user: userAlice._id, status: 'joined', joinedAt: new Date() }],
      status: 'active',
      isInstant: true,
    });

    const aliceClient = createClient(tokenAlice);
    await waitForConnect(aliceClient);
    await new Promise((res) => aliceClient.emit('meeting:join', { meetingId: meeting1.meetingId }, res));

    // Alice attempts to start screen sharing for meeting2 while joined in meeting1
    const ack = await new Promise((resolve) => {
      aliceClient.emit('screenshare:start', { meetingId: meeting2.meetingId }, resolve);
    });

    assert.strictEqual(ack.success, false);
    assert.ok(ack.message.includes('not in this meeting room'));

    aliceClient.disconnect();
  });

  // 5. Duplicate screen sharing start by same user
  it('Scenario 5: Handles duplicate start from same user idempotently', async () => {
    const meeting = await Meeting.create({
      title: 'Duplicate Start Meeting',
      meetingId: generateMeetingId(),
      host: userAlice._id,
      participants: [{ user: userAlice._id, status: 'joined', joinedAt: new Date() }],
      status: 'active',
      isInstant: true,
    });

    const aliceClient = createClient(tokenAlice);
    await waitForConnect(aliceClient);
    await new Promise((res) => aliceClient.emit('meeting:join', { meetingId: meeting.meetingId }, res));

    const ack1 = await new Promise((res) => aliceClient.emit('screenshare:start', { meetingId: meeting.meetingId }, res));
    assert.strictEqual(ack1.success, true);

    // Second start attempt by same user
    const ack2 = await new Promise((res) => aliceClient.emit('screenshare:start', { meetingId: meeting.meetingId }, res));
    assert.strictEqual(ack2.success, true);
    assert.strictEqual(presenceManager.getScreenSharer(meeting.meetingId), String(userAlice._id));

    aliceClient.disconnect();
  });

  // 6. Stop when not sharing or non-sharer attempting to stop
  it('Scenario 6: Rejects screen sharing stop when user is not the active sharer', async () => {
    const meeting = await Meeting.create({
      title: 'Invalid Stop Meeting',
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

    // Alice starts
    await new Promise((res) => aliceClient.emit('screenshare:start', { meetingId: meeting.meetingId }, res));

    // Bob tries to stop Alice's screen share
    const bobStopAck = await new Promise((resolve) => {
      bobClient.emit('screenshare:stop', { meetingId: meeting.meetingId }, resolve);
    });

    assert.strictEqual(bobStopAck.success, false);
    assert.ok(bobStopAck.message.includes('not currently sharing'));

    // Alice's screen share remains active
    assert.strictEqual(presenceManager.getScreenSharer(meeting.meetingId), String(userAlice._id));

    aliceClient.disconnect();
    bobClient.disconnect();
  });

  // 7. Second participant attempting to share while slot is occupied (Single Sharer Policy)
  it('Scenario 7: Rejects second participant when screen-sharing slot is already occupied', async () => {
    const meeting = await Meeting.create({
      title: 'Slot Contention Meeting',
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

    // Alice acquires slot
    const aliceAck = await new Promise((res) => aliceClient.emit('screenshare:start', { meetingId: meeting.meetingId }, res));
    assert.strictEqual(aliceAck.success, true);

    // Bob tries to share simultaneously
    const bobErrorPromise = waitForEvent(bobClient, 'screenshare:error');
    const bobAck = await new Promise((res) => bobClient.emit('screenshare:start', { meetingId: meeting.meetingId }, res));

    assert.strictEqual(bobAck.success, false);
    assert.ok(bobAck.message.includes('already sharing'));

    const bobErrorEvent = await bobErrorPromise;
    assert.ok(bobErrorEvent.message.includes('already sharing'));

    // Alice remains the sole sharer
    assert.strictEqual(presenceManager.getScreenSharer(meeting.meetingId), String(userAlice._id));

    aliceClient.disconnect();
    bobClient.disconnect();
  });

  // 8. Slot release and handover
  it('Scenario 8: Allows second participant to share after active sharer stops', async () => {
    const meeting = await Meeting.create({
      title: 'Slot Handover Meeting',
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

    // Alice starts then stops
    await new Promise((res) => aliceClient.emit('screenshare:start', { meetingId: meeting.meetingId }, res));
    await new Promise((res) => aliceClient.emit('screenshare:stop', { meetingId: meeting.meetingId }, res));

    // Bob now acquires the slot
    const bobAck = await new Promise((res) => bobClient.emit('screenshare:start', { meetingId: meeting.meetingId }, res));
    assert.strictEqual(bobAck.success, true);
    assert.strictEqual(presenceManager.getScreenSharer(meeting.meetingId), String(userBob._id));

    aliceClient.disconnect();
    bobClient.disconnect();
  });

  // 9. Participant disconnect cleanup
  it('Scenario 9: Releases screen sharing slot and notifies room when active sharer disconnects', async () => {
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

    // Alice starts screen sharing
    const bobStartPromise = waitForEvent(bobClient, 'participant:screenshare-state');
    await new Promise((res) => aliceClient.emit('screenshare:start', { meetingId: meeting.meetingId }, res));
    const startBroadcast = await bobStartPromise;
    assert.strictEqual(startBroadcast.isSharing, true);
    assert.strictEqual(presenceManager.getScreenSharer(meeting.meetingId), String(userAlice._id));

    const bobScreenStopPromise = waitForEvent(bobClient, 'participant:screenshare-state');
    const bobLeftPromise = waitForEvent(bobClient, 'participant:left');

    // Alice unexpectedly disconnects
    aliceClient.disconnect();

    const [screenStopPayload, leftPayload] = await Promise.all([
      bobScreenStopPromise,
      bobLeftPromise,
    ]);

    assert.strictEqual(screenStopPayload.userId, String(userAlice._id));
    assert.strictEqual(screenStopPayload.isSharing, false);
    assert.strictEqual(leftPayload.userId, String(userAlice._id));

    // Screen sharing slot is now completely free
    assert.strictEqual(presenceManager.getScreenSharer(meeting.meetingId), null);

    // Bob can now immediately share
    const bobAck = await new Promise((res) => bobClient.emit('screenshare:start', { meetingId: meeting.meetingId }, res));
    assert.strictEqual(bobAck.success, true);

    bobClient.disconnect();
  });

  // 10. Meeting end cleanup
  it('Scenario 10: Releases screen sharing slot when meeting is ended by host', async () => {
    const meeting = await Meeting.create({
      title: 'Meeting End Screen Share',
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

    // Bob is sharing screen
    await new Promise((res) => bobClient.emit('screenshare:start', { meetingId: meeting.meetingId }, res));
    assert.strictEqual(presenceManager.getScreenSharer(meeting.meetingId), String(userBob._id));

    const endedPromise = waitForEvent(bobClient, 'meeting:ended');

    // Alice ends meeting via REST API
    const res = await request(app)
      .post(`/api/meetings/${meeting.meetingId}/end`)
      .set('Authorization', `Bearer ${tokenAlice}`);

    assert.strictEqual(res.status, 200);
    await endedPromise;

    // Room and screen sharer state must be cleared
    assert.strictEqual(presenceManager.getScreenSharer(meeting.meetingId), null);

    aliceClient.disconnect();
    bobClient.disconnect();
  });

  // 11. Concurrent screen-sharing attempts (atomic slot acquisition)
  it('Scenario 11: Safely awards screen-sharing slot to exactly one participant on concurrent requests', async () => {
    const meeting = await Meeting.create({
      title: 'Concurrent Share Meeting',
      meetingId: generateMeetingId(),
      host: userAlice._id,
      participants: [
        { user: userAlice._id, status: 'joined', joinedAt: new Date() },
        { user: userBob._id, status: 'joined', joinedAt: new Date() },
        { user: userCharlie._id, status: 'joined', joinedAt: new Date() },
      ],
      status: 'active',
      isInstant: true,
    });

    const aliceClient = createClient(tokenAlice);
    const bobClient = createClient(tokenBob);
    const charlieClient = createClient(tokenCharlie);
    await Promise.all([
      waitForConnect(aliceClient),
      waitForConnect(bobClient),
      waitForConnect(charlieClient),
    ]);

    await Promise.all([
      new Promise((res) => aliceClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
      new Promise((res) => bobClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
      new Promise((res) => charlieClient.emit('meeting:join', { meetingId: meeting.meetingId }, res)),
    ]);

    // Both Bob and Charlie attempt to start sharing at the exact same moment
    const [bobAck, charlieAck] = await Promise.all([
      new Promise((res) => bobClient.emit('screenshare:start', { meetingId: meeting.meetingId }, res)),
      new Promise((res) => charlieClient.emit('screenshare:start', { meetingId: meeting.meetingId }, res)),
    ]);

    // Exactly one must succeed, and the other must fail
    const results = [bobAck, charlieAck];
    const successes = results.filter((r) => r.success === true);
    const failures = results.filter((r) => r.success === false);

    assert.strictEqual(successes.length, 1);
    assert.strictEqual(failures.length, 1);
    assert.ok(failures[0].message.includes('already sharing'));

    aliceClient.disconnect();
    bobClient.disconnect();
    charlieClient.disconnect();
  });

  // 12. Host settings check (allowParticipantScreenShare)
  it('Scenario 12: Blocks non-host participant when host disables screen sharing setting', async () => {
    const meeting = await Meeting.create({
      title: 'Restricted Share Meeting',
      meetingId: generateMeetingId(),
      host: userAlice._id,
      participants: [
        { user: userAlice._id, status: 'joined', joinedAt: new Date() },
        { user: userBob._id, status: 'joined', joinedAt: new Date() },
      ],
      settings: {
        allowParticipantScreenShare: false,
      },
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

    // Bob (non-host) attempts to start sharing
    const bobAck = await new Promise((res) => bobClient.emit('screenshare:start', { meetingId: meeting.meetingId }, res));
    assert.strictEqual(bobAck.success, false);
    assert.ok(bobAck.message.includes('disabled by the host'));

    // Alice (host) is exempt and can still share
    const aliceAck = await new Promise((res) => aliceClient.emit('screenshare:start', { meetingId: meeting.meetingId }, res));
    assert.strictEqual(aliceAck.success, true);

    aliceClient.disconnect();
    bobClient.disconnect();
  });
});
