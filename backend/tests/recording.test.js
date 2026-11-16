import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import crypto from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Configure test environment variables before importing app modules
process.env.NODE_ENV = 'test';
process.env.MOCK_EGRESS = 'true';
process.env.JWT_ACCESS_SECRET = 'test-only-access-secret-key-meetspace-phase8';
process.env.JWT_REFRESH_SECRET = 'test-only-refresh-secret-key-meetspace-phase8';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.LIVEKIT_URL = 'ws://127.0.0.1:7880';
process.env.LIVEKIT_API_KEY = 'test_livekit_key';
process.env.LIVEKIT_API_SECRET = 'test_livekit_secret_at_least_32_characters_long_for_security';
process.env.RECORDINGS_DIR = path.resolve('backend/data/test-recordings');

import env from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.model.js';
import Meeting from '../src/models/Meeting.model.js';
import Recording from '../src/models/Recording.model.js';
import { signAccessToken } from '../src/utils/token.utils.js';
import { generateMeetingId } from '../src/utils/meetingId.utils.js';
import * as meetingService from '../src/services/meeting.service.js';

const MONGOD_BIN = 'C:\\Program Files\\MongoDB\\Server\\8.3\\bin\\mongod.exe';
const TEST_DB_PORT = 27025;
const TEST_DB_DIR = path.resolve('backend/data/test-db-recording');

let mongodProcess = null;
let app = null;

let userHost = null;
let tokenHost = null;
let userParticipant = null;
let tokenParticipant = null;
let userOutsider = null;
let tokenOutsider = null;

