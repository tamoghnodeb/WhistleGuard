const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';

/**
 * Middleware: Authenticate moderator via Bearer token
 */
function authenticateModerator(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Provide a Bearer token.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.moderator = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired. Please log in again.',
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid authentication token.',
    });
  }
}

/**
 * Middleware: Require admin role
 */
function requireAdmin(req, res, next) {
  if (!req.moderator || req.moderator.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required.',
    });
  }
  next();
}

/**
 * Generate JWT for authenticated moderator
 */
function generateToken(moderator) {
  return jwt.sign(
    {
      id: moderator.id,
      username: moderator.username,
      role: moderator.role,
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
}

module.exports = {
  authenticateModerator,
  requireAdmin,
  generateToken,
};
