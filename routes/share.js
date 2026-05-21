const express = require('express');
const { get, all } = require('../lib/db');

const router = express.Router();

router.get('/:code', (req, res) => {
  const bank = get(
    'SELECT id, title, description, created_at FROM question_banks WHERE share_code = ?',
    [req.params.code]
  );

  if (!bank) {
    return res.status(404).json({ error: 'Banco no encontrado. Verifica el código.' });
  }

  const questions = all(
    'SELECT id, question, options, correct, explanation FROM questions WHERE bank_id = ? ORDER BY id',
    [bank.id]
  );

  res.json({
    bank,
    questions: questions.map(q => ({ ...q, options: JSON.parse(q.options) }))
  });
});

router.get('/:code/export', (req, res) => {
  const bank = get(
    'SELECT id, title, description, created_at FROM question_banks WHERE share_code = ?',
    [req.params.code]
  );

  if (!bank) {
    return res.status(404).json({ error: 'Banco no encontrado' });
  }

  const questions = all(
    'SELECT question, options, correct, explanation FROM questions WHERE bank_id = ? ORDER BY id',
    [bank.id]
  );

  const exportData = {
    title: bank.title,
    description: bank.description,
    created_at: bank.created_at,
    questions: questions.map(q => ({
      question: q.question,
      options: JSON.parse(q.options),
      correct: q.correct,
      explanation: q.explanation
    }))
  };

  res.json(exportData);
});

module.exports = router;