function waitForPort(port, host = '127.0.0.1', timeoutMs = 30000) {
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

/**
 * Creates a valid LiveKit webhook JWT header for testing
 */
function createLiveKitWebhookHeader(body) {
  const hash = crypto.createHash('sha256').update(body).digest('base64');
  return jwt.sign(
    {
      iss: env.LIVEKIT_API_KEY,
      sub: env.LIVEKIT_API_KEY,
      sha256: hash,
    },
    env.LIVEKIT_API_SECRET,
    { algorithm: 'HS256', expiresIn: '1m' }
  );
}

describe('MeetSpace Meeting Recording & LiveKit Egress Integration Tests (Phase 8)', () => {
  before(async () => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    fs.mkdirSync(process.env.RECORDINGS_DIR, { recursive: true });

    mongodProcess = spawn(
      MONGOD_BIN,
      [
        '--dbpath',
        TEST_DB_DIR,
        '--port',
        String(TEST_DB_PORT),
        '--bind_ip',
        '127.0.0.1',
      ],
      { stdio: 'pipe' }
    );

    mongodProcess.stdout.on('data', (d) => process.stdout.write(`[mongod] ${d}`));
    mongodProcess.stderr.on('data', (d) => process.stderr.write(`[mongod err] ${d}`));
    mongodProcess.on('exit', (code) => console.error(`[mongod exited with ${code}]`));

    await waitForPort(TEST_DB_PORT);
    process.env.MONGODB_URI = `mongodb://127.0.0.1:${TEST_DB_PORT}/meetspace_test_recording`;
    await connectDB();

    app = createApp();

    // Create test users
    userHost = await User.create({
      name: 'Alice Recording Host',
      email: 'host_rec@meetspace.io',
      password: 'Password123!',
    });
    tokenHost = signAccessToken(userHost);

    userParticipant = await User.create({
      name: 'Bob Recording Participant',
      email: 'part_rec@meetspace.io',
      password: 'Password123!',
    });
    tokenParticipant = signAccessToken(userParticipant);

    userOutsider = await User.create({
      name: 'Charlie Outsider',
      email: 'outsider_rec@meetspace.io',
      password: 'Password123!',
    });
    tokenOutsider = signAccessToken(userOutsider);
  });

  after(async () => {
    await disconnectDB();
    if (mongodProcess) {
      mongodProcess.kill();
      mongodProcess = null;
    }
    try {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
      fs.rmSync(process.env.RECORDINGS_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('Scenario 1: Rejects unauthenticated request to start recording with 401', async () => {
    const res = await request(app)
      .post('/api/meetings/abc-defg-hij/recordings/start')
      .send({});

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  it('Scenario 2: Validates invalid meetingId format and returns 400', async () => {
    const res = await request(app)
      .post('/api/meetings/invalid_id/recordings/start')
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({});

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  it('Scenario 3: Returns 404 when meeting does not exist', async () => {
    const res = await request(app)
      .post('/api/meetings/zzz-yyyy-xxx/recordings/start')
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({});

    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
  });

  it('Scenario 4: Rejects recording start for inactive (scheduled) meeting with 400', async () => {
    const meeting = await Meeting.create({
      title: 'Scheduled Inactive Meeting',
      meetingId: generateMeetingId(),
      host: userHost._id,
      status: 'scheduled',
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await request(app)
      .post(`/api/meetings/${meeting.meetingId}/recordings/start`)
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({});

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.message.includes('must be active'));
  });

  it('Scenario 5: Rejects recording start with 403 when requesting user is not the meeting host', async () => {
    const meeting = await Meeting.create({
      title: 'Active Meeting 1',
      meetingId: generateMeetingId(),
      host: userHost._id,
      status: 'active',
      startedAt: new Date(),
      participants: [{ user: userParticipant._id, status: 'joined' }],
    });

    const res = await request(app)
      .post(`/api/meetings/${meeting.meetingId}/recordings/start`)
      .set('Authorization', `Bearer ${tokenParticipant}`)
      .send({});

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.ok(res.body.message.includes('Only the meeting host'));
  });

  it('Scenario 6: Host successfully starts recording', async () => {
    const meeting = await Meeting.create({
      title: 'Active Meeting 2',
      meetingId: generateMeetingId(),
      host: userHost._id,
      status: 'active',
      startedAt: new Date(),
      participants: [{ user: userParticipant._id, status: 'joined' }],
    });

    const res = await request(app)
      .post(`/api/meetings/${meeting.meetingId}/recordings/start`)
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({ layout: 'grid' });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.recording.recordingId.startsWith('rec-'));
    assert.equal(res.body.data.recording.meetingId, meeting.meetingId);
    assert.equal(res.body.data.recording.status, 'recording');
    assert.ok(res.body.data.recording.egressId);
    // Ensure internal storageKey is not exposed
    assert.equal(res.body.data.recording.storageKey, undefined);
  });

  it('Scenario 7: Rejects duplicate concurrent recording start for the same meeting with 400', async () => {
    const meeting = await Meeting.create({
      title: 'Active Meeting 3',
      meetingId: generateMeetingId(),
      host: userHost._id,
      status: 'active',
      startedAt: new Date(),
    });

    // Start first recording
    const firstRes = await request(app)
      .post(`/api/meetings/${meeting.meetingId}/recordings/start`)
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({});
    assert.equal(firstRes.status, 201);

    // Attempt second recording while first is active
    const secondRes = await request(app)
      .post(`/api/meetings/${meeting.meetingId}/recordings/start`)
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({});

    assert.equal(secondRes.status, 400);
    assert.equal(secondRes.body.success, false);
    assert.ok(secondRes.body.message.includes('already active'));
  });

  it('Scenario 8: Non-host cannot stop recording (returns 403)', async () => {
    const meeting = await Meeting.create({
      title: 'Active Meeting 4',
      meetingId: generateMeetingId(),
      host: userHost._id,
      status: 'active',
      startedAt: new Date(),
      participants: [{ user: userParticipant._id, status: 'joined' }],
    });

    await request(app)
      .post(`/api/meetings/${meeting.meetingId}/recordings/start`)
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({});

    const res = await request(app)
      .post(`/api/meetings/${meeting.meetingId}/recordings/stop`)
      .set('Authorization', `Bearer ${tokenParticipant}`)
      .send({});

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.ok(res.body.message.includes('Only the meeting host'));
  });

  it('Scenario 9: Host successfully stops recording', async () => {
    const meeting = await Meeting.create({
      title: 'Active Meeting 5',
      meetingId: generateMeetingId(),
      host: userHost._id,
      status: 'active',
      startedAt: new Date(),
    });

    const startRes = await request(app)
      .post(`/api/meetings/${meeting.meetingId}/recordings/start`)
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({});
    const recId = startRes.body.data.recording.recordingId;

    const stopRes = await request(app)
      .post(`/api/meetings/${meeting.meetingId}/recordings/stop`)
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({ recordingId: recId });

    assert.equal(stopRes.status, 200);
    assert.equal(stopRes.body.success, true);
    assert.ok(['stopping', 'completed'].includes(stopRes.body.data.recording.status));
  });

  it('Scenario 10: Repeated stop requests are idempotent and return clean 200', async () => {
    const meeting = await Meeting.create({
      title: 'Active Meeting 6',
      meetingId: generateMeetingId(),
      host: userHost._id,
      status: 'active',
      startedAt: new Date(),
    });

    const startRes = await request(app)
      .post(`/api/meetings/${meeting.meetingId}/recordings/start`)
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({});
    const recId = startRes.body.data.recording.recordingId;

    await request(app)
      .post(`/api/meetings/${meeting.meetingId}/recordings/stop`)
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({ recordingId: recId });

    // Repeated stop call
    const secondStop = await request(app)
      .post(`/api/meetings/${meeting.meetingId}/recordings/stop`)
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({ recordingId: recId });

    assert.equal(secondStop.status, 200);
    assert.equal(secondStop.body.success, true);
  });

  it('Scenario 11: Meeting participants and host can list recordings for their meeting', async () => {
    const meeting = await Meeting.create({
      title: 'Active Meeting 7',
      meetingId: generateMeetingId(),
      host: userHost._id,
      status: 'active',
      startedAt: new Date(),
      participants: [{ user: userParticipant._id, status: 'joined' }],
    });

    await request(app)
      .post(`/api/meetings/${meeting.meetingId}/recordings/start`)
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({});

    // Host list
    const hostList = await request(app)
      .get(`/api/meetings/${meeting.meetingId}/recordings`)
      .set('Authorization', `Bearer ${tokenHost}`);
    assert.equal(hostList.status, 200);
    assert.equal(hostList.body.data.recordings.length, 1);

    // Participant list
    const partList = await request(app)
      .get(`/api/meetings/${meeting.meetingId}/recordings`)
      .set('Authorization', `Bearer ${tokenParticipant}`);
    assert.equal(partList.status, 200);
    assert.equal(partList.body.data.recordings.length, 1);
  });

  it('Scenario 12: Outsider user cannot list recordings for a meeting they did not participate in (403)', async () => {
    const meeting = await Meeting.create({
      title: 'Private Meeting',
      meetingId: generateMeetingId(),
      host: userHost._id,
      status: 'active',
      startedAt: new Date(),
    });

    const res = await request(app)
      .get(`/api/meetings/${meeting.meetingId}/recordings`)
      .set('Authorization', `Bearer ${tokenOutsider}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  it('Scenario 13: Authorized user can get recording details; server filesystem paths are never leaked in JSON', async () => {
    const meeting = await Meeting.create({
      title: 'Active Meeting 8',
      meetingId: generateMeetingId(),
      host: userHost._id,
      status: 'active',
      startedAt: new Date(),
      participants: [{ user: userParticipant._id, status: 'joined' }],
    });

    const startRes = await request(app)
      .post(`/api/meetings/${meeting.meetingId}/recordings/start`)
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({});
    const recId = startRes.body.data.recording.recordingId;

    const res = await request(app)
      .get(`/api/meetings/${meeting.meetingId}/recordings/${recId}`)
      .set('Authorization', `Bearer ${tokenParticipant}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.recording.recordingId, recId);
    assert.equal(res.body.data.recording.storageKey, undefined);
  });

  it('Scenario 14: Webhook rejects unauthenticated or invalid signature payloads', async () => {
    const res = await request(app)
      .post('/api/livekit/webhooks')
      .set('Authorization', 'invalid.jwt.token')
      .send({ event: 'egress_updated' });

    assert.equal(res.status, 500);
  });

  it('Scenario 15: Webhook processes valid LiveKit HMAC signed event and finalizes recording', async () => {
    const meeting = await Meeting.create({
      title: 'Active Meeting 9',
      meetingId: generateMeetingId(),
      host: userHost._id,
      status: 'active',
      startedAt: new Date(),
    });

    const startRes = await request(app)
      .post(`/api/meetings/${meeting.meetingId}/recordings/start`)
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({});
    const rec = await Recording.findOne({ recordingId: startRes.body.data.recording.recordingId });

    // Construct valid LiveKit egress_ended webhook payload
    const webhookPayload = JSON.stringify({
      event: 'egress_ended',
      egressInfo: {
        egressId: rec.egressId,
        roomId: meeting.meetingId,
        roomName: meeting.meetingId,
        status: 3, // EGRESS_COMPLETE
        fileResults: [
          {
            filename: rec.fileName,
            duration: '15000000000', // 15 seconds in nanoseconds
            size: '204800',
          },
        ],
      },
    });

    const authHeader = createLiveKitWebhookHeader(webhookPayload);

    const res = await request(app)
      .post('/api/livekit/webhooks')
      .set('Authorization', authHeader)
      .set('Content-Type', 'application/json')
      .send(webhookPayload);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const updated = await Recording.findById(rec._id);
    assert.equal(updated.status, 'completed');
    assert.equal(updated.duration, 15);
    assert.equal(updated.fileSize, 204800);
    assert.ok(updated.playbackUrl);
  });

  it('Scenario 16: Ending a meeting automatically stops and finalizes active recordings', async () => {
    const meeting = await Meeting.create({
      title: 'Active Meeting 10',
      meetingId: generateMeetingId(),
      host: userHost._id,
      status: 'active',
      startedAt: new Date(),
    });

    const startRes = await request(app)
      .post(`/api/meetings/${meeting.meetingId}/recordings/start`)
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({});
    const recId = startRes.body.data.recording.recordingId;

    // End meeting via service
    await meetingService.endMeeting(meeting.meetingId, userHost._id);

    const updatedRec = await Recording.findOne({ recordingId: recId });
    assert.equal(updatedRec.status, 'completed');
    assert.ok(updatedRec.endedAt);
  });

  it('Scenario 17: Video streaming endpoint supports Range requests (206) and downloads (200)', async () => {
    const meeting = await Meeting.create({
      title: 'Active Meeting 11',
      meetingId: generateMeetingId(),
      host: userHost._id,
      status: 'active',
      startedAt: new Date(),
      participants: [{ user: userParticipant._id, status: 'joined' }],
    });

    const startRes = await request(app)
      .post(`/api/meetings/${meeting.meetingId}/recordings/start`)
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({});
    const recId = startRes.body.data.recording.recordingId;

    // Stop to mark completed
    await request(app)
      .post(`/api/meetings/${meeting.meetingId}/recordings/stop`)
      .set('Authorization', `Bearer ${tokenHost}`)
      .send({ recordingId: recId });

    // Stream with Range header
    const streamRes = await request(app)
      .get(`/api/meetings/${meeting.meetingId}/recordings/${recId}/stream`)
      .set('Authorization', `Bearer ${tokenParticipant}`)
      .set('Range', 'bytes=0-10');

    assert.equal(streamRes.status, 206);
    assert.equal(streamRes.headers['content-type'], 'video/mp4');
    assert.ok(streamRes.headers['content-range']);

    // Download file
    const downloadRes = await request(app)
      .get(`/api/meetings/${meeting.meetingId}/recordings/${recId}/download`)
      .set('Authorization', `Bearer ${tokenHost}`);

    assert.equal(downloadRes.status, 200);
    assert.ok(downloadRes.headers['content-disposition'].includes('attachment'));
  });
});
