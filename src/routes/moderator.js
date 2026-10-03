const express = require('express');
const { body, param, query } = require('express-validator');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { isValidTransition, VALID_TRANSITIONS, CATEGORIES, STATUSES } = require('../utils');
const { authenticateModerator, requireAdmin, generateToken } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');

const router = express.Router();

// ─────────────────────────────────────────────────────────
// AUTHENTICATION
// ─────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/moderator/login:
 *   post:
 *     summary: Moderator login
 *     description: Authenticate as a moderator and receive a JWT token.
 *     tags: [Moderator]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *           example:
 *             username: admin
 *             password: admin123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Login successful"
 *               data:
 *                 token: "eyJhbGciOiJIUz..."
 *                 moderator:
 *                   id: 1
 *                   username: "admin"
 *                   role: "admin"
 *       401:
 *         description: Invalid credentials
 */
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validateRequest,
  (req, res) => {
    const { username, password } = req.body;

    const moderator = db
      .prepare('SELECT * FROM moderators WHERE username = ? AND is_active = 1')
      .get(username);

    if (!moderator || !bcrypt.compareSync(password, moderator.password_hash)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials.',
      });
    }

    const token = generateToken(moderator);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        moderator: {
          id: moderator.id,
          username: moderator.username,
          role: moderator.role,
        },
      },
    });
  }
);

// ─────────────────────────────────────────────────────────
// PROTECTED ROUTES (Require authentication)
// ─────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/moderator/reports:
 *   get:
 *     summary: View all reports (with filters)
 *     description: >
 *       Moderators can view all submitted reports with optional filtering by category and status.
 *       Reports never expose reporter identity.
 *     tags: [Moderator]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [security, harassment, corruption, technical, other]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [SUBMITTED, UNDER_REVIEW, RESOLVED, DISMISSED, CLOSED]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, oldest]
 *           default: newest
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in report descriptions
 *     responses:
 *       200:
 *         description: List of reports
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/reports',
  authenticateModerator,
  [
    query('category')
      .optional()
      .isIn(CATEGORIES)
      .withMessage(`Category must be one of: ${CATEGORIES.join(', ')}`),
    query('status')
      .optional()
      .isIn(STATUSES)
      .withMessage(`Status must be one of: ${STATUSES.join(', ')}`),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('sort')
      .optional()
      .isIn(['newest', 'oldest'])
      .withMessage('Sort must be "newest" or "oldest"'),
    query('search')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Search query must be between 1 and 200 characters'),
  ],
  validateRequest,
  (req, res) => {
    const {
      category,
      status,
      page = 1,
      limit = 20,
      sort = 'newest',
      search,
    } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (category) {
      whereClause += ' AND category = ?';
      params.push(category);
    }

    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    if (search) {
      whereClause += ' AND description LIKE ?';
      params.push(`%${search}%`);
    }

    const sortOrder = sort === 'oldest' ? 'ASC' : 'DESC';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Get total count
    const countRow = db
      .prepare(`SELECT COUNT(*) as total FROM reports ${whereClause}`)
      .get(...params);

    // Get paginated results (no IP, no identity fields)
    const reports = db
      .prepare(
        `SELECT id, case_code, category, description, evidence_url, status, is_closed, created_at, updated_at 
         FROM reports ${whereClause} 
         ORDER BY created_at ${sortOrder} 
         LIMIT ? OFFSET ?`
      )
      .all(...params, parseInt(limit), offset);

    res.json({
      success: true,
      data: {
        reports,
        pagination: {
          total: countRow.total,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(countRow.total / parseInt(limit)),
        },
      },
    });
  }
);

/**
 * @swagger
 * /api/moderator/reports/{reportId}:
 *   get:
 *     summary: View a single report with its status history
 *     tags: [Moderator]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Report details with status history
 *       404:
 *         description: Report not found
 */
router.get(
  '/reports/:reportId',
  authenticateModerator,
  [
    param('reportId')
      .isInt({ min: 1 })
      .withMessage('Report ID must be a positive integer'),
  ],
  validateRequest,
  (req, res) => {
    const { reportId } = req.params;

    const report = db
      .prepare(
        `SELECT id, case_code, category, description, evidence_url, status, is_closed, created_at, updated_at
         FROM reports WHERE id = ?`
      )
      .get(reportId);

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found.',
      });
    }

    const statusHistory = db
      .prepare(
        `SELECT old_status, new_status, message, created_at as timestamp
         FROM status_updates WHERE report_id = ? ORDER BY created_at ASC`
      )
      .all(reportId);

    res.json({
      success: true,
      data: {
        ...report,
        is_closed: Boolean(report.is_closed),
        status_history: statusHistory,
      },
    });
  }
);

