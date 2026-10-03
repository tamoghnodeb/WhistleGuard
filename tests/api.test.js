require('dotenv').config();

// Use in-memory database for tests
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.DEFAULT_MODERATOR_USERNAME = 'testadmin';
process.env.DEFAULT_MODERATOR_PASSWORD = 'testpass123';

const request = require('supertest');
const app = require('../src/app');

let moderatorToken;
let testCaseCode;

// ─────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────
describe('Health Check', () => {
  test('GET /api/health → returns 200 with status info', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('running');
  });
});

// ─────────────────────────────────────────────────────────
// MODERATOR AUTH
// ─────────────────────────────────────────────────────────
describe('Moderator Authentication', () => {
  test('POST /api/moderator/login → success with valid credentials', async () => {
    const res = await request(app)
      .post('/api/moderator/login')
      .send({ username: 'testadmin', password: 'testpass123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.moderator.username).toBe('testadmin');
    moderatorToken = res.body.data.token;
  });

  test('POST /api/moderator/login → 401 with wrong password', async () => {
    const res = await request(app)
      .post('/api/moderator/login')
      .send({ username: 'testadmin', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('POST /api/moderator/login → 400 with missing fields', async () => {
    const res = await request(app)
      .post('/api/moderator/login')
      .send({ username: '' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// ANONYMOUS REPORT SUBMISSION
// ─────────────────────────────────────────────────────────
describe('Anonymous Report Submission', () => {
  test('POST /api/reports → 201 with valid report', async () => {
    const res = await request(app).post('/api/reports').send({
      category: 'harassment',
      description:
        'Witnessed repeated verbal abuse in the east wing break room over the past two weeks.',
      evidence_url: 'https://drive.google.com/some-evidence',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.case_code).toMatch(/^WG-[A-F0-9]{8}-[A-F0-9]{8}$/);
    expect(res.body.data.status).toBe('SUBMITTED');
    testCaseCode = res.body.data.case_code;
  });

  test('POST /api/reports → 201 without evidence_url (optional field)', async () => {
    const res = await request(app).post('/api/reports').send({
      category: 'corruption',
      description:
        'Suspected financial irregularities in procurement department budgets.',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.case_code).toBeDefined();
  });

  test('POST /api/reports → 400 with invalid category', async () => {
    const res = await request(app).post('/api/reports').send({
      category: 'invalid_category',
      description: 'This should fail validation.',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('POST /api/reports → 400 with short description', async () => {
    const res = await request(app).post('/api/reports').send({
      category: 'security',
      description: 'Short',
    });

    expect(res.status).toBe(400);
  });

  test('POST /api/reports → 400 with missing description', async () => {
    const res = await request(app).post('/api/reports').send({
      category: 'security',
    });

    expect(res.status).toBe(400);
  });

  test('POST /api/reports → 400 with invalid URL', async () => {
    const res = await request(app).post('/api/reports').send({
      category: 'technical',
      description: 'A valid description that is long enough to pass.',
      evidence_url: 'not-a-valid-url',
    });

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────
// CASE TRACKING
// ─────────────────────────────────────────────────────────
describe('Case Tracking', () => {
  test('GET /api/reports/:caseCode → 200 with valid case code', async () => {
    const res = await request(app).get(`/api/reports/${testCaseCode}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.case_code).toBe(testCaseCode);
    expect(res.body.data.category).toBe('harassment');
    expect(res.body.data.status).toBe('SUBMITTED');
    expect(res.body.data.updates).toEqual([]);
  });

  test('GET /api/reports/:caseCode → 404 with non-existent case code', async () => {
    const res = await request(app).get('/api/reports/WG-00000000-00000000');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('GET /api/reports/:caseCode → 400 with invalid format', async () => {
    const res = await request(app).get('/api/reports/INVALID-CODE');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// MODERATOR REPORT MANAGEMENT
// ─────────────────────────────────────────────────────────
describe('Moderator Report Management', () => {
  test('GET /api/moderator/reports → 401 without token', async () => {
    const res = await request(app).get('/api/moderator/reports');
    expect(res.status).toBe(401);
  });

  test('GET /api/moderator/reports → 200 with token', async () => {
    const res = await request(app)
      .get('/api/moderator/reports')
      .set('Authorization', `Bearer ${moderatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.reports).toBeInstanceOf(Array);
    expect(res.body.data.reports.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.pagination).toBeDefined();
  });

  test('GET /api/moderator/reports?category=harassment → filters by category', async () => {
    const res = await request(app)
      .get('/api/moderator/reports?category=harassment')
      .set('Authorization', `Bearer ${moderatorToken}`);

    expect(res.status).toBe(200);
    res.body.data.reports.forEach((r) => {
      expect(r.category).toBe('harassment');
    });
  });

  test('GET /api/moderator/reports?status=SUBMITTED → filters by status', async () => {
    const res = await request(app)
      .get('/api/moderator/reports?status=SUBMITTED')
      .set('Authorization', `Bearer ${moderatorToken}`);

    expect(res.status).toBe(200);
    res.body.data.reports.forEach((r) => {
      expect(r.status).toBe('SUBMITTED');
    });
  });

  test('GET /api/moderator/reports?search=verbal → searches descriptions', async () => {
    const res = await request(app)
      .get('/api/moderator/reports?search=verbal')
      .set('Authorization', `Bearer ${moderatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.reports.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/moderator/reports/1 → view single report', async () => {
    const res = await request(app)
      .get('/api/moderator/reports/1')
      .set('Authorization', `Bearer ${moderatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(1);
    expect(res.body.data.status_history).toBeDefined();
  });

  test('GET /api/moderator/reports/9999 → 404 for non-existent', async () => {
    const res = await request(app)
      .get('/api/moderator/reports/9999')
      .set('Authorization', `Bearer ${moderatorToken}`);

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────
// STATUS TRANSITIONS
// ─────────────────────────────────────────────────────────
describe('Status Transitions', () => {
  test('PATCH → SUBMITTED to UNDER_REVIEW (valid)', async () => {
    const res = await request(app)
      .patch('/api/moderator/reports/1/status')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({
        status: 'UNDER_REVIEW',
        message: 'Your report is being investigated by our team.',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('UNDER_REVIEW');
  });

  test('Reporter sees status update via case code', async () => {
    const res = await request(app).get(`/api/reports/${testCaseCode}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('UNDER_REVIEW');
    expect(res.body.data.updates.length).toBe(1);
    expect(res.body.data.updates[0].message).toContain('investigated');
  });

  test('PATCH → UNDER_REVIEW to RESOLVED (valid)', async () => {
    const res = await request(app)
      .patch('/api/moderator/reports/1/status')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({
        status: 'RESOLVED',
        message: 'Investigation complete. Appropriate action has been taken.',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('RESOLVED');
  });

  test('PATCH → RESOLVED to CLOSED (permanent close)', async () => {
    const res = await request(app)
      .patch('/api/moderator/reports/1/status')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({
        status: 'CLOSED',
        message: 'Case permanently closed.',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CLOSED');
    expect(res.body.data.is_closed).toBe(true);
  });

  test('PATCH → CLOSED cannot be modified further', async () => {
    const res = await request(app)
      .patch('/api/moderator/reports/1/status')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ status: 'UNDER_REVIEW' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('permanently closed');
  });

  test('PATCH → SUBMITTED to RESOLVED (invalid transition)', async () => {
    const res = await request(app)
      .patch('/api/moderator/reports/2/status')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ status: 'RESOLVED' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid status transition');
    expect(res.body.allowed_transitions).toContain('UNDER_REVIEW');
  });
});

// ─────────────────────────────────────────────────────────
// MODERATOR REGISTRATION (ADMIN ONLY)
// ─────────────────────────────────────────────────────────
describe('Moderator Registration', () => {
  test('POST /api/moderator/register → 201 as admin', async () => {
    const res = await request(app)
      .post('/api/moderator/register')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({
        username: 'moderator1',
        password: 'pass123456',
        role: 'moderator',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.username).toBe('moderator1');
    expect(res.body.data.role).toBe('moderator');
  });

  test('POST /api/moderator/register → 409 duplicate username', async () => {
    const res = await request(app)
      .post('/api/moderator/register')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({
        username: 'moderator1',
        password: 'pass123456',
      });

    expect(res.status).toBe(409);
  });

  test('POST /api/moderator/register → 403 as non-admin', async () => {
    // Login as the non-admin moderator
    const loginRes = await request(app)
      .post('/api/moderator/login')
      .send({ username: 'moderator1', password: 'pass123456' });

    const modToken = loginRes.body.data.token;

    const res = await request(app)
      .post('/api/moderator/register')
      .set('Authorization', `Bearer ${modToken}`)
      .send({
        username: 'moderator2',
        password: 'pass123456',
      });

    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────
// DASHBOARD STATS
// ─────────────────────────────────────────────────────────
describe('Dashboard Stats', () => {
  test('GET /api/moderator/stats → returns statistics', async () => {
    const res = await request(app)
      .get('/api/moderator/stats')
      .set('Authorization', `Bearer ${moderatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total_reports).toBeGreaterThanOrEqual(2);
    expect(res.body.data.by_status).toBeInstanceOf(Array);
    expect(res.body.data.by_category).toBeInstanceOf(Array);
    expect(res.body.data.recent_reports).toBeInstanceOf(Array);
  });
});

// ─────────────────────────────────────────────────────────
// ERROR HANDLING
// ─────────────────────────────────────────────────────────
describe('Error Handling', () => {
  test('Unknown route → 404', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('Invalid JSON body → 400', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Content-Type', 'application/json')
      .send(Buffer.from('{invalid}'));

    // Express 5 may return 400 (parse error) or 400 (validation error)
    expect(res.status).toBe(400);
  });

  test('Expired/invalid token → 401', async () => {
    const res = await request(app)
      .get('/api/moderator/reports')
      .set('Authorization', 'Bearer invalid.token.here');

    expect(res.status).toBe(401);
  });

  test('No auth header → 401', async () => {
    const res = await request(app).get('/api/moderator/reports');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Authentication required');
  });
});

// ─────────────────────────────────────────────────────────
// PRIVACY VERIFICATION
// ─────────────────────────────────────────────────────────
describe('Privacy & Anonymity', () => {
  test('Reporter tracking response contains no identity info', async () => {
    const res = await request(app).get(`/api/reports/${testCaseCode}`);

    expect(res.status).toBe(200);

    // Check that response keys don't contain identity-related fields
    const allKeys = JSON.stringify(Object.keys(res.body.data));
    expect(allKeys).not.toContain('email');
    expect(allKeys).not.toContain('user_id');
    expect(allKeys).not.toContain('reporter');
    expect(allKeys).not.toContain('name');
    expect(allKeys).not.toContain('ip_address');
  });

  test('Moderator report view contains no identity info', async () => {
    const res = await request(app)
      .get('/api/moderator/reports/1')
      .set('Authorization', `Bearer ${moderatorToken}`);

    expect(res.status).toBe(200);

    // Check that response keys don't contain identity-related fields
    const allKeys = JSON.stringify(Object.keys(res.body.data));
    expect(allKeys).not.toContain('email');
    expect(allKeys).not.toContain('user_id');
    expect(allKeys).not.toContain('reporter');
    expect(allKeys).not.toContain('ip_address');
  });
});
