const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const { optimizeHealthImage } = require('../../lib/optimizeHealthUpload');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../../middleware/auth');
const { parentOnly } = require('../../middleware/permissions');
const { requireModule } = require('../../middleware/familyModule');

const uploadRoot = path.resolve(process.env.UPLOAD_PATH || './uploads', 'health');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadRoot),
  filename: (req, file, cb) => {
    cb(null, `h-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens'));
  },
});

function accessProfile(req) {
  return req.user.accessProfile ?? req.user.access_profile ?? 'gestor';
}

function isGestor(req) {
  return req.user.role === 'parent' && accessProfile(req) === 'gestor';
}

async function childRow(db, userId) {
  return await db.prepare('SELECT * FROM children WHERE user_id=?').get(userId);
}

async function assertChildFamily(db, childId, familyId) {
  return await db.prepare('SELECT id FROM children WHERE id=? AND family_id=?').get(childId, familyId);
}

async function relativeLinked(db, userId, childId) {
  return await db.prepare('SELECT 1 FROM relative_children WHERE relative_user_id=? AND child_id=?').get(userId, childId);
}

async function canViewChild(db, req, childId) {
  const fid = req.user.familyId;
  if (!(await assertChildFamily(db, childId, fid))) return false;
  if (req.user.role === 'child') {
    const c = await childRow(db, req.user.id);
    return c && c.id === childId;
  }
  if (req.user.role === 'relative') return !!(await relativeLinked(db, req.user.id, childId));
  return ['parent', 'master'].includes(req.user.role);
}

function canEditHealthRecord(db, req, row) {
  if (req.user.role === 'relative') return row.created_by === req.user.id;
  if (req.user.role !== 'parent') return false;
  if (isGestor(req)) return true;
  return row.created_by === req.user.id;
}

function adultFamilyMember(req, res, next) {
  if (!['parent', 'relative'].includes(req.user.role)) return res.status(403).json({ error: 'Sem permissão' });
  next();
}

async function audit(db, req, module, action, description) {
  try {
    await db.prepare(`INSERT INTO audit_logs (id,family_id,user_id,role,module,action,description) VALUES (?,?,?,?,?,?,?)`).run(
      uuidv4(), req.user.familyId, req.user.id, req.user.role, module, action, description,
    );
  } catch (e) { /* ignore */ }
}

/** Lista de horários HH:mm a partir do body; compatível com scheduled_time único. */
function normalizeScheduledTimes(body) {
  const raw = body.scheduled_times;
  if (raw != null) {
    try {
      const arr = Array.isArray(raw) ? raw : JSON.parse(raw);
      if (Array.isArray(arr)) {
        return arr.map((s) => String(s || '').trim()).filter(Boolean);
      }
    } catch {
      /* fallthrough */
    }
  }
  if (body.scheduled_time) return [String(body.scheduled_time).trim()].filter(Boolean);
  return [];
}

const { syncMedicationReminderTasks, removeMedicationTasks, carrierChildId } = require('../../lib/medicationReminderTasks');

function normalizeMedicationStatus(s) {
  const v = String(s || 'active').trim().toLowerCase();
  if (v === 'em uso' || v === 'in_use' || v === 'uso' || v === 'ativo') return 'active';
  if (['active', 'finished', 'suspended'].includes(v)) return v;
  return 'active';
}

async function carrierOr400(db, familyId, res) {
  const cid = await carrierChildId(db, familyId);
  if (!cid) {
    res.status(400).json({ error: 'Cadastre ao menos uma criança nesta família para registos de adultos no Minha Saúde (uso técnico do vínculo).' });
    return null;
  }
  return cid;
}

/** Adulto da mesma família cujo registo clínico pode ser consultado */
async function canViewAdultPatient(db, req, patientUserId) {
  if (!patientUserId) return false;
  const u = await db.prepare('SELECT * FROM users WHERE id=? AND family_id=?').get(patientUserId, req.user.familyId);
  if (!u) return false;
  if (req.user.id === patientUserId) return true;
  if (req.user.role === 'child') return false;
  if (req.user.role === 'relative') return false;
  if (req.user.role === 'master') return true;
  if (req.user.role === 'parent' && u.role === 'parent') return true;
  return false;
}

/**
 * Paciente infantil OU adulto autorizado — retorna child_id obrigatório (FK real ou placeholder carrier) e patient_user_id.
 */
async function resolveMedicationPatient(db, req, res, body) {
  const hasChild = body.child_id && String(body.child_id).trim();
  const hasAdult = body.patient_user_id && String(body.patient_user_id).trim();
  if (hasChild && hasAdult) {
    res.status(400).json({ error: 'Informe apenas filho OU adulto como paciente' });
    return null;
  }
  if (!hasChild && !hasAdult) {
    res.status(400).json({ error: 'Selecione o paciente do medicamento' });
    return null;
  }
  if (hasChild) {
    if (!(await canViewChild(db, req, body.child_id))) {
      res.status(403).json({ error: 'Acesso negado' });
      return null;
    }
    if (req.user.role === 'relative' && !(await relativeLinked(db, req.user.id, body.child_id))) {
      res.status(403).json({ error: 'Acesso negado' });
      return null;
    }
    return { childFk: body.child_id, patientUserId: null };
  }
  if (!(await canViewAdultPatient(db, req, body.patient_user_id))) {
    res.status(403).json({ error: 'Acesso negado ao paciente adulto' });
    return null;
  }
  const childFk = await carrierOr400(db, req.user.familyId, res);
  if (!childFk) return null;
  return { childFk, patientUserId: body.patient_user_id };
}

function joinsPatient(alias) {
  return `
    LEFT JOIN users u_pat_${alias} ON u_pat_${alias}.id = ${alias}.patient_user_id
    LEFT JOIN children c_pat_${alias} ON COALESCE(${alias}.patient_user_id,'')='' AND c_pat_${alias}.id = ${alias}.child_id
  `;
}

function sqlPatientDisplay(alias) {
  return ` COALESCE(u_pat_${alias}.name, c_pat_${alias}.name) AS child_name `;
}

/**
 * Escopo paciente infantil/adulto; params extra após placeholders family_id já na query-base.
 */
async function healthScopeClause(db, req, queryParams, tblAlias) {
  const childParam = queryParams.child_id || null;
  const patientParam = queryParams.patient_user_id || null;

  if (patientParam && childParam) {
    return { err: [400, 'Use apenas patient_user_id ou child_id'] };
  }

  let clause = '';

  if (req.user.role === 'child') {
    const c = await childRow(db, req.user.id);
    if (!c) return { where: ' AND 1=0 ', extra: [], err: null };
    return { where: ` AND COALESCE(${tblAlias}.patient_user_id,'')='' AND ${tblAlias}.child_id=? `, extra: [c.id], err: null };
  }

  if (req.user.role === 'relative') {
    const links = await db.prepare('SELECT child_id FROM relative_children WHERE relative_user_id=?').all(req.user.id);
    const linkIds = links.map((x) => x.child_id);
    if (!linkIds.length) return { where: ' AND 1=0 ', extra: [], err: null };
    if (patientParam) {
      if (patientParam !== req.user.id) return { err: [403, 'Acesso negado'] };
      return { where: ` AND ${tblAlias}.patient_user_id=? `, extra: [patientParam], err: null };
    }
    if (childParam) {
      if (!(await relativeLinked(db, req.user.id, childParam))) return { err: [403, 'Acesso negado'] };
      return { where: ` AND COALESCE(${tblAlias}.patient_user_id,'')='' AND ${tblAlias}.child_id=? `, extra: [childParam], err: null };
    }
    const qm = linkIds.map(() => '?').join(',');
    return {
      where: ` AND (${tblAlias}.patient_user_id=? OR (COALESCE(${tblAlias}.patient_user_id,'')='' AND ${tblAlias}.child_id IN (${qm}))) `,
      extra: [req.user.id, ...linkIds],
      err: null,
    };
  }

  /** parent | master */
  if (patientParam) {
    if (!(await canViewAdultPatient(db, req, patientParam))) return { err: [403, 'Acesso negado'] };
    return { where: ` AND ${tblAlias}.patient_user_id=? `, extra: [patientParam], err: null };
  }
  if (childParam) {
    if (!(await canViewChild(db, req, childParam))) return { err: [403, 'Acesso negado'] };
    return { where: ` AND COALESCE(${tblAlias}.patient_user_id,'')='' AND ${tblAlias}.child_id=? `, extra: [childParam], err: null };
  }
  return { where: ` AND COALESCE(${tblAlias}.patient_user_id,'')='' `, extra: [], err: null };
}

async function canAccessMedication(db, req, med) {
  const fid = req.user.familyId;
  if (!med || med.family_id !== fid) return false;
  if (req.user.role === 'child') {
    const c = await childRow(db, req.user.id);
    return !!(c && !med.patient_user_id && med.child_id === c.id);
  }
  if (req.user.role === 'relative') {
    if (med.patient_user_id) return med.patient_user_id === req.user.id;
    return !!(med.child_id && (await relativeLinked(db, req.user.id, med.child_id)));
  }
  if (med.patient_user_id) return await canViewAdultPatient(db, req, med.patient_user_id);
  return !!(med.child_id && (await canViewChild(db, req, med.child_id)));
}

router.use(authMiddleware, requireModule('health'));

router.get('/context', async (req, res) => {
  try {
    const db = req.db;
    const fid = req.user.familyId;
    if (req.user.role === 'child') {
      return res.json({ scope: 'child', adults: [], children: [], selfPatientUserId: null });
    }

    const allChildren = await db.prepare('SELECT id, name FROM children WHERE family_id=? ORDER BY name').all(fid);
    if (req.user.role === 'relative') {
      const links = new Set(await db.prepare('SELECT child_id FROM relative_children WHERE relative_user_id=?').all(req.user.id).map((x) => x.child_id));
      const kids = allChildren.filter((c) => links.has(c.id));
      const me = await db.prepare('SELECT id, name FROM users WHERE id=?').get(req.user.id);
      return res.json({
        scope: 'relative',
        adults: me ? [{ id: me.id, name: me.name }] : [],
        children: kids,
        selfPatientUserId: req.user.id,
        showChildrenTab: kids.length > 0,
      });
    }

    const adults = await db.prepare("SELECT id, name, role FROM users WHERE family_id=? AND role IN ('parent','master') ORDER BY name").all(fid);
    res.json({
      scope: req.user.role,
      adults,
      children: allChildren,
      selfPatientUserId: req.user.id,
      showChildrenTab: allChildren.length > 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro' });
  }
});

router.post('/upload', async (req, res) => {
  if (!['parent', 'relative'].includes(req.user.role)) return res.status(403).json({ error: 'Sem permissão' });
  next();
}, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo ausente' });
    const finalPath = await optimizeHealthImage(req.file.path);
    const url = `/uploads/health/${path.basename(finalPath)}`;
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro no upload' });
  }
});

/** Visão geral + filtros opcionais child_id, from, to */
router.get('/overview', async (req, res) => {
  try {
    const db = req.db;
    const fid = req.user.familyId;
    const q = req.query;
    const { from, to } = q;
    if (!fid) return res.json({ upcomingAppointments: [], activeMedications: [], recentRecords: [], monitoring: [], alerts: [] });

    const apptScope = await healthScopeClause(db, req, q, 'a');
    if (apptScope.err) return res.status(apptScope.err[0]).json({ error: apptScope.err[1] });
    const medScope = await healthScopeClause(db, req, q, 'm');
    if (medScope.err) return res.status(medScope.err[0]).json({ error: medScope.err[1] });
    const recScope = await healthScopeClause(db, req, q, 'h');
    if (recScope.err) return res.status(recScope.err[0]).json({ error: recScope.err[1] });

    const dateClause = from ? ' AND a.appointment_date>=? ' : '';
    const dateClause2 = to ? ' AND a.appointment_date<=? ' : '';
    const apptParamsBase = [fid, ...apptScope.extra];
    const apptParams = [...apptParamsBase];
    if (from) apptParams.push(from);
    if (to) apptParams.push(to);

    const upcomingAppointments = await db.prepare(`
      SELECT a.*, ${sqlPatientDisplay('a')}
      FROM medical_appointments a
      ${joinsPatient('a')}
      WHERE a.family_id=? AND a.status='scheduled' AND a.appointment_date>=date('now') ${apptScope.where}${dateClause}${dateClause2}
      ORDER BY a.appointment_date, a.appointment_time LIMIT 8
    `).all(...apptParams);

    const medParams = [fid, ...medScope.extra];
    const activeMedications = await db.prepare(`
      SELECT m.*, ${sqlPatientDisplay('m')}
      FROM medications m
      ${joinsPatient('m')}
      WHERE m.family_id=? AND m.status='active' ${medScope.where}
      ORDER BY m.name LIMIT 12
    `).all(...medParams);

    const recParams = [fid, ...recScope.extra];
    const recentRecords = await db.prepare(`
      SELECT h.*, ${sqlPatientDisplay('h')}
      FROM health_records h
      ${joinsPatient('h')}
      WHERE h.family_id=? AND h.inactive=FALSE ${recScope.where}
      ORDER BY h.record_date DESC, h.record_time DESC LIMIT 10
    `).all(...recParams);

    const monitoring = await db.prepare(`
      SELECT h.*, ${sqlPatientDisplay('h')}
      FROM health_records h
      ${joinsPatient('h')}
      WHERE h.family_id=? AND h.status='monitoring' AND h.inactive=FALSE ${recScope.where}
      ORDER BY h.record_date DESC LIMIT 8
    `).all(...recParams);

    res.json({ upcomingAppointments, activeMedications, recentRecords, monitoring, alerts: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro' });
  }
});

// ----- Health records -----
router.get('/records', async (req, res) => {
  try {
    const db = req.db;
    const fid = req.user.familyId;
    const qu = req.query;
    const { status, record_type, from, to } = qu;
    const sc = await healthScopeClause(db, req, qu, 'h');
    if (sc.err) return res.status(sc.err[0]).json({ error: sc.err[1] });
    let qstr = `SELECT h.*, ${sqlPatientDisplay('h')} FROM health_records h ${joinsPatient('h')} WHERE h.family_id=? AND h.inactive=FALSE${sc.where}`;
    const p = [fid, ...sc.extra];
    if (status) { qstr += ' AND h.status=?'; p.push(status); }
    if (record_type) { qstr += ' AND h.record_type=?'; p.push(record_type); }
    if (from) { qstr += ' AND h.record_date>=?'; p.push(from); }
    if (to) { qstr += ' AND h.record_date<=?'; p.push(to); }
    qstr += ' ORDER BY h.record_date DESC, h.record_time DESC';
    res.json(await db.prepare(qstr).all(...p));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.post('/records', async (req, res) => {
  try {
    const db = req.db;
    const fid = req.user.familyId;
    const {
      child_id, record_type, symptoms, temperature, severity, status, notes, medication_given, stayed_home,
      record_date, record_time, attachment_urls,
    } = req.body;

    if (req.user.role === 'child') {
      const c = await childRow(db, req.user.id);
      if (!c) return res.status(400).json({ error: 'Perfil não encontrado' });
      const id = uuidv4();
      const today = new Date().toISOString().split('T')[0];
      await db.prepare(`
        INSERT INTO health_records (id,family_id,child_id,record_type,symptoms,temperature,severity,status,notes,medication_given,stayed_home,record_date,record_time,attachment_urls,created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        id, fid, c.id, record_type || 'other', symptoms || null, temperature ?? null,
        severity || 'mild', status || 'active', notes || null, medication_given || null, !!stayed_home,
        record_date || today,
        record_time || null, attachment_urls ? JSON.stringify(attachment_urls) : null, req.user.id,
      );
      await audit(db, req, 'health', 'child_symptom', `Registro sintoma filho ${c.id}`);
      return res.status(201).json(await db.prepare('SELECT * FROM health_records WHERE id=?').get(id));
    }

    if (!['parent', 'relative'].includes(req.user.role)) return res.status(403).json({ error: 'Sem permissão' });
    if (!record_type) return res.status(400).json({ error: 'Dados incompletos' });

    const { patient_user_id } = req.body;
    let childFk;
    let patientUserId = null;
    if (patient_user_id && String(patient_user_id).trim()) {
      if (!canViewAdultPatient(db, req, patient_user_id)) return res.status(403).json({ error: 'Acesso negado' });
      const car = carrierOr400(db, fid, res);
      if (!car) return;
      childFk = car;
      patientUserId = patient_user_id;
    } else if (child_id) {
      if (!(await canViewChild(db, req, child_id))) return res.status(403).json({ error: 'Acesso negado' });
      if (req.user.role === 'relative' && !(await relativeLinked(db, req.user.id, child_id))) return res.status(403).json({ error: 'Acesso negado' });
      childFk = child_id;
    } else {
      return res.status(400).json({ error: 'Selecione o paciente (filho ou adulto)' });
    }

    const id = uuidv4();
    await db.prepare(`
      INSERT INTO health_records (id,family_id,child_id,patient_user_id,record_type,symptoms,temperature,severity,status,notes,medication_given,stayed_home,record_date,record_time,attachment_urls,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id, fid, childFk, patientUserId,
      record_type, symptoms || null, temperature ?? null,
      severity || 'mild', status || 'active', notes || null, medication_given || null, !!stayed_home,
      record_date, record_time || null,
      attachment_urls ? (typeof attachment_urls === 'string' ? attachment_urls : JSON.stringify(attachment_urls)) : null,
      req.user.id,
    );
    await audit(db, req, 'health', 'create_record', id);
    res.status(201).json(await db.prepare('SELECT * FROM health_records WHERE id=?').get(id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro' });
  }
});

router.put('/records/:id', adultFamilyMember, async (req, res) => {
  try {
    const db = req.db;
    const row = await db.prepare('SELECT * FROM health_records WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!row) return res.status(404).json({ error: 'Não encontrado' });
    if (!canEditHealthRecord(db, req, row)) return res.status(403).json({ error: 'Sem permissão para editar este registro' });

    const {
      record_type, symptoms, temperature, severity, status, notes, medication_given, stayed_home,
      record_date, record_time, attachment_urls, inactive,
    } = req.body;
    await db.prepare(`
      UPDATE health_records SET
        record_type=COALESCE(?,record_type), symptoms=COALESCE(?,symptoms), temperature=COALESCE(?,temperature),
        severity=COALESCE(?,severity), status=COALESCE(?,status), notes=COALESCE(?,notes),
        medication_given=COALESCE(?,medication_given), stayed_home=COALESCE(?,stayed_home),
        record_date=COALESCE(?,record_date), record_time=COALESCE(?,record_time),
        attachment_urls=COALESCE(?,attachment_urls), inactive=COALESCE(?,inactive),
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      record_type, symptoms, temperature, severity, status, notes, medication_given,
      stayed_home !== undefined ? !!stayed_home : null,
      record_date, record_time,
      attachment_urls != null ? (typeof attachment_urls === 'string' ? attachment_urls : JSON.stringify(attachment_urls)) : null,
      inactive !== undefined ? !!inactive : null,
      req.params.id,
    );
    await audit(db, req, 'health', 'update_record', req.params.id);
    res.json(await db.prepare('SELECT * FROM health_records WHERE id=?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/records/:id', adultFamilyMember, async (req, res) => {
  try {
    const db = req.db;
    const row = await db.prepare('SELECT * FROM health_records WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!row) return res.status(404).json({ error: 'Não encontrado' });
    if (!isGestor(req) && row.created_by !== req.user.id) return res.status(403).json({ error: 'Sem permissão' });
    await db.prepare('UPDATE health_records SET inactive=TRUE, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(req.params.id);
    await audit(db, req, 'health', 'soft_delete_record', req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// ----- Appointments -----
router.get('/appointments', async (req, res) => {
  try {
    const db = req.db;
    const fid = req.user.familyId;
    const qu = req.query;
    const { status, from, to } = qu;
    const sc = await healthScopeClause(db, req, qu, 'a');
    if (sc.err) return res.status(sc.err[0]).json({ error: sc.err[1] });
    let q = `SELECT a.*, ${sqlPatientDisplay('a')} FROM medical_appointments a ${joinsPatient('a')} WHERE a.family_id=? ${sc.where} `;
    const p = [fid, ...sc.extra];
    if (status) { q += ' AND a.status=?'; p.push(status); }
    if (from) { q += ' AND a.appointment_date>=?'; p.push(from); }
    if (to) { q += ' AND a.appointment_date<=?'; p.push(to); }
    q += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC';
    res.json(await db.prepare(q).all(...p));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.post('/appointments', adultFamilyMember, async (req, res) => {
  try {
    const db = req.db;
    const fid = req.user.familyId;
    const {
      child_id,
      patient_user_id,
      appointment_date, appointment_time, specialty, professional_name, location,
      reason, diagnosis_notes, needs_followup, followup_date, status, attachment_urls,
    } = req.body;
    if (!appointment_date) return res.status(400).json({ error: 'Dados incompletos' });
    let childFk;
    let patientUid = null;
    if (patient_user_id && String(patient_user_id).trim()) {
      if (!(await canViewAdultPatient(db, req, patient_user_id))) return res.status(403).json({ error: 'Acesso negado' });
      const car = await carrierOr400(db, fid, res);
      if (!car) return;
      childFk = car;
      patientUid = patient_user_id;
    } else if (child_id) {
      if (!(await assertChildFamily(db, child_id, fid))) return res.status(400).json({ error: 'Filho inválido' });
      if (!(await canViewChild(db, req, child_id))) return res.status(403).json({ error: 'Acesso negado' });
      if (req.user.role === 'relative' && !(await relativeLinked(db, req.user.id, child_id))) return res.status(403).json({ error: 'Acesso negado' });
      childFk = child_id;
    } else {
      return res.status(400).json({ error: 'Selecione o paciente da consulta' });
    }

    const id = uuidv4();
    await db.prepare(`
      INSERT INTO medical_appointments (id,family_id,child_id,patient_user_id,appointment_date,appointment_time,specialty,professional_name,location,reason,diagnosis_notes,needs_followup,followup_date,status,attachment_urls,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id, fid, childFk, patientUid, appointment_date, appointment_time || null, specialty || null, professional_name || null,
      location || null, reason || null, diagnosis_notes || null, !!needs_followup, followup_date || null,
      status || 'scheduled', attachment_urls ? JSON.stringify(attachment_urls) : null, req.user.id,
    );
    await audit(db, req, 'health', 'create_appointment', id);
    res.status(201).json(await db.prepare('SELECT * FROM medical_appointments WHERE id=?').get(id));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.put('/appointments/:id', adultFamilyMember, async (req, res) => {
  try {
    const db = req.db;
    const row = await db.prepare('SELECT * FROM medical_appointments WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!row) return res.status(404).json({ error: 'Não encontrado' });
    if (!canEditHealthRecord(db, req, row)) return res.status(403).json({ error: 'Sem permissão' });
    const u = req.body;
    const fid = req.user.familyId;
    let nextChildFk = row.child_id;
    let nextPatientUid = row.patient_user_id;
    if (Object.prototype.hasOwnProperty.call(u, 'patient_user_id') || Object.prototype.hasOwnProperty.call(u, 'child_id')) {
      const pu = u.patient_user_id;
      if (pu != null && String(pu).trim() !== '') {
        if (!(await canViewAdultPatient(db, req, pu))) return res.status(403).json({ error: 'Acesso negado' });
        const car = await carrierOr400(db, fid, res);
        if (!car) return;
        nextChildFk = car;
        nextPatientUid = pu;
      } else if (u.child_id) {
        if (!(await assertChildFamily(db, u.child_id, fid))) return res.status(400).json({ error: 'Filho inválido' });
        if (!(await canViewChild(db, req, u.child_id))) return res.status(403).json({ error: 'Acesso negado' });
        if (req.user.role === 'relative' && !(await relativeLinked(db, req.user.id, u.child_id))) return res.status(403).json({ error: 'Acesso negado' });
        nextChildFk = u.child_id;
        nextPatientUid = null;
      }
    }
    await db.prepare(`
      UPDATE medical_appointments SET
        child_id=?, patient_user_id=?,
        appointment_date=COALESCE(?,appointment_date), appointment_time=COALESCE(?,appointment_time),
        specialty=COALESCE(?,specialty), professional_name=COALESCE(?,professional_name), location=COALESCE(?,location),
        reason=COALESCE(?,reason), diagnosis_notes=COALESCE(?,diagnosis_notes),
        needs_followup=COALESCE(?,needs_followup), followup_date=COALESCE(?,followup_date),
        status=COALESCE(?,status), attachment_urls=COALESCE(?,attachment_urls),
        updated_at=datetime('now')
      WHERE id=?
    `).run(
      nextChildFk, nextPatientUid,
      u.appointment_date, u.appointment_time, u.specialty, u.professional_name, u.location, u.reason, u.diagnosis_notes,
      u.needs_followup !== undefined ? !!u.needs_followup : null, u.followup_date, u.status,
      u.attachment_urls != null ? JSON.stringify(u.attachment_urls) : null, req.params.id,
    );
    res.json(await db.prepare('SELECT * FROM medical_appointments WHERE id=?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/appointments/:id', adultFamilyMember, async (req, res) => {
  try {
    const db = req.db;
    const row = await db.prepare('SELECT * FROM medical_appointments WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!row) return res.status(404).json({ error: 'Não encontrado' });
    if (!isGestor(req) && row.created_by !== req.user.id) return res.status(403).json({ error: 'Sem permissão' });
    await db.prepare('DELETE FROM medical_appointments WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// ----- Medications -----
router.get('/medications', async (req, res) => {
  try {
    const db = req.db;
    const fid = req.user.familyId;
    const qu = req.query;
    const { status } = qu;
    const sc = healthScopeClause(db, req, qu, 'm');
    if (sc.err) return res.status(sc.err[0]).json({ error: sc.err[1] });
    let q = `SELECT m.*, ${sqlPatientDisplay('m')} FROM medications m ${joinsPatient('m')} WHERE m.family_id=? ${sc.where} `;
    const p = [fid, ...sc.extra];
    if (status) { q += ' AND m.status=?'; p.push(status); }
    q += ' ORDER BY m.name';
    res.json(await db.prepare(q).all(...p));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.post('/medications', adultFamilyMember, async (req, res) => {
  try {
    const db = req.db;
    const fid = req.user.familyId;
    const {
      name, dosage, frequency, start_date, end_date, notes, prescription_image_url, attachment_urls, status,
    } = req.body;
    const resolved = await resolveMedicationPatient(db, req, res, req.body);
    if (!resolved) return;
    if (!name) return res.status(400).json({ error: 'Dados incompletos' });

    const st = normalizeMedicationStatus(status);

    const times = normalizeScheduledTimes(req.body);
    const scheduled_times_json = times.length ? JSON.stringify(times) : null;
    const scheduled_time = times[0] || null;
    const id = uuidv4();
    await db.prepare(`
      INSERT INTO medications (id,family_id,child_id,patient_user_id,name,dosage,frequency,start_date,end_date,scheduled_time,scheduled_times,notes,prescription_image_url,attachment_urls,status,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id, fid, resolved.childFk, resolved.patientUserId, name, dosage || null, frequency || null, start_date || null, end_date || null,
      scheduled_time, scheduled_times_json, notes || null, prescription_image_url || null,
      attachment_urls != null ? (typeof attachment_urls === 'string' ? attachment_urls : JSON.stringify(attachment_urls)) : null,
      st, req.user.id,
    );
    await syncMedicationReminderTasks(db, id);
    res.status(201).json(await db.prepare('SELECT * FROM medications WHERE id=?').get(id));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.put('/medications/:id', adultFamilyMember, async (req, res) => {
  try {
    const db = req.db;
    const row = await db.prepare('SELECT * FROM medications WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!row) return res.status(404).json({ error: 'Não encontrado' });
    if (!canEditHealthRecord(db, req, row)) return res.status(403).json({ error: 'Sem permissão' });
    const u = req.body;
    const updatingSchedule = Object.prototype.hasOwnProperty.call(u, 'scheduled_times')
      || Object.prototype.hasOwnProperty.call(u, 'scheduled_time');
    let scheduled_time_val = row.scheduled_time;
    let scheduled_times_val = row.scheduled_times;
    if (updatingSchedule) {
      const times = normalizeScheduledTimes(u);
      scheduled_time_val = times[0] || null;
      scheduled_times_val = times.length ? JSON.stringify(times) : null;
    }
    let nextStatus = u.status !== undefined ? normalizeMedicationStatus(u.status) : null;
    let nextChildFk = row.child_id;
    let nextPatUid = row.patient_user_id;
    if (Object.prototype.hasOwnProperty.call(u, 'patient_user_id') || Object.prototype.hasOwnProperty.call(u, 'child_id')) {
      const resolved = await resolveMedicationPatient(db, req, res, u);
      if (!resolved) return;
      nextChildFk = resolved.childFk;
      nextPatUid = resolved.patientUserId;
    }
    await db.prepare(`
      UPDATE medications SET
        child_id=?, patient_user_id=?,
        name=COALESCE(?,name), dosage=COALESCE(?,dosage), frequency=COALESCE(?,frequency),
        start_date=COALESCE(?,start_date), end_date=COALESCE(?,end_date),
        scheduled_time=?, scheduled_times=?,
        notes=COALESCE(?,notes), prescription_image_url=COALESCE(?,prescription_image_url),
        attachment_urls=COALESCE(?,attachment_urls), status=COALESCE(?,status),
        updated_at=datetime('now')
      WHERE id=?
    `).run(
      nextChildFk, nextPatUid,
      u.name, u.dosage, u.frequency, u.start_date, u.end_date,
      scheduled_time_val,
      scheduled_times_val,
      u.notes, u.prescription_image_url,
      u.attachment_urls != null ? (typeof u.attachment_urls === 'string' ? u.attachment_urls : JSON.stringify(u.attachment_urls)) : null,
      nextStatus,
      req.params.id,
    );
    await syncMedicationReminderTasks(db, req.params.id);
    res.json(await db.prepare('SELECT * FROM medications WHERE id=?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/medications/:id', adultFamilyMember, async (req, res) => {
  try {
    const db = req.db;
    const row = await db.prepare('SELECT * FROM medications WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!row) return res.status(404).json({ error: 'Não encontrado' });
    if (!isGestor(req) && row.created_by !== req.user.id) return res.status(403).json({ error: 'Sem permissão' });
    await removeMedicationTasks(db, req.params.id);
    await db.prepare('DELETE FROM medications WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// ----- Medication logs -----
router.get('/medication-logs', async (req, res) => {
  try {
    const db = req.db;
    const fid = req.user.familyId;
    const qu = req.query;
    const { medication_id, from, to } = qu;
    const sc = await healthScopeClause(db, req, qu, 'm');
    if (sc.err) return res.status(sc.err[0]).json({ error: sc.err[1] });
    let q = `SELECT l.*, m.name AS medication_name, ${sqlPatientDisplay('m')} FROM medication_logs l
      JOIN medications m ON m.id = l.medication_id
      ${joinsPatient('m')}
      WHERE l.family_id=? ${sc.where}`;
    const p = [fid, ...sc.extra];
    if (medication_id) { q += ' AND l.medication_id=?'; p.push(medication_id); }
    if (from) { q += ' AND l.taken_date>=?'; p.push(from); }
    if (to) { q += ' AND l.taken_date<=?'; p.push(to); }
    q += ' ORDER BY l.taken_date DESC, l.taken_time DESC LIMIT 200';
    res.json(await db.prepare(q).all(...p));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.post('/medication-logs', async (req, res) => {
  try {
    const db = req.db;
    const fid = req.user.familyId;
    const { medication_id, taken_date, taken_time, status, notes } = req.body;
    if (!medication_id || !taken_date) return res.status(400).json({ error: 'Dados incompletos' });
    const med = await db.prepare('SELECT * FROM medications WHERE id=? AND family_id=?').get(medication_id, fid);
    if (!med) return res.status(404).json({ error: 'Medicamento não encontrado' });
    if (!(await canAccessMedication(db, req, med))) return res.status(403).json({ error: 'Acesso negado' });

    const id = uuidv4();
    await db.prepare(`
      INSERT INTO medication_logs (id,family_id,child_id,patient_user_id,medication_id,taken_date,taken_time,status,notes,registered_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      id, fid, med.child_id, med.patient_user_id || null, medication_id,
      taken_date, taken_time || null, status || 'taken', notes || null, req.user.id,
    );
    res.status(201).json(await db.prepare('SELECT * FROM medication_logs WHERE id=?').get(id));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/medication-logs/:id', parentOnly, async (req, res) => {
  try {
    const db = req.db;
    const row = await db.prepare('SELECT * FROM medication_logs WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!row) return res.status(404).json({ error: 'Não encontrado' });
    const med = await db.prepare('SELECT * FROM medications WHERE id=?').get(row.medication_id);
    if (!canEditHealthRecord(db, req, med)) return res.status(403).json({ error: 'Sem permissão' });
    await db.prepare('DELETE FROM medication_logs WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;
