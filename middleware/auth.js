const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'nursingquiz_cloud_secret';

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = header.startsWith('Bearer ') ? header.slice(7) : header;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.teacher = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = authMiddleware;
