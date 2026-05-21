const express = require('express');
const { get, run, all } = require('../lib/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

router.post('/', (req, res) => {
  const { bank_id, title, mode, player_count, players } = req.body;

  if (!players || !Array.isArray(players) || players.length === 0) {
    return res.status(400).json({ error: 'Se requiere al menos un jugador' });
  }

  let actualBankId = bank_id || null;
  let actualTitle = title || 'Partida sin banco';
  let actualMode = mode || 'classic';

  const result = run(
    'INSERT INTO game_sessions (teacher_id, bank_id, title, mode, player_count) VALUES (?, ?, ?, ?, ?)',
    [req.teacher.id, actualBankId, actualTitle, actualMode, players.length]
  );

  const sessionId = result.lastInsertRowid;

  for (const player of players) {
    run(
      'INSERT INTO player_results (session_id, player_name, score, correct, total, answers) VALUES (?, ?, ?, ?, ?, ?)',
      [
        sessionId,
        player.player_name || 'Anónimo',
        player.score || 0,
        player.correct || 0,
        player.total || 0,
        JSON.stringify(player.answers || [])
      ]
    );
  }

  const session = get('SELECT * FROM game_sessions WHERE id = ?', [sessionId]);
  const playerResults = all('SELECT * FROM player_results WHERE session_id = ?', [sessionId]);

  res.status(201).json({ session, players: playerResults });
});

router.get('/', (req, res) => {
  const sessions = all(
    `SELECT gs.*, qb.title as bank_title
     FROM game_sessions gs
     LEFT JOIN question_banks qb ON gs.bank_id = qb.id
     WHERE gs.teacher_id = ?
     ORDER BY gs.played_at DESC
     LIMIT 50`,
    [req.teacher.id]
  );

  res.json({ sessions });
});

router.get('/:id', (req, res) => {
  const session = get(
    `SELECT gs.*, qb.title as bank_title
     FROM game_sessions gs
     LEFT JOIN question_banks qb ON gs.bank_id = qb.id
     WHERE gs.id = ? AND gs.teacher_id = ?`,
    [req.params.id, req.teacher.id]
  );

  if (!session) {
    return res.status(404).json({ error: 'Sesión no encontrada' });
  }

  const players = all(
    'SELECT * FROM player_results WHERE session_id = ? ORDER BY score DESC',
    [session.id]
  );

  res.json({ session, players });
});

module.exports = router;
