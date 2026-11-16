import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Configure test environment variables before importing app modules
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-only-access-secret-key-meetspace-phase7';
process.env.JWT_REFRESH_SECRET = 'test-only-refresh-secret-key-meetspace-phase7';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.LIVEKIT_URL = 'ws://127.0.0.1:7880';
process.env.LIVEKIT_API_KEY = 'test_livekit_key';
process.env.LIVEKIT_API_SECRET = 'test_livekit_secret_at_least_32_characters_long_for_security';

import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.model.js';
import Meeting from '../src/models/Meeting.model.js';
import { signAccessToken } from '../src/utils/token.utils.js';
import { generateMeetingId } from '../src/utils/meetingId.utils.js';

const MONGOD_BIN = 'C:\\Program Files\\MongoDB\\Server\\8.3\\bin\\mongod.exe';
const TEST_DB_PORT = 27024;
const TEST_DB_DIR = path.resolve(
  'C:\\Users\\Guna sekhar\\.gemini\\antigravity\\brain\\83ff393e-9c3d-40bb-8f10-dd87e449b826\\scratch\\mongo-test-db-livekit'
);

let mongodProcess = null;
let app = null;

let userHost = null;
let tokenHost = null;
let userParticipant = null;
let tokenParticipant = null;
let userOutsider = null;
let tokenOutsider = null;

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

