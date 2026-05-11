function parentOnly(req, res, next) {
  if (!['parent', 'master'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Apenas responsáveis podem realizar esta ação' });
  }
  next();
}

/** Pai/gestor com perfil gestor — painel administrativo da família e configurações sensíveis */
function gestorOnly(req, res, next) {
  if (req.user.role !== 'parent') {
    return res.status(403).json({ error: 'Apenas o gestor familiar pode realizar esta ação' });
  }
  const ap = req.user.accessProfile ?? req.user.access_profile ?? 'gestor';
  if (ap !== 'gestor') {
    return res.status(403).json({ error: 'Apenas o gestor familiar pode realizar esta ação' });
  }
  next();
}

/** Gestor altera qualquer adulto da família; auxiliar/parente só a si próprio */
async function canUpdateFamilyMemberAvatar(req, res, next) {
  const db = req.db;
  const targetId = req.params.id;
  const member = await db.prepare('SELECT id, role FROM users WHERE id = ? AND family_id = ?').get(targetId, req.user.familyId);
  if (!member || member.role === 'child') {
    return res.status(404).json({ error: 'Membro não encontrado' });
  }
  if (String(targetId) === String(req.user.id)) return next();
  if (req.user.role === 'parent') {
    const ap = req.user.accessProfile ?? req.user.access_profile ?? 'gestor';
    if (ap === 'gestor') return next();
    return res.status(403).json({ error: 'Apenas o gestor pode alterar o avatar de outro membro' });
  }
  return res.status(403).json({ error: 'Sem permissão' });
}

function masterOnly(req, res, next) {
  if (req.user.role !== 'master') {
    return res.status(403).json({ error: 'Acesso restrito ao administrador global' });
  }
  next();
}

function childOnly(req, res, next) {
  if (req.user.role !== 'child') {
    return res.status(403).json({ error: 'Ação restrita a filhos' });
  }
  next();
}

function notChild(req, res, next) {
  if (req.user.role === 'child') {
    return res.status(403).json({ error: 'Filhos não podem realizar esta ação' });
  }
  next();
}

function familyMember(req, res, next) {
  next();
}

// Check if user can perform action on module via permissions table
function canDo(action) {
  return async (req, res, next) => {
    // Masters and parents always have full access
    if (['master', 'parent'].includes(req.user.role)) return next();
    
    const db = req.db;
    const perm = await db.prepare(`
      SELECT * FROM permissions 
      WHERE (user_id=? OR role=?) AND module=? 
      ORDER BY user_id DESC LIMIT 1
    `).get(req.user.id, req.user.role, req.params.module || 'general');
    
    if (!perm || !perm[`can_${action}`]) {
      return res.status(403).json({ error: `Você não tem permissão para ${action} neste módulo` });
    }
    next();
  };
}

module.exports = { parentOnly, gestorOnly, canUpdateFamilyMemberAvatar, masterOnly, childOnly, notChild, familyMember, canDo };
