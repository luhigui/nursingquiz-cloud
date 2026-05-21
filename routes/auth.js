const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get, run } = require('../lib/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'nursingquiz_cloud_secret';

router.post('/register', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const existing = get('SELECT id FROM teachers WHERE email = ?', [email]);
  if (existing) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
  }

  const password_hash = bcrypt.hashSync(password, 10);
  const result = run('INSERT INTO teachers (name, email, password_hash) VALUES (?, ?, ?)', [name, email, password_hash]);

  const token = jwt.sign({ id: result.lastInsertRowid, name, email }, JWT_SECRET, { expiresIn: '30d' });

  res.status(201).json({
    message: 'Registro exitoso',
    token,
    teacher: { id: result.lastInsertRowid, name, email }
  });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }

  const teacher = get('SELECT * FROM teachers WHERE email = ?', [email]);

  if (!teacher) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  }

  if (!bcrypt.compareSync(password, teacher.password_hash)) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  }

  const token = jwt.sign(
    { id: teacher.id, name: teacher.name, email: teacher.email },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({
    message: 'Inicio de sesión exitoso',
    token,
    teacher: { id: teacher.id, name: teacher.name, email: teacher.email }
  });
});

router.get('/me', authMiddleware, (req, res) => {
  const teacher = get('SELECT id, name, email, created_at FROM teachers WHERE id = ?', [req.teacher.id]);

  if (!teacher) {
    return res.status(404).json({ error: 'Docente no encontrado' });
  }

  res.json({ teacher });
});

module.exports = router;
