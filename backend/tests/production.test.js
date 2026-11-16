import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { validateRequiredEnv } from '../src/config/env.js';

describe('MeetSpace Phase 9 Production Hardening & Health Tests', () => {
  let app;

  before(async () => {
    // Connect to test database or skip DB if already connected
    try {
      if (process.env.MONGODB_URI) {
        await connectDB();
      }
    } catch {
      // Ignore if already connected in test runner
    }
    app = createApp();
  });

  after(async () => {
    try {
      await disconnectDB();
    } catch {
      // Ignore
    }
  });

  it('Scenario 1: GET /api/health returns 200 and liveness data', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'healthy');
    assert.equal(res.body.data.service, 'meetspace-backend');
    assert.ok(typeof res.body.data.uptimeSeconds === 'number');
  });

  it('Scenario 2: GET /api/health/live returns HTTP 200 liveness probe', async () => {
    const res = await request(app).get('/api/health/live');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'live');
    assert.ok(res.body.timestamp);
  });

  it('Scenario 3: GET /api/health/ready returns readiness probe', async () => {
    const res = await request(app).get('/api/health/ready');
    assert.ok(res.status === 200 || res.status === 503);
    if (res.status === 200) {
      assert.equal(res.body.data.status, 'ready');
      assert.equal(res.body.data.database, 'connected');
    }
  });

  it('Scenario 4: Responses include X-Request-Id correlation header', async () => {
    const customId = 'test-client-correlation-id-12345';
    const res = await request(app)
      .get('/api/health')
      .set('X-Request-Id', customId);

    assert.equal(res.status, 200);
    assert.equal(res.headers['x-request-id'], customId);
  });

  it('Scenario 5: Helmet security headers are present on HTTP responses', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['cross-origin-resource-policy'], 'cross-origin');
    assert.ok(res.headers['content-security-policy']);
  });

  it('Scenario 6: Production env validation rejects MOCK_EGRESS=true in production', () => {
    const prevEnv = process.env.NODE_ENV;
    const prevMock = process.env.MOCK_EGRESS;

    try {
      process.env.NODE_ENV = 'production';
      process.env.MOCK_EGRESS = 'true';
      process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster.mongodb.net/prod';
      process.env.JWT_ACCESS_SECRET = 'a_very_strong_production_secret_key_exceeding_32_characters_1';
      process.env.JWT_REFRESH_SECRET = 'a_very_strong_production_secret_key_exceeding_32_characters_2';
      process.env.LIVEKIT_API_KEY = 'real_prod_key';
      process.env.LIVEKIT_API_SECRET = 'real_prod_secret_32_characters_minimum';
      process.env.LIVEKIT_URL = 'wss://livekit.meetspace.app';

      assert.throws(
        () => validateRequiredEnv(),
        /MOCK_EGRESS=true is strictly prohibited in production mode/
      );
    } finally {
      process.env.NODE_ENV = prevEnv;
      process.env.MOCK_EGRESS = prevMock;
    }
  });

  it('Scenario 7: Production env validation rejects weak or dev JWT secrets', () => {
    const prevEnv = process.env.NODE_ENV;
    const prevMock = process.env.MOCK_EGRESS;
    const prevSecret = process.env.JWT_ACCESS_SECRET;

    try {
      process.env.NODE_ENV = 'production';
      process.env.MOCK_EGRESS = 'false';
      process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster.mongodb.net/prod';
      process.env.JWT_ACCESS_SECRET = 'meetspace-dev-access-jwt-secret-phase4-2026'; // Known dev secret
      process.env.JWT_REFRESH_SECRET = 'a_very_strong_production_secret_key_exceeding_32_characters_2';

      assert.throws(
        () => validateRequiredEnv(),
        /Insecure JWT_ACCESS_SECRET in production/
      );
    } finally {
      process.env.NODE_ENV = prevEnv;
      process.env.MOCK_EGRESS = prevMock;
      process.env.JWT_ACCESS_SECRET = prevSecret;
    }
  });

  it('Scenario 8: Production env validation rejects default LiveKit credentials', () => {
    const prevEnv = process.env.NODE_ENV;
    const prevMock = process.env.MOCK_EGRESS;
    const prevKey = process.env.LIVEKIT_API_KEY;

    try {
      process.env.NODE_ENV = 'production';
      process.env.MOCK_EGRESS = 'false';
      process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster.mongodb.net/prod';
      process.env.JWT_ACCESS_SECRET = 'a_very_strong_production_secret_key_exceeding_32_characters_1';
      process.env.JWT_REFRESH_SECRET = 'a_very_strong_production_secret_key_exceeding_32_characters_2';
      process.env.LIVEKIT_API_KEY = 'devkey'; // Default devkey
      process.env.LIVEKIT_API_SECRET = 'secret';
      process.env.LIVEKIT_URL = 'ws://127.0.0.1:7880';

      assert.throws(
        () => validateRequiredEnv(),
        /Production requires a real LIVEKIT_API_KEY/
      );
    } finally {
      process.env.NODE_ENV = prevEnv;
      process.env.MOCK_EGRESS = prevMock;
      process.env.LIVEKIT_API_KEY = prevKey;
    }
  });
});
