const express = require('express');
const crypto = require('crypto');
const { get, run, all } = require('../lib/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

function generateShareCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
}

function generateUniqueShareCode() {
  let code;
  do {
    code = generateShareCode();
  } while (get('SELECT id FROM question_banks WHERE share_code = ?', [code]));
  return code;
}

router.use(authMiddleware);

router.get('/', (req, res) => {
  const banks = all(
    'SELECT id, title, description, share_code, created_at, updated_at FROM question_banks WHERE teacher_id = ? ORDER BY updated_at DESC',
    [req.teacher.id]
  );

  const banksWithCount = banks.map(bank => {
    const count = get('SELECT COUNT(*) as count FROM questions WHERE bank_id = ?', [bank.id]);
    return { ...bank, question_count: count.count };
  });

  res.json({ banks: banksWithCount });
});

router.get('/:id', (req, res) => {
  const bank = get(
    'SELECT id, teacher_id, title, description, share_code, created_at, updated_at FROM question_banks WHERE id = ? AND teacher_id = ?',
    [req.params.id, req.teacher.id]
  );

  if (!bank) {
    return res.status(404).json({ error: 'Banco no encontrado' });
  }

  const questions = all('SELECT * FROM questions WHERE bank_id = ? ORDER BY id', [bank.id]);

  res.json({
    bank,
    questions: questions.map(q => ({ ...q, options: JSON.parse(q.options) }))
  });
});

router.post('/', (req, res) => {
  const { title, description } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'El título es requerido' });
  }

  const share_code = generateUniqueShareCode();

  const result = run(
    'INSERT INTO question_banks (teacher_id, title, description, share_code) VALUES (?, ?, ?, ?)',
    [req.teacher.id, title.trim(), (description || '').trim(), share_code]
  );

  const bank = get(
    'SELECT id, title, description, share_code, created_at FROM question_banks WHERE id = ?',
    [result.lastInsertRowid]
  );

  res.status(201).json({ bank });
});

router.put('/:id', (req, res) => {
  const { title, description } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'El título es requerido' });
  }

  const bank = get('SELECT id FROM question_banks WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacher.id]);

  if (!bank) {
    return res.status(404).json({ error: 'Banco no encontrado' });
  }

  run(
    "UPDATE question_banks SET title = ?, description = ?, updated_at = datetime('now') WHERE id = ?",
    [title.trim(), (description || '').trim(), req.params.id]
  );

  const updated = get(
    'SELECT id, title, description, share_code, created_at, updated_at FROM question_banks WHERE id = ?',
    [req.params.id]
  );

  res.json({ bank: updated });
});

router.delete('/:id', (req, res) => {
  const bank = get('SELECT id FROM question_banks WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacher.id]);

  if (!bank) {
    return res.status(404).json({ error: 'Banco no encontrado' });
  }

  run('DELETE FROM questions WHERE bank_id = ?', [req.params.id]);
  run('DELETE FROM question_banks WHERE id = ?', [req.params.id]);

  res.json({ message: 'Banco eliminado' });
});

router.post('/:id/questions', (req, res) => {
  const { question, options, correct, explanation } = req.body;

  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'La pregunta es requerida' });
  }

  if (!options || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'Se requieren al menos 2 opciones' });
  }

  if (correct === undefined || correct === null || correct < 0 || correct >= options.length) {
    return res.status(400).json({ error: 'Índice de respuesta correcta inválido' });
  }

  const bank = get('SELECT id FROM question_banks WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacher.id]);

  if (!bank) {
    return res.status(404).json({ error: 'Banco no encontrado' });
  }

  const result = run(
    'INSERT INTO questions (bank_id, question, options, correct, explanation) VALUES (?, ?, ?, ?, ?)',
    [req.params.id, question.trim(), JSON.stringify(options), correct, (explanation || '').trim()]
  );

  run("UPDATE question_banks SET updated_at = datetime('now') WHERE id = ?", [req.params.id]);

  const q = get('SELECT * FROM questions WHERE id = ?', [result.lastInsertRowid]);
  q.options = JSON.parse(q.options);

  res.status(201).json({ question: q });
});

router.put('/:id/questions/:qid', (req, res) => {
  const { question, options, correct, explanation } = req.body;

  const bank = get('SELECT id FROM question_banks WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacher.id]);

  if (!bank) {
    return res.status(404).json({ error: 'Banco no encontrado' });
  }

  const existing = get('SELECT id FROM questions WHERE id = ? AND bank_id = ?', [req.params.qid, req.params.id]);

  if (!existing) {
    return res.status(404).json({ error: 'Pregunta no encontrada' });
  }

  if (question !== undefined) {
    if (!question.trim()) {
      return res.status(400).json({ error: 'La pregunta no puede estar vacía' });
    }
    run('UPDATE questions SET question = ? WHERE id = ?', [question.trim(), req.params.qid]);
  }

  if (options !== undefined) {
    if (!Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: 'Se requieren al menos 2 opciones' });
    }
    run('UPDATE questions SET options = ? WHERE id = ?', [JSON.stringify(options), req.params.qid]);
  }

  if (correct !== undefined) {
    const opt = get('SELECT options FROM questions WHERE id = ?', [req.params.qid]);
    const parsed = JSON.parse(opt.options);
    if (correct < 0 || correct >= parsed.length) {
      return res.status(400).json({ error: 'Índice de respuesta correcta inválido' });
    }
    run('UPDATE questions SET correct = ? WHERE id = ?', [correct, req.params.qid]);
  }

  if (explanation !== undefined) {
    run('UPDATE questions SET explanation = ? WHERE id = ?', [explanation.trim(), req.params.qid]);
  }

  run("UPDATE question_banks SET updated_at = datetime('now') WHERE id = ?", [req.params.id]);

  const q = get('SELECT * FROM questions WHERE id = ?', [req.params.qid]);
  q.options = JSON.parse(q.options);

  res.json({ question: q });
});

router.delete('/:id/questions/:qid', (req, res) => {
  const bank = get('SELECT id FROM question_banks WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacher.id]);

  if (!bank) {
    return res.status(404).json({ error: 'Banco no encontrado' });
  }

  const existing = get('SELECT id FROM questions WHERE id = ? AND bank_id = ?', [req.params.qid, req.params.id]);

  if (!existing) {
    return res.status(404).json({ error: 'Pregunta no encontrada' });
  }

  run('DELETE FROM questions WHERE id = ?', [req.params.qid]);
  run("UPDATE question_banks SET updated_at = datetime('now') WHERE id = ?", [req.params.id]);

  res.json({ message: 'Pregunta eliminada' });
});

module.exports = router;
