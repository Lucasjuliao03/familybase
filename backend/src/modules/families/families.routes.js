const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const authMiddleware = require('../../middleware/auth');
const { gestorOnly, parentOnly, canUpdateFamilyMemberAvatar } = require('../../middleware/permissions');
const { isPremiumPlan } = require('../../lib/familyModulesCatalog');
const { setFamilyModules, ensureFamilyModules } = require('../../lib/familyModuleService');
const { getMap } = require('../../middleware/familyModule');
const {
  assertValidUserDisplayColor,
  pickFirstAvailableUserColor,
  normalizeHex,
} = require('../../lib/userDisplayColors');

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.resolve(process.env.UPLOAD_PATH || './uploads', 'avatars')),
  filename: (req, file, cb) => {
    const uniqueName = `avatar-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.resolve(process.env.UPLOAD_PATH || './uploads', 'family-logos')),
  filename: (req, file, cb) => {
    cb(null, `logo-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`);
  },
});
const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas'));
  },
});
const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas'));
  },
});

// GET /api/families - Get current family details
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const family = await db.prepare('SELECT * FROM families WHERE id = ?').get(req.user.familyId);
    if (!family) return res.status(404).json({ error: 'Família não encontrada' });

    const members = await db.prepare(`
      SELECT id, name, email, role, avatar_url, avatar_preset, phone, status,
             access_profile, emoji, display_color, last_login_at
      FROM users WHERE family_id = ?
    `).all(req.user.familyId);
    const children = await db.prepare(`
      SELECT c.*, u.email AS user_email FROM children c
      LEFT JOIN users u ON u.id = c.user_id
      WHERE c.family_id = ?
    `).all(req.user.familyId);

    res.json({ family, members, children });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar família' });
  }
});

// PUT /api/families — dados completos da família (gestor)
router.put('/', authMiddleware, gestorOnly, async (req, res) => {
  try {
    const {
      name, language, plan, contact_email, contact_phone, emoji,
      primary_color, secondary_color, status,
    } = req.body;
    const db = req.db;

    const famRow = await db.prepare('SELECT primary_color, secondary_color FROM families WHERE id=?').get(req.user.familyId);
    const nextPrimary = primary_color != null ? normalizeHex(primary_color) : normalizeHex(famRow?.primary_color || '');
    const nextSecondary = secondary_color != null ? normalizeHex(secondary_color) : normalizeHex(famRow?.secondary_color || '');
    const userUsesColor = async (hex) => {
      if (!hex) return false;
      return !!await db.prepare(`
        SELECT 1 FROM users WHERE family_id=? AND role IN ('parent','relative')
        AND display_color IS NOT NULL AND TRIM(display_color) != ''
        AND UPPER(TRIM(display_color)) = ? LIMIT 1
      `).get(req.user.familyId, hex);
    };
    if (userUsesColor(nextPrimary) || userUsesColor(nextSecondary)) {
      return res.status(400).json({
        error: 'A cor principal ou secundária da família coincide com a cor de um responsável. Altere primeiro a cor desse utilizador na aba Usuários.',
      });
    }

    await db.prepare(`
      UPDATE families SET
        name = COALESCE(?, name),
        language = COALESCE(?, language),
        plan = COALESCE(?, plan),
        contact_email = COALESCE(?, contact_email),
        contact_phone = COALESCE(?, contact_phone),
        emoji = COALESCE(?, emoji),
        primary_color = COALESCE(?, primary_color),
        secondary_color = COALESCE(?, secondary_color),
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name ?? null,
      language ?? null,
      plan ?? null,
      contact_email ?? null,
      contact_phone ?? null,
      emoji ?? null,
      primary_color ?? null,
      secondary_color ?? null,
      status ?? null,
      req.user.familyId,
    );
    const family = await db.prepare('SELECT * FROM families WHERE id = ?').get(req.user.familyId);
    res.json(family);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar família' });
  }
});

