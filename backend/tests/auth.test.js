import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request from 'supertest';

// Configure test environment variables before importing app modules
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-only-access-secret-key-meetspace-phase1';
process.env.JWT_REFRESH_SECRET = 'test-only-refresh-secret-key-meetspace-phase1';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.FRONTEND_URL = 'http://localhost:5173';

import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.model.js';
import { hashToken } from '../src/utils/token.utils.js';

const MONGOD_BIN = 'C:\\Program Files\\MongoDB\\Server\\8.3\\bin\\mongod.exe';
const TEST_DB_PORT = 27019;
const TEST_DB_DIR = path.resolve(
  'C:\\Users\\Guna sekhar\\.gemini\\antigravity\\brain\\83ff393e-9c3d-40bb-8f10-dd87e449b826\\scratch\\mongo-test-db'
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

function extractRefreshCookie(setCookieHeaders = []) {
  const cookieHeader = setCookieHeaders.find((c) => c.startsWith('refreshToken='));
  assert.ok(cookieHeader, 'Expected refreshToken Set-Cookie header');
  const pair = cookieHeader.split(';')[0];
  return {
    headerString: cookieHeader,
    cookiePair: pair,
    value: decodeURIComponent(pair.split('=')[1]),
  };
}

describe('MeetSpace Auth API Integration Tests', () => {
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
      if (msg) console.error('[mongod stderr]', msg);
    });

    await waitForPort(TEST_DB_PORT);
    process.env.MONGODB_URI = `mongodb://127.0.0.1:${TEST_DB_PORT}/meetspace_test`;

    await connectDB(process.env.MONGODB_URI);
    await User.deleteMany({});
    app = createApp();
  });

  after(async () => {
    try {
      await User.deleteMany({});
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

  const testUser = {
    name: 'Alex Morgan',
    email: 'Alex.Morgan@Example.com',
    password: 'Password123',
  };

  let accessToken = '';
  let refreshCookiePair = '';
  let refreshTokenValue = '';

  it('GET /api/health returns healthy status', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.service, 'meetspace-backend');
  });

  it('POST /api/auth/register validates invalid request payloads', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'A',
      email: 'not-an-email',
      password: 'weak',
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Validation failed.');
    assert.ok(Array.isArray(res.body.errors));
    assert.ok(res.body.errors.length >= 3);
  });

  it('POST /api/auth/register creates user, normalizes email, hashes password, and omits sensitive fields', async () => {
    const res = await request(app).post('/api/auth/register').send(testUser);

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.message, 'User registered successfully.');
    assert.equal(res.body.data.user.name, 'Alex Morgan');
    assert.equal(res.body.data.user.email, 'alex.morgan@example.com');
    assert.equal(res.body.data.user.role, 'user');
    assert.equal(res.body.data.user.isEmailVerified, false);
    assert.equal(res.body.data.user.password, undefined);
    assert.equal(res.body.data.user.refreshTokenHash, undefined);

    const dbUser = await User.findOne({ email: 'alex.morgan@example.com' }).select(
      '+password +refreshTokenHash'
    );
    assert.ok(dbUser, 'User should exist in MongoDB');
    assert.notEqual(dbUser.password, testUser.password);
    assert.ok(dbUser.password.startsWith('$2'));
    const matches = await bcrypt.compare(testUser.password, dbUser.password);
    assert.equal(matches, true);
  });

  it('POST /api/auth/register rejects duplicate email (case-insensitive)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Another Alex',
      email: 'ALEX.MORGAN@example.com',
      password: 'Password123',
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /already exists/i);
  });

  it('POST /api/auth/login rejects incorrect password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'alex.morgan@example.com',
      password: 'WrongPassword123',
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Invalid email or password.');
  });

  it('POST /api/auth/login succeeds, returns accessToken, sets HttpOnly cookie, and stores hashed refresh token', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'alex.morgan@example.com',
      password: testUser.password,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.accessToken);
    assert.equal(res.body.data.user.email, 'alex.morgan@example.com');
    assert.equal(res.body.data.user.password, undefined);

    accessToken = res.body.data.accessToken;
    const parsedCookie = extractRefreshCookie(res.headers['set-cookie']);
    refreshCookiePair = parsedCookie.cookiePair;
    refreshTokenValue = parsedCookie.value;

    assert.match(parsedCookie.headerString, /HttpOnly/i);

    const dbUser = await User.findOne({ email: 'alex.morgan@example.com' }).select(
      '+refreshTokenHash'
    );
    assert.ok(dbUser.refreshTokenHash);
    assert.notEqual(dbUser.refreshTokenHash, refreshTokenValue);
    assert.equal(dbUser.refreshTokenHash, hashToken(refreshTokenValue));
  });

  it('GET /api/auth/me authenticates valid Bearer access token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user.email, 'alex.morgan@example.com');
    assert.equal(res.body.data.user.password, undefined);
  });

  it('GET /api/auth/me rejects missing or invalid Bearer token', async () => {
    const missingRes = await request(app).get('/api/auth/me');
    assert.equal(missingRes.status, 401);
    assert.equal(missingRes.body.success, false);

    const invalidRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.jwt.token');
    assert.equal(invalidRes.status, 401);
    assert.equal(invalidRes.body.success, false);
  });

  it('GET /api/auth/me rejects expired access token', async () => {
    const dbUser = await User.findOne({ email: 'alex.morgan@example.com' });
    const expiredToken = jwt.sign(
      { sub: String(dbUser._id), role: dbUser.role, type: 'access' },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: -10 }
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Token has expired.');
  });

  it('POST /api/auth/refresh rotates refresh token, updates DB hash, and blocks reuse of previous refresh token', async () => {
    const oldCookiePair = refreshCookiePair;
    const oldTokenValue = refreshTokenValue;

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', oldCookiePair);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.accessToken);

    const nextCookie = extractRefreshCookie(res.headers['set-cookie']);
    assert.notEqual(nextCookie.value, oldTokenValue);

    refreshCookiePair = nextCookie.cookiePair;
    refreshTokenValue = nextCookie.value;
    accessToken = res.body.data.accessToken;

    const dbUser = await User.findOne({ email: 'alex.morgan@example.com' }).select(
      '+refreshTokenHash'
    );
    assert.equal(dbUser.refreshTokenHash, hashToken(refreshTokenValue));

    // Replaying the old refresh token should fail with 401 and revoke the active session
    const replayRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', oldCookiePair);

    assert.equal(replayRes.status, 401);
    assert.equal(replayRes.body.success, false);

    // Re-login to obtain a fresh active session for logout test
    const reloginRes = await request(app).post('/api/auth/login').send({
      email: 'alex.morgan@example.com',
      password: testUser.password,
    });
    assert.equal(reloginRes.status, 200);
    refreshCookiePair = extractRefreshCookie(reloginRes.headers['set-cookie']).cookiePair;
  });

  it('POST /api/auth/logout invalidates refresh token storage, clears cookie, and blocks subsequent refresh', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', refreshCookiePair);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.message, 'Logged out successfully.');

    const setCookies = res.headers['set-cookie'] || [];
    const clearedCookie = setCookies.find((c) => c.startsWith('refreshToken='));
    assert.ok(clearedCookie, 'Expected refreshToken cookie to be cleared');
    assert.match(clearedCookie, /refreshToken=;/);

    const dbUser = await User.findOne({ email: 'alex.morgan@example.com' }).select(
      '+refreshTokenHash'
    );
    assert.equal(dbUser.refreshTokenHash, null);

    const refreshAfterLogout = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookiePair);
    assert.equal(refreshAfterLogout.status, 401);
    assert.equal(refreshAfterLogout.body.success, false);
  });

  it('returns consistent 404 error response for unknown endpoints', async () => {
    const res = await request(app).get('/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Route not found/);
  });
});
