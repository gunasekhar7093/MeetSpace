import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-only-access-secret-key-meetspace-phase2';
process.env.JWT_REFRESH_SECRET = 'test-only-refresh-secret-key-meetspace-phase2';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.FRONTEND_URL = 'http://localhost:5173';

import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.model.js';
import Meeting from '../src/models/Meeting.model.js';

const MONGOD_BIN = 'C:\\Program Files\\MongoDB\\Server\\8.3\\bin\\mongod.exe';
const TEST_DB_PORT = 27020;
const TEST_DB_DIR = path.resolve(
  'C:\\Users\\Guna sekhar\\.gemini\\antigravity\\brain\\83ff393e-9c3d-40bb-8f10-dd87e449b826\\scratch\\mongo-test-db-meetings'
);

let mongodProcess = null;
let app = null;

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

async function createAndLoginUser(userData) {
  await request(app).post('/api/auth/register').send(userData);
  const loginRes = await request(app).post('/api/auth/login').send({
    email: userData.email,
    password: userData.password,
  });
  assert.equal(loginRes.status, 200);
  return {
    user: loginRes.body.data.user,
    token: loginRes.body.data.accessToken,
  };
}

describe('MeetSpace Meeting Management API Integration Tests', () => {
  let hostUser;
  let hostToken;
  let guestUser;
  let guestToken;
  let thirdUser;
  let thirdToken;

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

    mongodProcess.stderr.on('data', (chunk) => {
      const msg = chunk.toString().trim();
      if (msg) console.error('[mongod meetings stderr]', msg);
    });

    await waitForPort(TEST_DB_PORT);
    process.env.MONGODB_URI = `mongodb://127.0.0.1:${TEST_DB_PORT}/meetspace_meetings_test`;

    await connectDB(process.env.MONGODB_URI);
    await Promise.all([User.deleteMany({}), Meeting.deleteMany({})]);
    app = createApp();

    const hostAuth = await createAndLoginUser({
      name: 'Host User',
      email: 'host@meetspace.test',
      password: 'Password123',
    });
    hostUser = hostAuth.user;
    hostToken = hostAuth.token;

    const guestAuth = await createAndLoginUser({
      name: 'Guest User',
      email: 'guest@meetspace.test',
      password: 'Password123',
    });
    guestUser = guestAuth.user;
    guestToken = guestAuth.token;

    const thirdAuth = await createAndLoginUser({
      name: 'Third User',
      email: 'third@meetspace.test',
      password: 'Password123',
    });
    thirdUser = thirdAuth.user;
    thirdToken = thirdAuth.token;
  });

  after(async () => {
    try {
      await Promise.all([User.deleteMany({}), Meeting.deleteMany({})]);
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

  let instantMeetingId = '';
  let scheduledMeetingId = '';
  let joinableScheduledMeetingId = '';

  it('rejects unauthenticated requests to all meeting endpoints', async () => {
    const endpoints = [
      request(app).post('/api/meetings').send({ title: 'Unauth' }),
      request(app).get('/api/meetings'),
      request(app).get('/api/meetings/history'),
      request(app).get('/api/meetings/abc-defg-hij'),
      request(app).patch('/api/meetings/abc-defg-hij').send({ title: 'X' }),
      request(app).delete('/api/meetings/abc-defg-hij'),
      request(app).post('/api/meetings/abc-defg-hij/join'),
      request(app).post('/api/meetings/abc-defg-hij/leave'),
      request(app).post('/api/meetings/abc-defg-hij/end'),
    ];

    const responses = await Promise.all(endpoints);
    for (const res of responses) {
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    }
  });

  it('validates meeting creation payloads and rejects forbidden fields', async () => {
    const invalidRes = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        title: 'A',
        isInstant: false,
        scheduledAt: '2020-01-01T00:00:00.000Z',
        settings: { participantLimit: 1 },
      });

    assert.equal(invalidRes.status, 400);
    assert.equal(invalidRes.body.success, false);
    assert.ok(Array.isArray(invalidRes.body.errors));

    const forbiddenRes = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        title: 'Spoofed Meeting',
        isInstant: true,
        meetingId: 'aaa-bbbb-ccc',
        host: guestUser._id,
        status: 'ended',
      });

    assert.equal(forbiddenRes.status, 400);
    assert.equal(forbiddenRes.body.success, false);
  });

  it('creates an instant meeting with active status, unique Meeting ID, link, and host participant', async () => {
    const res = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        title: 'Architecture Review Instant',
        description: 'Quick architecture sync',
        isInstant: true,
        settings: {
          participantLimit: 2,
          chatEnabled: true,
        },
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);

    const { meeting } = res.body.data;
    assert.match(meeting.meetingId, /^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/);
    assert.equal(meeting.meetingLink, `http://localhost:5173/room/${meeting.meetingId}`);
    assert.equal(meeting.status, 'active');
    assert.equal(meeting.isInstant, true);
    assert.ok(meeting.startedAt);
    assert.equal(meeting.endedAt, null);
    assert.equal(meeting.host._id, hostUser._id);
    assert.equal(meeting.host.password, undefined);
    assert.equal(meeting.participants.length, 1);
    assert.equal(meeting.participants[0].user._id, hostUser._id);
    assert.equal(meeting.participants[0].status, 'joined');

    instantMeetingId = meeting.meetingId;
  });

  it('creates scheduled meetings and generates distinct Meeting IDs', async () => {
    const farFuture = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    const soonWindow = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const res1 = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        title: 'Future Sprint Planning',
        isInstant: false,
        scheduledAt: farFuture,
      });

    assert.equal(res1.status, 201);
    assert.equal(res1.body.data.meeting.status, 'scheduled');
    assert.equal(res1.body.data.meeting.startedAt, null);
    scheduledMeetingId = res1.body.data.meeting.meetingId;

    const res2 = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        title: 'Soon Design Standup',
        isInstant: false,
        scheduledAt: soonWindow,
      });

    assert.equal(res2.status, 201);
    joinableScheduledMeetingId = res2.body.data.meeting.meetingId;

    const ids = new Set([instantMeetingId, scheduledMeetingId, joinableScheduledMeetingId]);
    assert.equal(ids.size, 3);
  });

  it('rejects invalid Meeting ID format and returns 404 for nonexistent Meeting ID', async () => {
    const badFormatRes = await request(app)
      .get('/api/meetings/bad-id')
      .set('Authorization', `Bearer ${hostToken}`);
    assert.equal(badFormatRes.status, 400);

    const notFoundRes = await request(app)
      .get('/api/meetings/zzz-zzzz-zzz')
      .set('Authorization', `Bearer ${hostToken}`);
    assert.equal(notFoundRes.status, 404);
  });

  it('enforces authorization on GET /api/meetings/:meetingId', async () => {
    const unauthUserRes = await request(app)
      .get(`/api/meetings/${instantMeetingId}`)
      .set('Authorization', `Bearer ${thirdToken}`);
    assert.equal(unauthUserRes.status, 403);

    const hostRes = await request(app)
      .get(`/api/meetings/${instantMeetingId}`)
      .set('Authorization', `Bearer ${hostToken}`);
    assert.equal(hostRes.status, 200);
    assert.equal(hostRes.body.data.meeting.meetingId, instantMeetingId);
  });

  it('handles joining meetings, scheduled join windows, duplicate joining, and participant limits', async () => {
    // Reject scheduled meeting too far in the future
    const earlyJoinRes = await request(app)
      .post(`/api/meetings/${scheduledMeetingId}/join`)
      .set('Authorization', `Bearer ${guestToken}`);
    assert.equal(earlyJoinRes.status, 400);
    assert.match(earlyJoinRes.body.message, /not yet open/i);

    // Join scheduled meeting within 15-minute window -> activates it
    const validScheduledJoin = await request(app)
      .post(`/api/meetings/${joinableScheduledMeetingId}/join`)
      .set('Authorization', `Bearer ${guestToken}`);
    assert.equal(validScheduledJoin.status, 200);
    assert.equal(validScheduledJoin.body.data.meeting.status, 'active');

    // Join active instant meeting (limit = 2, host is #1, guest becomes #2)
    const guestJoinRes = await request(app)
      .post(`/api/meetings/${instantMeetingId}/join`)
      .set('Authorization', `Bearer ${guestToken}`);
    assert.equal(guestJoinRes.status, 200);
    assert.equal(guestJoinRes.body.data.participant.alreadyJoined, false);
    assert.equal(guestJoinRes.body.data.participant.status, 'joined');

    // Duplicate join should be idempotent without duplicating participant entries
    const dupJoinRes = await request(app)
      .post(`/api/meetings/${instantMeetingId}/join`)
      .set('Authorization', `Bearer ${guestToken}`);
    assert.equal(dupJoinRes.status, 200);
    assert.equal(dupJoinRes.body.data.participant.alreadyJoined, true);
    assert.equal(dupJoinRes.body.data.meeting.participants.length, 2);

    // Third user should be blocked by participantLimit (2)
    const overLimitRes = await request(app)
      .post(`/api/meetings/${instantMeetingId}/join`)
      .set('Authorization', `Bearer ${thirdToken}`);
    assert.equal(overLimitRes.status, 403);
    assert.match(overLimitRes.body.message, /limit/i);
  });

  it('lists meetings with pagination, filtering, sorting, and user isolation', async () => {
    // Create an unrelated meeting owned by thirdUser
    await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${thirdToken}`)
      .send({ title: 'Third Private Meeting', isInstant: true });

    // Host lists page 1 with limit 2
    const page1Res = await request(app)
      .get('/api/meetings?page=1&limit=2&sortBy=createdAt&sortOrder=desc')
      .set('Authorization', `Bearer ${hostToken}`);

    assert.equal(page1Res.status, 200);
    assert.equal(page1Res.body.data.meetings.length, 2);
    assert.equal(page1Res.body.data.pagination.total, 3);
    assert.equal(page1Res.body.data.pagination.totalPages, 2);
    assert.equal(page1Res.body.data.pagination.hasNextPage, true);

    // Ensure none belong to thirdUser
    const titles = page1Res.body.data.meetings.map((m) => m.title);
    assert.equal(titles.includes('Third Private Meeting'), false);

    // Guest filters by joined meetings
    const joinedRes = await request(app)
      .get('/api/meetings?filter=joined&status=active')
      .set('Authorization', `Bearer ${guestToken}`);
    assert.equal(joinedRes.status, 200);
    assert.equal(joinedRes.body.data.meetings.length, 2);
  });

  it('handles leaving meetings safely without ending the meeting', async () => {
    // Non-participant cannot leave
    const nonParticipantLeave = await request(app)
      .post(`/api/meetings/${instantMeetingId}/leave`)
      .set('Authorization', `Bearer ${thirdToken}`);
    assert.equal(nonParticipantLeave.status, 400);

    // Guest leaves
    const leaveRes = await request(app)
      .post(`/api/meetings/${instantMeetingId}/leave`)
      .set('Authorization', `Bearer ${guestToken}`);
    assert.equal(leaveRes.status, 200);
    assert.equal(leaveRes.body.data.participant.status, 'left');
    assert.equal(leaveRes.body.data.status, 'active');

    // Duplicate leave is idempotent
    const dupLeaveRes = await request(app)
      .post(`/api/meetings/${instantMeetingId}/leave`)
      .set('Authorization', `Bearer ${guestToken}`);
    assert.equal(dupLeaveRes.status, 200);
    assert.equal(dupLeaveRes.body.data.participant.alreadyLeft, true);

    // Now a slot freed up, so thirdUser can join
    const thirdJoinRes = await request(app)
      .post(`/api/meetings/${instantMeetingId}/join`)
      .set('Authorization', `Bearer ${thirdToken}`);
    assert.equal(thirdJoinRes.status, 200);
  });

  it('updates meeting details (host-only) and rejects non-host or forbidden updates', async () => {
    const nonHostPatch = await request(app)
      .patch(`/api/meetings/${scheduledMeetingId}`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ title: 'Hijacked Title' });
    assert.equal(nonHostPatch.status, 403);

    const forbiddenPatch = await request(app)
      .patch(`/api/meetings/${scheduledMeetingId}`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ status: 'ended' });
    assert.equal(forbiddenPatch.status, 400);

    const validPatch = await request(app)
      .patch(`/api/meetings/${scheduledMeetingId}`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        title: 'Updated Sprint Planning',
        description: 'Updated agenda',
        settings: { waitingRoomEnabled: true, participantLimit: 25 },
      });
    assert.equal(validPatch.status, 200);
    assert.equal(validPatch.body.data.meeting.title, 'Updated Sprint Planning');
    assert.equal(validPatch.body.data.meeting.settings.waitingRoomEnabled, true);
    assert.equal(validPatch.body.data.meeting.settings.participantLimit, 25);
  });

  it('enforces host-only end meeting and blocks re-ending or joining ended meetings', async () => {
    const nonHostEnd = await request(app)
      .post(`/api/meetings/${instantMeetingId}/end`)
      .set('Authorization', `Bearer ${thirdToken}`);
    assert.equal(nonHostEnd.status, 403);

    const hostEnd = await request(app)
      .post(`/api/meetings/${instantMeetingId}/end`)
      .set('Authorization', `Bearer ${hostToken}`);
    assert.equal(hostEnd.status, 200);
    assert.equal(hostEnd.body.data.meeting.status, 'ended');
    assert.ok(hostEnd.body.data.meeting.endedAt);
    assert.ok(hostEnd.body.data.summary.durationSeconds >= 0);

    // Every participant is marked left
    for (const p of hostEnd.body.data.meeting.participants) {
      assert.equal(p.status, 'left');
      assert.ok(p.leftAt);
    }

    // Re-ending fails
    const reEnd = await request(app)
      .post(`/api/meetings/${instantMeetingId}/end`)
      .set('Authorization', `Bearer ${hostToken}`);
    assert.equal(reEnd.status, 400);

    // Joining ended meeting fails
    const joinEnded = await request(app)
      .post(`/api/meetings/${instantMeetingId}/join`)
      .set('Authorization', `Bearer ${guestToken}`);
    assert.equal(joinEnded.status, 400);
  });

  it('handles meeting cancellation and protects ended meeting history from deletion', async () => {
    // Cannot delete ended meeting history
    const deleteEnded = await request(app)
      .delete(`/api/meetings/${instantMeetingId}`)
      .set('Authorization', `Bearer ${hostToken}`);
    assert.equal(deleteEnded.status, 400);

    // Non-host cannot cancel scheduled meeting
    const nonHostCancel = await request(app)
      .delete(`/api/meetings/${scheduledMeetingId}`)
      .set('Authorization', `Bearer ${guestToken}`);
    assert.equal(nonHostCancel.status, 403);

    // Host cancels scheduled meeting
    const hostCancel = await request(app)
      .delete(`/api/meetings/${scheduledMeetingId}`)
      .set('Authorization', `Bearer ${hostToken}`);
    assert.equal(hostCancel.status, 200);
    assert.equal(hostCancel.body.data.meeting.status, 'cancelled');

    // Joining cancelled meeting is rejected
    const joinCancelled = await request(app)
      .post(`/api/meetings/${scheduledMeetingId}/join`)
      .set('Authorization', `Bearer ${guestToken}`);
    assert.equal(joinCancelled.status, 400);
  });

  it('returns meeting history with search, filtering, pagination, and duration', async () => {
    // Host has 2 history records: instantMeetingId (ended) & scheduledMeetingId (cancelled)
    const hostHistoryRes = await request(app)
      .get('/api/meetings/history?role=hosted&page=1&limit=10')
      .set('Authorization', `Bearer ${hostToken}`);

    assert.equal(hostHistoryRes.status, 200);
    assert.equal(hostHistoryRes.body.data.history.length, 2);

    // Search by title
    const searchRes = await request(app)
      .get('/api/meetings/history?search=Architecture')
      .set('Authorization', `Bearer ${hostToken}`);
    assert.equal(searchRes.status, 200);
    assert.equal(searchRes.body.data.history.length, 1);
    assert.equal(searchRes.body.data.history[0].meetingId, instantMeetingId);
    assert.equal(typeof searchRes.body.data.history[0].durationMinutes, 'number');
    assert.equal(searchRes.body.data.history[0].userParticipation.isHost, true);

    // Guest attended instantMeetingId
    const guestAttendedRes = await request(app)
      .get('/api/meetings/history?role=attended')
      .set('Authorization', `Bearer ${guestToken}`);
    assert.equal(guestAttendedRes.status, 200);
    assert.equal(guestAttendedRes.body.data.history.length, 1);
    assert.equal(guestAttendedRes.body.data.history[0].userParticipation.isHost, false);
  });
});

