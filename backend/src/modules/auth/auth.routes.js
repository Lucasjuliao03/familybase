const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const authMiddleware = require('../../middleware/auth');
const { ensureFamilyModules } = require('../../lib/familyModuleService');
const { getMap } = require('../../middleware/familyModule');
const { sendJsonForDbError } = require('../../lib/dbErrors');

function buildTokenPayload(user) {
  let accessProfile = user.access_profile;
  if (accessProfile == null || accessProfile === '') {
    if (user.role === 'child') accessProfile = null;
    else if (user.role === 'relative') accessProfile = 'parente';
    else if (user.role === 'parent') accessProfile = 'gestor';
    else accessProfile = 'gestor';
  }
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    familyId: user.family_id,
    accessProfile,
    mustChangePassword: !!user.must_change_password,
  };
}

// Multer config para upload de avatar
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.resolve(process.env.UPLOAD_PATH || './uploads', 'avatars')),
  filename: (req, file, cb) => {
    const uniqueName = `avatar-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas'));
  }
});

// Lista de avatares predefinidos disponíveis no banco
const PRESET_AVATARS = [
  { id: 'astronaut',    emoji: '🚀', label: 'Astronauta',  color: '#6C5CE7' },
  { id: 'explorer',    emoji: '🗺️', label: 'Explorador',  color: '#00B894' },
  { id: 'artist',      emoji: '🎨', label: 'Artista',     color: '#E84393' },
  { id: 'scientist',   emoji: '🔬', label: 'Cientista',   color: '#74B9FF' },
  { id: 'athlete',     emoji: '⚽', label: 'Atleta',      color: '#FDCB6E' },
  { id: 'musician',    emoji: '🎵', label: 'Músico',      color: '#A29BFE' },
  { id: 'chef',        emoji: '🍳', label: 'Chef',        color: '#FF7675' },
  { id: 'reader',      emoji: '📚', label: 'Leitor',      color: '#55EFC4' },
  { id: 'gamer',       emoji: '🎮', label: 'Gamer',       color: '#6C5CE7' },
  { id: 'ninja',       emoji: '🥷', label: 'Ninja',       color: '#2D3436' },
  { id: 'princess',    emoji: '👸', label: 'Princesa',    color: '#FD79A8' },
  { id: 'superhero',   emoji: '🦸', label: 'Super-herói', color: '#E17055' },
  { id: 'parent_male', emoji: '👨', label: 'Pai',         color: '#0984E3' },
  { id: 'parent_female',emoji: '👩',label: 'Mãe',         color: '#E84393' },
  { id: 'robot',       emoji: '🤖', label: 'Robô',        color: '#636E72' },
  { id: 'dragon',      emoji: '🐉', label: 'Dragão',      color: '#6C5CE7' },
];

// GET /api/auth/avatars — lista de avatares disponíveis
router.get('/avatars', async (req, res) => {
  res.json(PRESET_AVATARS);
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { familyName, name, email, password, language } = req.body;
    const db = req.db;
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Email já cadastrado' });

    const familyId = uuidv4();
    await db.prepare('INSERT INTO families (id, name, language) VALUES (?, ?, ?)').run(
      familyId, familyName || `Família ${name.split(' ')[0]}`, language || 'pt'
    );
    await ensureFamilyModules(db, familyId, 'free');

    const { supabase } = require('../../database/supabaseClient');
    let userId = uuidv4();

    // Criar no Supabase Auth se disponível
    if (supabase && process.env.SUPABASE_URL) {
      const { data: sData, error: sError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name }
      });
      if (sError) {
        console.warn('⚠️ Erro ao criar no Supabase Auth (usando UUID gerado):', sError.message);
      } else if (sData.user) {
        userId = sData.user.id;
        console.log(`✅ Supabase Auth user created: ${userId}`);
      }
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    await db.prepare('INSERT INTO users (id, name, email, password, role, family_id, avatar_preset) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      userId, name, email, hashedPassword, 'parent', familyId, 'parent_male'
    );

    const newUser = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const token = jwt.sign(
      buildTokenPayload(newUser),
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    await db.prepare('INSERT INTO notifications (id, title, message, type, icon, user_id, family_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      uuidv4(), 'Bem-vindo ao FamilyBase!', 'Sua família foi criada. Comece adicionando seus filhos!', 'info', '🎉', userId, familyId
    );

    const modules = await getMap(db, familyId);

    res.status(201).json({
      token,
      user: {
        id: userId, name, email, role: 'parent', familyId, avatar_url: null, avatar_preset: 'parent_male',
        access_profile: 'gestor', must_change_password: false, emoji: null, display_color: null,
      },
      family: { id: familyId, name: familyName, language: language || 'pt' },
      mustChangePassword: false,
      modules,
    });
  } catch (err) {
    return sendJsonForDbError(res, err, { defaultMsg: 'Erro ao registrar' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const db = req.db;
    const { supabase } = require('../../database/supabaseClient');

    // 1. Tentar login via Supabase Auth se configurado
    let authSuccess = false;
    let authId = null;

    if (supabase && process.env.SUPABASE_URL) {
      const { data: sData, error: sError } = await supabase.auth.signInWithPassword({ email, password });
      if (!sError && sData.user) {
        authSuccess = true;
        authId = sData.user.id;
        console.log(`✅ Supabase Auth success for ${email}`);
      }
    }

    // 2. Buscar usuário no banco local (perfil)
    const user = await db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);
    if (!user) {
      console.log(`❌ Login failed: User profile not found for ${email}`);
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    // 3. Se não autenticou via Supabase, tentar fallback local (bcrypt)
    if (!authSuccess) {
      if (!user.password || !bcrypt.compareSync(password, user.password)) {
        console.log(`❌ Login failed: Password mismatch for ${email}`);
        try {
          await db.prepare("INSERT INTO audit_logs (id, user_id, role, module, action, description) VALUES (?,?,?,?,?,?)").run(uuidv4(), user.id, user.role, 'auth', 'login_failed', `Failed login attempt for ${email}`);
        } catch (e) {}
        return res.status(401).json({ error: 'Email ou senha incorretos' });
      }
      console.log(`ℹ️ Fallback local login success for ${email}`);
    }

    if (user.status === 'blocked') return res.status(403).json({ error: 'Conta bloqueada. Entre em contato com o suporte.' });
    if (user.status === 'inactive') return res.status(403).json({ error: 'Conta inativa.' });

    // Update last login
    await db.prepare("UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?").run(user.id);

    const fullUser = await db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    const token = jwt.sign(
      buildTokenPayload(fullUser),
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const family = await db.prepare('SELECT * FROM families WHERE id = ?').get(user.family_id);
    let childProfile = null;
    if (user.role === 'child') {
      childProfile = await db.prepare('SELECT * FROM children WHERE user_id = ?').get(user.id);
    }

    // Audit log for master
    if (user.role === 'master') {
      try {
        await db.prepare("INSERT INTO audit_logs (id, user_id, role, module, action, description, ip_address) VALUES (?,?,?,?,?,?,?)").run(uuidv4(), user.id, user.role, 'auth', 'master_login', 'Master user logged in', req.ip || req.headers['x-forwarded-for'] || '');
      } catch(e) {}
    }

    const ap = buildTokenPayload(fullUser).accessProfile;
    const mcp = !!fullUser.must_change_password;
    let modules = {};
    if (user.family_id) {
      modules = await getMap(db, user.family_id);
    }
    res.json({
      token,
      user: {
        id: user.id, name: user.name, email: user.email, role: user.role, familyId: user.family_id,
        avatar_url: user.avatar_url, avatar_preset: user.avatar_preset, status: user.status,
        access_profile: ap, must_change_password: mcp, emoji: fullUser.emoji, display_color: fullUser.display_color,
      },
      family,
      childProfile,
      mustChangePassword: mcp,
      modules,
    });
  } catch (err) {
    return sendJsonForDbError(res, err, { defaultMsg: 'Erro ao fazer login' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    const family = await db.prepare('SELECT * FROM families WHERE id = ?').get(user.family_id);
    let childProfile = null;
    if (user.role === 'child') childProfile = await db.prepare('SELECT * FROM children WHERE user_id = ?').get(user.id);
    const tp = buildTokenPayload(user);
    let modules = {};
    if (user.family_id) {
      modules = await getMap(db, user.family_id);
    }
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        familyId: user.family_id,
        avatar_url: user.avatar_url,
        avatar_preset: user.avatar_preset,
        phone: user.phone,
        status: user.status,
        access_profile: tp.accessProfile,
        must_change_password: !!user.must_change_password,
        emoji: user.emoji,
        display_color: user.display_color,
      },
      family,
      childProfile,
      mustChangePassword: !!user.must_change_password,
      modules,
    });
  } catch (err) {
    return sendJsonForDbError(res, err, { defaultMsg: 'Erro' });
  }
});

// PUT /api/auth/password
router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const db = req.db;
    const user = await db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(currentPassword, user.password)) return res.status(400).json({ error: 'Senha atual incorreta' });
    await db.prepare("UPDATE users SET password = ?, must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(bcrypt.hashSync(newPassword, 10), req.user.id);
    res.json({ message: 'Senha alterada com sucesso' });
  } catch (err) {
    return sendJsonForDbError(res, err, { defaultMsg: 'Erro' });
  }
});

// PUT /api/auth/password/first-access — obrigatório quando must_change_password=1 (sem senha atual)
router.put('/password/first-access', authMiddleware, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const db = req.db;
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user.must_change_password) return res.status(400).json({ error: 'Não é necessário alterar a senha agora' });
    if (!newPassword || String(newPassword).length < 4) return res.status(400).json({ error: 'Senha muito curta' });
    await db.prepare("UPDATE users SET password = ?, must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(bcrypt.hashSync(newPassword, 10), req.user.id);
    const updated = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const token = jwt.sign(
      buildTokenPayload(updated),
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    res.json({
      token,
      mustChangePassword: false,
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        familyId: updated.family_id,
        avatar_url: updated.avatar_url,
        avatar_preset: updated.avatar_preset,
        status: updated.status,
        access_profile: buildTokenPayload(updated).accessProfile,
        must_change_password: false,
        emoji: updated.emoji,
        display_color: updated.display_color,
      },
    });
  } catch (err) {
    return sendJsonForDbError(res, err, { defaultMsg: 'Erro' });
  }
});

// PUT /api/auth/avatar — upload de foto OU selecionar preset
router.put('/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    const db = req.db;
    if (req.file) {
      // Upload de foto real
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;
      await db.prepare("UPDATE users SET avatar_url = ?, avatar_preset = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(avatarUrl, req.user.id);
      await db.prepare("UPDATE children SET avatar_url = ?, avatar_preset = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?").run(avatarUrl, req.user.id);
      res.json({ avatar_url: avatarUrl, avatar_preset: null });
    } else if (req.body.avatar_preset) {
      // Avatar predefinido do banco
      const preset = PRESET_AVATARS.find(a => a.id === req.body.avatar_preset);
      if (!preset) return res.status(400).json({ error: 'Avatar inválido' });
      await db.prepare("UPDATE users SET avatar_preset = ?, avatar_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.body.avatar_preset, req.user.id);
      await db.prepare("UPDATE children SET avatar_preset = ?, avatar_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?").run(req.body.avatar_preset, req.user.id);
      res.json({ avatar_url: null, avatar_preset: req.body.avatar_preset });
    } else {
      res.status(400).json({ error: 'Envie uma foto ou selecione um avatar' });
    }
  } catch (err) {
    return sendJsonForDbError(res, err, { defaultMsg: 'Erro ao atualizar avatar' });
  }
});

// PUT /api/auth/avatar/child/:childId — pais atualizam avatar dos filhos
router.put('/avatar/child/:childId', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    const db = req.db;
    const child = await db.prepare('SELECT * FROM children WHERE id=? AND family_id=?').get(req.params.childId, req.user.familyId);
    if (!child) return res.status(404).json({ error: 'Filho não encontrado' });

    if (req.file) {
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;
      await db.prepare("UPDATE children SET avatar_url=?, avatar_preset=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(avatarUrl, req.params.childId);
      if (child.user_id) await db.prepare("UPDATE users SET avatar_url=?, avatar_preset=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(avatarUrl, child.user_id);
      res.json({ avatar_url: avatarUrl, avatar_preset: null });
    } else if (req.body.avatar_preset) {
      await db.prepare("UPDATE children SET avatar_preset=?, avatar_url=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.body.avatar_preset, req.params.childId);
      if (child.user_id) await db.prepare("UPDATE users SET avatar_preset=?, avatar_url=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.body.avatar_preset, child.user_id);
      res.json({ avatar_url: null, avatar_preset: req.body.avatar_preset });
    } else {
      res.status(400).json({ error: 'Envie uma foto ou selecione um avatar' });
    }
  } catch (err) {
    return sendJsonForDbError(res, err, { defaultMsg: 'Erro' });
  }
});

// DELETE /api/auth/avatar/child/:childId/photo — remove só a foto (mantém preset)
router.delete('/avatar/child/:childId/photo', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const child = await db.prepare('SELECT * FROM children WHERE id=? AND family_id=?').get(req.params.childId, req.user.familyId);
    if (!child) return res.status(404).json({ error: 'Filho não encontrado' });
    if (req.user.role === 'child') {
      const mine = await db.prepare('SELECT id FROM children WHERE user_id=?').get(req.user.id);
      if (!mine || mine.id !== child.id) return res.status(403).json({ error: 'Acesso negado' });
    } else if (req.user.role !== 'parent' && req.user.role !== 'relative' && req.user.role !== 'master') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    await db.prepare("UPDATE children SET avatar_url=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.childId);
    if (child.user_id) await db.prepare("UPDATE users SET avatar_url=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(child.user_id);
    res.json({ avatar_url: null, avatar_preset: child.avatar_preset });
  } catch (err) {
    return sendJsonForDbError(res, err, { defaultMsg: 'Erro' });
  }
});

module.exports = router;