describe('MeetSpace LiveKit Token API Integration Tests (Phase 7)', () => {
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
    process.env.MONGODB_URI = `mongodb://127.0.0.1:${TEST_DB_PORT}/meetspace_test_livekit`;

    await connectDB(process.env.MONGODB_URI);
    await User.deleteMany({});
    await Meeting.deleteMany({});

    app = createApp();

    userHost = await User.create({
      name: 'Alice LiveKit Host',
      email: 'alice.livekit@meetspace.test',
      password: 'Password123!',
      role: 'user',
    });
    tokenHost = signAccessToken(userHost);

    userParticipant = await User.create({
      name: 'Bob LiveKit Participant',
      email: 'bob.livekit@meetspace.test',
      password: 'Password123!',
      role: 'user',
    });
    tokenParticipant = signAccessToken(userParticipant);

    userOutsider = await User.create({
      name: 'Eve Outsider',
      email: 'eve.outsider@meetspace.test',
      password: 'Password123!',
      role: 'user',
    });
    tokenOutsider = signAccessToken(userOutsider);
  });

  after(async () => {
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

  // 1. Authentication requirement
  it('Scenario 1: Rejects unauthenticated request with 401', async () => {
    const res = await request(app)
      .post('/api/livekit/token')
      .send({ meetingId: generateMeetingId() });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  // 2. Invalid Meeting ID format
  it('Scenario 2: Validates invalid meetingId format and returns 400', async () => {
    const res = await request(app)
      .post('/api/livekit/token')
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({ meetingId: 'invalid-id' });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    const errorMsg = res.body.errors ? res.body.errors[0]?.message : res.body.message;
    assert.ok(errorMsg.includes('Invalid Meeting ID format'));
  });

  // 3. Nonexistent meeting
  it('Scenario 3: Returns 404 when meeting does not exist', async () => {
    const res = await request(app)
      .post('/api/livekit/token')
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({ meetingId: generateMeetingId() });

    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('Meeting not found'));
  });

  // 4. Cancelled meeting rejection
  it('Scenario 4: Rejects token request for cancelled meeting with 400', async () => {
    const meeting = await Meeting.create({
      title: 'Cancelled Room',
      meetingId: generateMeetingId(),
      host: userHost._id,
      participants: [{ user: userHost._id, status: 'joined', joinedAt: new Date() }],
      status: 'cancelled',
      isInstant: true,
    });

    const res = await request(app)
      .post('/api/livekit/token')
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({ meetingId: meeting.meetingId });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('cancelled'));
  });

  // 5. Ended meeting rejection
  it('Scenario 5: Rejects token request for ended meeting with 400', async () => {
    const meeting = await Meeting.create({
      title: 'Ended Room',
      meetingId: generateMeetingId(),
      host: userHost._id,
      participants: [{ user: userHost._id, status: 'joined', joinedAt: new Date() }],
      status: 'ended',
      isInstant: true,
    });

    const res = await request(app)
      .post('/api/livekit/token')
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({ meetingId: meeting.meetingId });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('ended'));
  });

  // 6. Scheduled meeting restrictions (outside join window)
  it('Scenario 6: Rejects token request for future scheduled meeting outside join window', async () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours later
    const meeting = await Meeting.create({
      title: 'Future Scheduled Room',
      meetingId: generateMeetingId(),
      host: userHost._id,
      scheduledAt: futureDate,
      status: 'scheduled',
      isInstant: false,
    });

    const res = await request(app)
      .post('/api/livekit/token')
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({ meetingId: meeting.meetingId });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('not yet open'));
  });

  // 7. Non-member authorization rejection
  it('Scenario 7: Rejects token request with 403 when user is not a host or participant', async () => {
    const meeting = await Meeting.create({
      title: 'Private Meeting',
      meetingId: generateMeetingId(),
      host: userHost._id,
      participants: [{ user: userHost._id, status: 'joined', joinedAt: new Date() }],
      status: 'active',
      isInstant: true,
    });

    // Eve (outsider) requests token without joining
    const res = await request(app)
      .post('/api/livekit/token')
      .set('Authorization', `Bearer ${tokenOutsider}`)
      .send({ meetingId: meeting.meetingId });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('not an authorized participant'));
  });

  // 8. Participant limit enforcement
  it('Scenario 8: Enforces participantLimit and rejects excess participants with 403', async () => {
    const meeting = await Meeting.create({
      title: 'Capped Meeting',
      meetingId: generateMeetingId(),
      host: userHost._id,
      participants: [
        { user: userHost._id, status: 'joined', joinedAt: new Date() },
        { user: userParticipant._id, status: 'joined', joinedAt: new Date() },
        { user: userOutsider._id, status: 'joined', joinedAt: new Date() },
      ],
      settings: {
        participantLimit: 2, // Exceeded by having 3 joined participants
      },
      status: 'active',
      isInstant: true,
    });

    const res = await request(app)
      .post('/api/livekit/token')
      .set('Authorization', `Bearer ${tokenParticipant}`)
      .send({ meetingId: meeting.meetingId });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('maximum participant limit'));
  });

  // 9. Valid LiveKit token generation for host
  it('Scenario 9: Generates valid LiveKit token for host with correct room and identity', async () => {
    const meeting = await Meeting.create({
      title: 'Host LiveKit Room',
      meetingId: generateMeetingId(),
      host: userHost._id,
      participants: [{ user: userHost._id, status: 'joined', joinedAt: new Date() }],
      status: 'active',
      isInstant: true,
    });

    const res = await request(app)
      .post('/api/livekit/token')
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({ meetingId: meeting.meetingId });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.token);
    assert.strictEqual(res.body.data.url, 'ws://127.0.0.1:7880');
    assert.strictEqual(res.body.data.meetingId, meeting.meetingId);
    assert.strictEqual(res.body.data.isHost, true);

    // Verify LiveKit token structure and payload claims
    const decoded = jwt.decode(res.body.data.token);
    assert.strictEqual(decoded.sub, String(userHost._id));
    assert.strictEqual(decoded.name, userHost.name);
    assert.strictEqual(decoded.video.room, meeting.meetingId);
    assert.strictEqual(decoded.video.roomJoin, true);
    assert.strictEqual(decoded.video.canPublish, true);
    assert.strictEqual(decoded.video.canSubscribe, true);
  });

  // 10. Valid LiveKit token generation for joined participant
  it('Scenario 10: Generates valid LiveKit token for joined participant', async () => {
    const meeting = await Meeting.create({
      title: 'Participant LiveKit Room',
      meetingId: generateMeetingId(),
      host: userHost._id,
      participants: [
        { user: userHost._id, status: 'joined', joinedAt: new Date() },
        { user: userParticipant._id, status: 'joined', joinedAt: new Date() },
      ],
      status: 'active',
      isInstant: true,
    });

    const res = await request(app)
      .post('/api/livekit/token')
      .set('Authorization', `Bearer ${tokenParticipant}`)
      .send({ meetingId: meeting.meetingId });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.token);
    assert.strictEqual(res.body.data.isHost, false);

    const decoded = jwt.decode(res.body.data.token);
    assert.strictEqual(decoded.sub, String(userParticipant._id));
    assert.strictEqual(decoded.name, userParticipant.name);
    assert.strictEqual(decoded.video.room, meeting.meetingId);
  });

  // 11. Security: Never exposes API secret in response
  it('Scenario 11: Guarantees API secret is never returned in HTTP response', async () => {
    const meeting = await Meeting.create({
      title: 'Security Secret Check Room',
      meetingId: generateMeetingId(),
      host: userHost._id,
      participants: [{ user: userHost._id, status: 'joined', joinedAt: new Date() }],
      status: 'active',
      isInstant: true,
    });

    const res = await request(app)
      .post('/api/livekit/token')
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({ meetingId: meeting.meetingId });

    assert.strictEqual(res.status, 200);
    const bodyStr = JSON.stringify(res.body);
    assert.ok(!bodyStr.includes(process.env.LIVEKIT_API_SECRET));
    assert.ok(!bodyStr.includes('LIVEKIT_API_SECRET'));
  });

  // 12. Missing credentials configuration error handling
  it('Scenario 12: Handles missing LiveKit credentials with 500 error', async () => {
    const originalKey = process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_KEY;

    try {
      const meeting = await Meeting.create({
        title: 'Missing Creds Room',
        meetingId: generateMeetingId(),
        host: userHost._id,
        participants: [{ user: userHost._id, status: 'joined', joinedAt: new Date() }],
        status: 'active',
        isInstant: true,
      });

      const res = await request(app)
        .post('/api/livekit/token')
        .set('Authorization', `Bearer ${tokenHost}`)
        .send({ meetingId: meeting.meetingId });

      assert.strictEqual(res.status, 500);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('credentials are not configured'));
    } finally {
      process.env.LIVEKIT_API_KEY = originalKey;
    }
  });
});