// PUT /api/families/logo — upload de imagem (qualquer responsável pai)
router.put('/logo', authMiddleware, parentOnly, uploadLogo.single('logo'), async (req, res) => {
  try {
    const db = req.db;
    if (!req.file) return res.status(400).json({ error: 'Envie uma imagem' });
    const logoUrl = `/uploads/family-logos/${req.file.filename}`;
    await db.prepare('UPDATE families SET logo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(logoUrl, req.user.familyId);
    res.json({ logo_url: logoUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar logo' });
  }
});

// DELETE /api/families/logo
router.delete('/logo', authMiddleware, parentOnly, async (req, res) => {
  try {
    await req.db.prepare('UPDATE families SET logo_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.user.familyId);
    res.json({ logo_url: null });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover logo' });
  }
});

// POST /api/families/members — novo responsável (pai/gestor ou auxiliar)
router.post('/members', authMiddleware, gestorOnly, async (req, res) => {
  try {
    const {
      name, email, password, access_profile, must_change_password, phone, emoji, display_color, avatar_preset,
    } = req.body;
    const db = req.db;

    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Email já cadastrado' });

    const ap = access_profile === 'auxiliar' ? 'auxiliar' : 'gestor';
    const userId = uuidv4();
    const hashed = bcrypt.hashSync(password || '123456', 10);
    const mustFlag = !!must_change_password;

    let dc;
    try {
      dc = display_color
        ? await assertValidUserDisplayColor(db, req.user.familyId, display_color, userId)
        : await pickFirstAvailableUserColor(db, req.user.familyId, userId);
    } catch (e) {
      return res.status(400).json({ error: e.message || 'Cor inválida' });
    }

    await db.prepare(`
      INSERT INTO users (id, name, email, password, role, family_id, avatar_preset, access_profile, must_change_password, phone, emoji, display_color)
      VALUES (?, ?, ?, ?, 'parent', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      name,
      email,
      hashed,
      req.user.familyId,
      avatar_preset || 'parent_male',
      ap,
      mustFlag,
      phone || null,
      emoji || null,
      dc,
    );
    res.status(201).json({ success: true, id: userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao adicionar responsável' });
  }
});

// POST /api/families/children
router.post('/children', authMiddleware, gestorOnly, async (req, res) => {
  try {
    const {
      name, age, birthday, color, avatar_preset, email, password, nickname, emoji,
      must_change_password, notes,
    } = req.body;
    const db = req.db;

    const childId = uuidv4();
    let childUserId = null;

    if (email && password) {
      const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (existing) return res.status(400).json({ error: 'Email já cadastrado' });

      childUserId = uuidv4();
      const hashed = bcrypt.hashSync(password, 10);
      const mustFlag = !!must_change_password;
      await db.prepare(`
        INSERT INTO users (id, name, email, password, role, family_id, avatar_preset, must_change_password)
        VALUES (?, ?, ?, ?, 'child', ?, ?, ?)
      `).run(childUserId, name, email, hashed, req.user.familyId, avatar_preset || 'explorer', mustFlag);
    }

    await db.prepare(`
      INSERT INTO children (id, name, age, birthday, color, avatar_preset, user_id, family_id, nickname, emoji, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      childId,
      name,
      age || null,
      birthday || null,
      color || '#6C5CE7',
      avatar_preset || 'explorer',
      childUserId,
      req.user.familyId,
      nickname || null,
      emoji || null,
      notes || null,
    );

    const child = await db.prepare('SELECT * FROM children WHERE id = ?').get(childId);
    res.status(201).json(child);
  } catch (err) {
    console.error('Add child error:', err);
    res.status(500).json({ error: 'Erro ao adicionar filho' });
  }
});

// PUT /api/families/children/:id
router.put('/children/:id', authMiddleware, gestorOnly, async (req, res) => {
  try {
    const {
      name, age, birthday, color, avatar_preset, nickname, emoji, notes, email,
    } = req.body;
    const db = req.db;
    const child = await db.prepare('SELECT * FROM children WHERE id = ? AND family_id = ?').get(req.params.id, req.user.familyId);
    if (!child) return res.status(404).json({ error: 'Filho não encontrado' });

    await db.prepare(`
      UPDATE children SET
        name = COALESCE(?, name),
        age = COALESCE(?, age),
        birthday = COALESCE(?, birthday),
        color = COALESCE(?, color),
        avatar_preset = COALESCE(?, avatar_preset),
        nickname = COALESCE(?, nickname),
        emoji = COALESCE(?, emoji),
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND family_id = ?
    `).run(
      name ?? null,
      age ?? null,
      birthday ?? null,
      color ?? null,
      avatar_preset ?? null,
      nickname ?? null,
      emoji ?? null,
      notes ?? null,
      req.params.id,
      req.user.familyId,
    );
    if (child.user_id && email) {
      const ex = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, child.user_id);
      if (ex) return res.status(400).json({ error: 'Email já cadastrado' });
      await db.prepare('UPDATE users SET email = ?, name = COALESCE(?, name), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(email, name ?? null, child.user_id);
    } else if (child.user_id && name) {
      await db.prepare('UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, child.user_id);
    }

    const updated = await db.prepare('SELECT * FROM children WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar filho' });
  }
});

router.delete('/children/:id', authMiddleware, gestorOnly, async (req, res) => {
  try {
    const db = req.db;
    const child = await db.prepare('SELECT * FROM children WHERE id = ? AND family_id = ?').get(req.params.id, req.user.familyId);
    if (!child) return res.status(404).json({ error: 'Filho não encontrado' });
    await db.prepare("UPDATE children SET status='inactive', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id);
    if (child.user_id) await db.prepare("UPDATE users SET status='inactive', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(child.user_id);
    res.json({ message: 'Filho desativado com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover filho' });
  }
});

router.get('/children', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const children = await db.prepare("SELECT * FROM children WHERE family_id = ? AND status != 'inactive' ORDER BY name").all(req.user.familyId);
    res.json(children);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar filhos' });
  }
});

// PUT /api/families/members/:id
router.put('/members/:id', authMiddleware, gestorOnly, async (req, res) => {
  try {
    const {
      name, email, avatar_preset, status, phone, emoji, display_color, access_profile, relationship,
    } = req.body;
    const db = req.db;
    const member = await db.prepare('SELECT * FROM users WHERE id = ? AND family_id = ?').get(req.params.id, req.user.familyId);
    if (!member) return res.status(404).json({ error: 'Membro não encontrado' });
    if (member.role === 'child') return res.status(400).json({ error: 'Use a rota de filhos' });

    if (email && email !== member.email) {
      const ex = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.params.id);
      if (ex) return res.status(400).json({ error: 'Email já cadastrado' });
    }

    let ap = access_profile;
    if (member.role === 'relative') {
      if (ap !== 'parente' && ap !== 'auxiliar') ap = null;
    } else if (member.role === 'parent') {
      if (ap !== 'gestor' && ap !== 'auxiliar') ap = null;
    } else {
      ap = null;
    }

    let displayColorParam = undefined;
    if (Object.prototype.hasOwnProperty.call(req.body, 'display_color')) {
      try {
        displayColorParam = await assertValidUserDisplayColor(db, req.user.familyId, display_color, req.params.id);
      } catch (e) {
        return res.status(400).json({ error: e.message || 'Cor inválida' });
      }
    }

    await db.prepare(`
      UPDATE users SET
        name = COALESCE(?, name),
        email = COALESCE(?, email),
        avatar_preset = COALESCE(?, avatar_preset),
        status = COALESCE(?, status),
        phone = COALESCE(?, phone),
        emoji = COALESCE(?, emoji),
        display_color = COALESCE(?, display_color),
        access_profile = COALESCE(?, access_profile),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND family_id = ?
    `).run(
      name ?? null,
      email ?? null,
      avatar_preset ?? null,
      status ?? null,
      phone ?? null,
      emoji ?? null,
      displayColorParam ?? null,
      ap ?? null,
      req.params.id,
      req.user.familyId,
    );

    if (member.role === 'relative' && relationship != null) {
      await db.prepare('UPDATE family_members SET relationship = ? WHERE user_id = ? AND family_id = ?')
        .run(relationship, req.params.id, req.user.familyId);
    }

    const row = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar membro' });
  }
});

router.put('/members/:id/avatar', authMiddleware, canUpdateFamilyMemberAvatar, uploadAvatar.single('avatar'), async (req, res) => {
  try {
    const db = req.db;
    const member = await db.prepare('SELECT * FROM users WHERE id = ? AND family_id = ?').get(req.params.id, req.user.familyId);
    if (!member || member.role === 'child') return res.status(404).json({ error: 'Membro não encontrado' });

    if (req.file) {
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;
      await db.prepare('UPDATE users SET avatar_url = ?, avatar_preset = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(avatarUrl, req.params.id);
      return res.json({ avatar_url: avatarUrl, avatar_preset: null });
    }
    if (req.body.avatar_preset) {
      await db.prepare('UPDATE users SET avatar_preset = ?, avatar_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(req.body.avatar_preset, req.params.id);
      return res.json({ avatar_url: null, avatar_preset: req.body.avatar_preset });
    }
    res.status(400).json({ error: 'Envie imagem ou avatar_preset' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar avatar' });
  }
});

router.delete('/members/:id/avatar', authMiddleware, canUpdateFamilyMemberAvatar, async (req, res) => {
  try {
    const db = req.db;
    const member = await db.prepare('SELECT * FROM users WHERE id = ? AND family_id = ?').get(req.params.id, req.user.familyId);
    if (!member || member.role === 'child') return res.status(404).json({ error: 'Membro não encontrado' });
    await db.prepare('UPDATE users SET avatar_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    res.json({ avatar_url: null, avatar_preset: member.avatar_preset });
  } catch (err) {
    res.status(500).json({ error: 'Erro' });
  }
});

router.put('/members/:id/password', authMiddleware, gestorOnly, async (req, res) => {
  try {
    const { password, must_change_password } = req.body;
    if (!password || password.length < 4) return res.status(400).json({ error: 'Senha muito curta' });
    const db = req.db;
    const hashed = bcrypt.hashSync(password, 10);
    const must = !!must_change_password;
    await db.prepare('UPDATE users SET password = ?, must_change_password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND family_id = ?')
      .run(hashed, must, req.params.id, req.user.familyId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
});

router.put('/children/:id/password', authMiddleware, gestorOnly, async (req, res) => {
  try {
    const { password, must_change_password } = req.body;
    if (!password || password.length < 4) return res.status(400).json({ error: 'Senha muito curta' });
    const db = req.db;
    const child = await db.prepare('SELECT * FROM children WHERE id = ? AND family_id = ?').get(req.params.id, req.user.familyId);
    if (!child || !child.user_id) return res.status(400).json({ error: 'Filho sem conta de login' });
    const hashed = bcrypt.hashSync(password, 10);
    const must = !!must_change_password;
    await db.prepare('UPDATE users SET password = ?, must_change_password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(hashed, must, child.user_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
});

router.get('/members', authMiddleware, gestorOnly, async (req, res) => {
  try {
    const db = req.db;
    const members = await db.prepare(`
      SELECT u.id, u.name, u.email, u.role, u.status, u.phone, u.avatar_url, u.avatar_preset,
             u.last_login_at, u.access_profile, u.emoji, u.display_color, u.must_change_password,
             fm.relationship
      FROM users u
      LEFT JOIN family_members fm ON fm.user_id=u.id AND fm.family_id=?
      WHERE u.family_id=? AND u.role != 'child' AND u.role != 'master'
      ORDER BY u.role, u.name
    `).all(req.user.familyId, req.user.familyId);
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar membros' });
  }
});

router.post('/relatives', authMiddleware, gestorOnly, async (req, res) => {
  try {
    const {
      name, email, password, relationship, linked_child_ids, access_profile,
      must_change_password, phone, emoji, display_color,
    } = req.body;
    const db = req.db;

    const existing = await db.prepare('SELECT id FROM users WHERE email=?').get(email);
    if (existing) return res.status(400).json({ error: 'Email já cadastrado' });

    const ap = access_profile === 'auxiliar' ? 'auxiliar' : 'parente';
    const userId = uuidv4();
    const hashed = bcrypt.hashSync(password || '123456', 10);
    const mustFlag = must_change_password ? 1 : 0;

    let dcRel;
    try {
      dcRel = display_color
        ? await assertValidUserDisplayColor(db, req.user.familyId, display_color, userId)
        : await pickFirstAvailableUserColor(db, req.user.familyId, userId);
    } catch (e) {
      return res.status(400).json({ error: e.message || 'Cor inválida' });
    }

    await db.prepare(`
      INSERT INTO users (id, name, email, password, role, family_id, avatar_preset, access_profile, must_change_password, phone, emoji, display_color)
      VALUES (?,?,?,?,'relative',?,?,?,?,?,?,?)
    `).run(
      userId,
      name,
      email,
      hashed,
      req.user.familyId,
      'parent_female',
      ap,
      mustFlag,
      phone || null,
      emoji || null,
      dcRel,
    );
    await db.prepare(`
      INSERT INTO family_members (id, family_id, user_id, relationship)
      SELECT ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM family_members WHERE family_id = ? AND user_id = ?)
    `).run(
      uuidv4(),
      req.user.familyId,
      userId,
      relationship || 'other',
      req.user.familyId,
      userId,
    );

    if (linked_child_ids && linked_child_ids.length > 0) {
      for (const cid of linked_child_ids) {
        try {
          await db.prepare(`
            INSERT INTO relative_children (id, relative_user_id, child_id, family_id)
            SELECT ?, ?, ?, ?
            WHERE NOT EXISTS (
              SELECT 1 FROM relative_children WHERE relative_user_id = ? AND child_id = ? AND family_id = ?
            )
          `).run(uuidv4(), userId, cid, req.user.familyId, userId, cid, req.user.familyId);
        } catch (e) { /* ignore */ }
      }
    }

    res.status(201).json({ success: true, id: userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao adicionar parente' });
  }
});

router.put('/relatives/:id', authMiddleware, gestorOnly, async (req, res) => {
  try {
    const {
      name, email, phone, emoji, display_color, status, relationship, linked_child_ids, access_profile,
    } = req.body;
    const db = req.db;
    const rel = await db.prepare('SELECT u.* FROM users u WHERE u.id = ? AND u.family_id = ? AND u.role = \'relative\'').get(req.params.id, req.user.familyId);
    if (!rel) return res.status(404).json({ error: 'Parente não encontrado' });

    if (email && email !== rel.email) {
      const ex = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.params.id);
      if (ex) return res.status(400).json({ error: 'Email já cadastrado' });
    }

    const ap = access_profile === 'auxiliar' ? 'auxiliar' : access_profile === 'parente' ? 'parente' : rel.access_profile;

    let displayColorRel = undefined;
    if (Object.prototype.hasOwnProperty.call(req.body, 'display_color')) {
      try {
        displayColorRel = await assertValidUserDisplayColor(db, req.user.familyId, display_color, req.params.id);
      } catch (e) {
        return res.status(400).json({ error: e.message || 'Cor inválida' });
      }
    }

    await db.prepare(`
      UPDATE users SET
        name = COALESCE(?, name),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        emoji = COALESCE(?, emoji),
        display_color = COALESCE(?, display_color),
        status = COALESCE(?, status),
        access_profile = COALESCE(?, access_profile),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND family_id = ?
    `).run(
      name ?? null,
      email ?? null,
      phone ?? null,
      emoji ?? null,
      displayColorRel ?? null,
      status ?? null,
      ap ?? null,
      req.params.id,
      req.user.familyId,
    );

    if (relationship != null) {
      await db.prepare('UPDATE family_members SET relationship = ? WHERE user_id = ? AND family_id = ?')
        .run(relationship, req.params.id, req.user.familyId);
    }

    if (Array.isArray(linked_child_ids)) {
      await db.prepare('DELETE FROM relative_children WHERE relative_user_id = ? AND family_id = ?').run(req.params.id, req.user.familyId);
      for (const cid of linked_child_ids) {
        await db.prepare(`
          INSERT INTO relative_children (id, relative_user_id, child_id, family_id)
          SELECT ?, ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1 FROM relative_children WHERE relative_user_id = ? AND child_id = ? AND family_id = ?
          )
        `).run(uuidv4(), req.params.id, cid, req.user.familyId, req.params.id, cid, req.user.familyId);
      }
    }

    const row = await db.prepare(`
      SELECT u.*, MAX(fm.relationship) AS relationship,
        STRING_AGG(rc.child_id::text, ',' ORDER BY rc.child_id) AS linked_child_ids
      FROM users u
      JOIN family_members fm ON fm.user_id=u.id AND fm.family_id=?
      LEFT JOIN relative_children rc ON rc.relative_user_id=u.id
      WHERE u.id = ?
      GROUP BY u.id
    `).get(req.user.familyId, req.params.id);
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar parente' });
  }
});

router.get('/relatives', authMiddleware, gestorOnly, async (req, res) => {
  try {
    const db = req.db;
    const relatives = await db.prepare(`
      SELECT u.*, MAX(fm.relationship) AS relationship,
        STRING_AGG(rc.child_id::text, ',' ORDER BY rc.child_id) AS linked_child_ids
      FROM users u
      JOIN family_members fm ON fm.user_id=u.id AND fm.family_id=?
      LEFT JOIN relative_children rc ON rc.relative_user_id=u.id
      WHERE u.family_id=? AND u.role='relative'
      GROUP BY u.id
      ORDER BY u.name
    `).all(req.user.familyId, req.user.familyId);
    res.json(relatives);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar parentes' });
  }
});

router.put('/children/:id/status', authMiddleware, gestorOnly, async (req, res) => {
  try {
    const { status } = req.body;
    const db = req.db;
    await db.prepare('UPDATE children SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND family_id=?').run(status, req.params.id, req.user.familyId);
    const child = await db.prepare('SELECT * FROM children WHERE id = ?').get(req.params.id);
    if (child && child.user_id) {
      const ustat = status === 'active' ? 'active' : 'inactive';
      await db.prepare('UPDATE users SET status = ? WHERE id = ?').run(ustat, child.user_id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro' });
  }
});

// GET /api/families/modules — catálogo + estado (gestor)
router.get('/modules', authMiddleware, gestorOnly, async (req, res) => {
  try {
    const db = req.db;
    const family = await db.prepare('SELECT id, plan FROM families WHERE id = ?').get(req.user.familyId);
    if (!family) return res.status(404).json({ error: 'Família não encontrada' });
    await ensureFamilyModules(db, family.id, family.plan);
    const rows = await db.prepare(`
      SELECT fm.module_key, fm.is_enabled, fm.enabled_at, fm.disabled_at,
             sm.sort_order, sm.is_premium, sm.default_enabled
      FROM family_modules fm
      JOIN system_modules sm ON sm.module_key = fm.module_key
      WHERE fm.family_id = ?
      ORDER BY sm.sort_order, fm.module_key
    `).all(req.user.familyId);
    const planOk = isPremiumPlan(family.plan);
    res.json({
      plan: family.plan,
      planAllowsPremium: planOk,
      modules: rows.map((r) => ({
        module_key: r.module_key,
        is_enabled: !!r.is_enabled,
        is_premium: !!r.is_premium,
        default_enabled: !!r.default_enabled,
        can_enable: planOk || !r.is_premium,
        enabled_at: r.enabled_at,
        disabled_at: r.disabled_at,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar módulos' });
  }
});

// PUT /api/families/modules — atualizar vários (gestor)
router.put('/modules', authMiddleware, gestorOnly, async (req, res) => {
  try {
    const { modules: updates } = req.body;
    if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'Payload inválido' });
    const db = req.db;
    const family = await db.prepare('SELECT id, plan FROM families WHERE id = ?').get(req.user.familyId);
    if (!family) return res.status(404).json({ error: 'Família não encontrada' });
    await ensureFamilyModules(db, family.id, family.plan);
    await setFamilyModules(db, family.id, updates, req.user.id, family.plan);
    res.json({ success: true, modules: await getMap(db, req.user.familyId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar módulos' });
  }
});

module.exports = router;
