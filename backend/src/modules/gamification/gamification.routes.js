const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../../middleware/auth');
const { gestorOnly } = require('../../middleware/permissions');
const { requireModule } = require('../../middleware/familyModule');

router.use(authMiddleware, requireModule('medals'));

// GET /api/gamification/profile/:childId
router.get('/profile/:childId', async (req, res) => {
  try {
    const db = req.db;
    const child = await db.prepare('SELECT * FROM children WHERE id=? AND family_id=?').get(req.params.childId, req.user.familyId);
    if (!child) return res.status(404).json({ error: 'Filho não encontrado' });

    const medals = await db.prepare(`SELECT m.*,em.earned_at FROM earned_medals em JOIN medals m ON em.medal_id=m.id WHERE em.child_id=? ORDER BY em.earned_at DESC`).all(req.params.childId);
    const allMedals = await db.prepare(`
      SELECT * FROM medals WHERE (family_id IS NULL OR family_id=?)
      AND (family_id IS NULL OR is_active IS NULL OR is_active = TRUE)
      ORDER BY COALESCE(medal_group, category), requirement_value
    `).all(req.user.familyId);
    const recentHistory = await db.prepare('SELECT * FROM history WHERE child_id=? ORDER BY created_at DESC LIMIT 20').all(req.params.childId);
    const tasksCompleted = await db.prepare('SELECT COUNT(*) as c FROM tasks WHERE child_id=? AND status=?').get(req.params.childId, 'approved');

    res.json({
      child, medals, allMedals, recentHistory,
      stats: { tasksCompleted: tasksCompleted.c, medalsEarned: medals.length, totalMedals: allMedals.length },
    });
  } catch (err) { res.status(500).json({ error: 'Erro ao buscar perfil' }); }
});

// GET /api/gamification/leaderboard
router.get('/leaderboard', authMiddleware, async (req, res) => {
  try {
    const children = await req.db.prepare('SELECT id,name,color,avatar_url,avatar_preset,points,coins,level,xp,streak_current,streak_best FROM children WHERE family_id=? ORDER BY points DESC').all(req.user.familyId);
    res.json(children);
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// GET /api/gamification/medals — listagem (gestor vê inativas também no painel; mesma API)
router.get('/medals', async (req, res) => {
  try {
    res.json(await req.db.prepare(`
      SELECT * FROM medals WHERE family_id IS NULL OR family_id=?
      ORDER BY COALESCE(medal_group, category), requirement_value
    `).all(req.user.familyId));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// POST /api/gamification/medals
router.post('/medals', gestorOnly, async (req, res) => {
  try {
    const {
      name, name_en, description, description_en, icon, category, requirement_type, requirement_value,
      color, extra_points, rule_description, medal_group, is_active,
    } = req.body;
    const id = uuidv4();
    const cat = category && ['tasks', 'grades', 'streak', 'special', 'allowance'].includes(category) ? category : 'special';
    const active = is_active !== undefined ? !!is_active : true;
    await req.db.prepare(`
      INSERT INTO medals (
        id,name,name_en,description,description_en,icon,category,requirement_type,requirement_value,family_id,
        color, extra_points, rule_description, medal_group, is_active
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id,
      name,
      name_en || name,
      description || null,
      description_en || description,
      icon || '🏅',
      cat,
      requirement_type || 'custom',
      requirement_value != null ? Number(requirement_value) : 1,
      req.user.familyId,
      color || null,
      extra_points != null ? Number(extra_points) : 0,
      rule_description || null,
      medal_group || null,
      active,
    );
    res.status(201).json(await req.db.prepare('SELECT * FROM medals WHERE id=?').get(id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar medalha' });
  }
});

// PUT /api/gamification/medals/:id
router.put('/medals/:id', gestorOnly, async (req, res) => {
  try {
    const {
      name, name_en, description, description_en, icon, category, requirement_type, requirement_value,
      color, extra_points, rule_description, medal_group, is_active,
    } = req.body;
    const row = await req.db.prepare('SELECT * FROM medals WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!row) return res.status(404).json({ error: 'Medalha não encontrada' });
    const allowedCat = ['tasks', 'grades', 'streak', 'special', 'allowance'];
    let newCat = row.category;
    if (category != null && allowedCat.includes(category)) newCat = category;

    await req.db.prepare(`
      UPDATE medals SET
        name=COALESCE(?,name), name_en=COALESCE(?,name_en), description=COALESCE(?,description), description_en=COALESCE(?,description_en),
        icon=COALESCE(?,icon), category=COALESCE(?,category), requirement_type=COALESCE(?,requirement_type), requirement_value=COALESCE(?,requirement_value),
        color=COALESCE(?,color), extra_points=COALESCE(?,extra_points), rule_description=COALESCE(?,rule_description), medal_group=COALESCE(?,medal_group),
        is_active=COALESCE(?,is_active)
      WHERE id=? AND family_id=?
    `).run(
      name ?? null,
      name_en ?? null,
      description ?? null,
      description_en ?? null,
      icon ?? null,
      newCat,
      requirement_type ?? null,
      requirement_value != null ? Number(requirement_value) : null,
      color ?? null,
      extra_points != null ? Number(extra_points) : null,
      rule_description ?? null,
      medal_group ?? null,
      is_active !== undefined ? !!is_active : null,
      req.params.id,
      req.user.familyId,
    );
    res.json(await req.db.prepare('SELECT * FROM medals WHERE id=?').get(req.params.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar medalha' });
  }
});

// DELETE /api/gamification/medals/:id
router.delete('/medals/:id', gestorOnly, async (req, res) => {
  try {
    req.db.prepare('DELETE FROM medals WHERE id=? AND family_id=?').run(req.params.id, req.user.familyId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erro ao excluir medalha' }); }
});

// GET /api/gamification/history/:childId
router.get('/history/:childId', async (req, res) => {
  try {
    const history = req.db.prepare('SELECT * FROM history WHERE child_id=? AND family_id=? ORDER BY created_at DESC LIMIT 50').all(req.params.childId, req.user.familyId);
    res.json(history);
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;