/**
 * @swagger
 * /api/moderator/reports/{reportId}/status:
 *   patch:
 *     summary: Update report status
 *     description: >
 *       Update the status of a report following the workflow:
 *       SUBMITTED → UNDER_REVIEW → RESOLVED/DISMISSED → CLOSED
 *     tags: [Moderator]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [UNDER_REVIEW, RESOLVED, DISMISSED, CLOSED]
 *               message:
 *                 type: string
 *                 maxLength: 1000
 *                 description: Optional status update message visible to the reporter
 *           example:
 *             status: UNDER_REVIEW
 *             message: "Your report is being reviewed by our investigation team."
 *     responses:
 *       200:
 *         description: Status updated successfully
 *       400:
 *         description: Invalid status transition
 *       404:
 *         description: Report not found
 */
router.patch(
  '/reports/:reportId/status',
  authenticateModerator,
  [
    param('reportId')
      .isInt({ min: 1 })
      .withMessage('Report ID must be a positive integer'),
    body('status')
      .trim()
      .toUpperCase()
      .isIn(STATUSES)
      .withMessage(`Status must be one of: ${STATUSES.join(', ')}`),
    body('message')
      .optional()
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Status message must be between 1 and 1000 characters'),
  ],
  validateRequest,
  (req, res) => {
    const { reportId } = req.params;
    const { status: newStatus, message } = req.body;

    const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found.',
      });
    }

    if (report.is_closed) {
      return res.status(400).json({
        success: false,
        error: 'This case has been permanently closed and cannot be modified.',
      });
    }

    if (!isValidTransition(report.status, newStatus)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status transition from "${report.status}" to "${newStatus}".`,
        allowed_transitions: VALID_TRANSITIONS[report.status] || [],
      });
    }

    const isClosed = newStatus === 'CLOSED' ? 1 : 0;

    // Use transaction for atomicity
    const updateTransaction = db.transaction(() => {
      db.prepare(
        `UPDATE reports SET status = ?, is_closed = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(newStatus, isClosed, reportId);

      db.prepare(
        `INSERT INTO status_updates (report_id, old_status, new_status, message)
         VALUES (?, ?, ?, ?)`
      ).run(reportId, report.status, newStatus, message || null);
    });

    updateTransaction();

    const updated = db
      .prepare(
        `SELECT id, case_code, category, status, is_closed, updated_at FROM reports WHERE id = ?`
      )
      .get(reportId);

    res.json({
      success: true,
      message: `Report status updated to "${newStatus}".`,
      data: {
        ...updated,
        is_closed: Boolean(updated.is_closed),
      },
    });
  }
);

// ─────────────────────────────────────────────────────────
// ADMIN-ONLY ROUTES
// ─────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/moderator/register:
 *   post:
 *     summary: Register a new moderator (admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 6
 *               role:
 *                 type: string
 *                 enum: [moderator, admin]
 *                 default: moderator
 *     responses:
 *       201:
 *         description: Moderator created
 *       409:
 *         description: Username already exists
 */
router.post(
  '/register',
  authenticateModerator,
  requireAdmin,
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be 3-50 characters')
      .isAlphanumeric()
      .withMessage('Username must be alphanumeric'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    body('role')
      .optional()
      .isIn(['moderator', 'admin'])
      .withMessage('Role must be "moderator" or "admin"'),
  ],
  validateRequest,
  (req, res) => {
    const { username, password, role = 'moderator' } = req.body;

    const existing = db
      .prepare('SELECT 1 FROM moderators WHERE username = ?')
      .get(username);

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Username already exists.',
      });
    }

    const hash = bcrypt.hashSync(password, 12);
    const result = db
      .prepare('INSERT INTO moderators (username, password_hash, role) VALUES (?, ?, ?)')
      .run(username, hash, role);

    res.status(201).json({
      success: true,
      message: 'Moderator registered successfully.',
      data: {
        id: result.lastInsertRowid,
        username,
        role,
      },
    });
  }
);

/**
 * @swagger
 * /api/moderator/stats:
 *   get:
 *     summary: Dashboard statistics
 *     description: Get an overview of report statistics for the moderator dashboard.
 *     tags: [Moderator]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics
 */
router.get('/stats', authenticateModerator, (req, res) => {
  const totalReports = db.prepare('SELECT COUNT(*) as count FROM reports').get();

  const byStatus = db
    .prepare(
      'SELECT status, COUNT(*) as count FROM reports GROUP BY status ORDER BY count DESC'
    )
    .all();

  const byCategory = db
    .prepare(
      'SELECT category, COUNT(*) as count FROM reports GROUP BY category ORDER BY count DESC'
    )
    .all();

  const recentReports = db
    .prepare(
      `SELECT id, case_code, category, status, created_at 
       FROM reports ORDER BY created_at DESC LIMIT 5`
    )
    .all();

  res.json({
    success: true,
    data: {
      total_reports: totalReports.count,
      by_status: byStatus,
      by_category: byCategory,
      recent_reports: recentReports,
    },
  });
});

module.exports = router;
