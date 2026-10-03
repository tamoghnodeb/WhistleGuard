const express = require('express');
const { body, param } = require('express-validator');
const db = require('../database');
const { generateCaseCode, CATEGORIES } = require('../utils');
const { validateRequest } = require('../middleware/validate');

const router = express.Router();

/**
 * @swagger
 * /api/reports:
 *   post:
 *     summary: Submit an anonymous report
 *     description: >
 *       Anyone can submit a report without creating an account or revealing their identity.
 *       A unique case code is returned for tracking the report status.
 *     tags: [Reports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, description]
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [security, harassment, corruption, technical, other]
 *                 description: Report category
 *               description:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 5000
 *                 description: Detailed description of the incident
 *               evidence_url:
 *                 type: string
 *                 format: uri
 *                 description: Optional URL to evidence or reference material
 *           example:
 *             category: harassment
 *             description: "I witnessed repeated verbal harassment in the 3rd floor meeting room during weekly standups. This has been ongoing for at least 3 weeks."
 *             evidence_url: "https://drive.google.com/evidence-file"
 *     responses:
 *       201:
 *         description: Report submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     case_code:
 *                       type: string
 *                       description: Unique code to track your report
 *                     status:
 *                       type: string
 *                     created_at:
 *                       type: string
 *             example:
 *               success: true
 *               message: "Report submitted successfully. Save your case code to track progress."
 *               data:
 *                 case_code: "WG-A1B2C3D4-E5F6G7H8"
 *                 status: "SUBMITTED"
 *                 created_at: "2024-01-15 10:30:00"
 *       400:
 *         description: Validation error
 */
router.post(
  '/',
  [
    body('category')
      .trim()
      .toLowerCase()
      .isIn(CATEGORIES)
      .withMessage(`Category must be one of: ${CATEGORIES.join(', ')}`),
    body('description')
      .trim()
      .isLength({ min: 10, max: 5000 })
      .withMessage('Description must be between 10 and 5000 characters'),
    body('evidence_url')
      .optional({ values: 'null' })
      .trim()
      .isURL({ require_protocol: true })
      .withMessage('Evidence URL must be a valid URL with protocol (http/https)'),
  ],
  validateRequest,
  (req, res) => {
    const { category, description, evidence_url } = req.body;

    // Generate unique case code with collision check
    let caseCode;
    let attempts = 0;
    do {
      caseCode = generateCaseCode();
      attempts++;
      if (attempts > 10) {
        return res.status(500).json({
          success: false,
          error: 'Failed to generate unique case code. Please try again.',
        });
      }
    } while (
      db.prepare('SELECT 1 FROM reports WHERE case_code = ?').get(caseCode)
    );

    const stmt = db.prepare(`
      INSERT INTO reports (case_code, category, description, evidence_url)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(caseCode, category, description, evidence_url || null);

    const report = db
      .prepare('SELECT case_code, status, created_at FROM reports WHERE id = ?')
      .get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      message:
        'Report submitted successfully. Save your case code to track progress.',
      data: report,
    });
  }
);

/**
 * @swagger
 * /api/reports/{caseCode}:
 *   get:
 *     summary: Track report status by case code
 *     description: >
 *       Reporters can check the status of their report using the unique case code
 *       received at submission. No identity verification is required.
 *     tags: [Reports]
 *     parameters:
 *       - in: path
 *         name: caseCode
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique case code (e.g., WG-A1B2C3D4-E5F6G7H8)
 *     responses:
 *       200:
 *         description: Report status retrieved
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 case_code: "WG-A1B2C3D4-E5F6G7H8"
 *                 category: "harassment"
 *                 status: "UNDER_REVIEW"
 *                 created_at: "2024-01-15 10:30:00"
 *                 updated_at: "2024-01-16 14:00:00"
 *                 updates:
 *                   - status: "UNDER_REVIEW"
 *                     message: "Your report is being investigated by the team."
 *                     timestamp: "2024-01-16 14:00:00"
 *       404:
 *         description: Report not found
 */
router.get(
  '/:caseCode',
  [
    param('caseCode')
      .trim()
      .matches(/^WG-[A-F0-9]{8}-[A-F0-9]{8}$/)
      .withMessage('Invalid case code format. Expected format: WG-XXXXXXXX-XXXXXXXX'),
  ],
  validateRequest,
  (req, res) => {
    const { caseCode } = req.params;

    const report = db
      .prepare(
        'SELECT case_code, category, status, is_closed, created_at, updated_at FROM reports WHERE case_code = ?'
      )
      .get(caseCode);

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'No report found with the provided case code.',
      });
    }

    // Fetch status updates for this report (visible to reporter)
    const reportId = db
      .prepare('SELECT id FROM reports WHERE case_code = ?')
      .get(caseCode).id;

    const updates = db
      .prepare(
        `SELECT new_status as status, message, created_at as timestamp 
         FROM status_updates 
         WHERE report_id = ? 
         ORDER BY created_at ASC`
      )
      .all(reportId);

    res.json({
      success: true,
      data: {
        case_code: report.case_code,
        category: report.category,
        status: report.status,
        is_closed: Boolean(report.is_closed),
        created_at: report.created_at,
        updated_at: report.updated_at,
        updates,
      },
    });
  }
);

module.exports = router;
