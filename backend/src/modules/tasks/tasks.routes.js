const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../../middleware/auth');
const { parentOnly } = require('../../middleware/permissions');
const { requireModule, isEnabled } = require('../../middleware/familyModule');
const { getCalendarDateYMD, getCalendarMonthYearFromYmd } = require('../../lib/calendarDate');

// Helper: get child from user
async function getChildFromUser(db, userId) {
  return await db.prepare('SELECT * FROM children WHERE user_id=?').get(userId);
}

async function relativeLinkedToChild(db, relativeUserId, childId) {
  return await db.prepare('SELECT 1 FROM relative_children WHERE relative_user_id=? AND child_id=?').get(relativeUserId, childId);
}

/** Quem pode concluir / marcar lembrete de medicamento nesta ocorrência */
async function canOperateOccurrence(db, req, occ, task) {
  if (!occ || occ.family_id !== req.user.familyId) return false;
  if (req.user.role === 'master') return true;

  if (task.is_health_reminder) {
    if (task.assignee_user_id) {
      const sameFam = !!await db.prepare('SELECT 1 FROM users WHERE id=? AND family_id=?').get(task.assignee_user_id, req.user.familyId);
      if (!sameFam) return false;
      if (req.user.id === task.assignee_user_id || req.user.role === 'parent') return true;
      return false;
    }
    /** Medicamento ligado à criança (sem assignee específico) */
    if (req.user.role === 'child') {
      const c = await getChildFromUser(db, req.user.id);
      return !!(c && String(c.id) === String(occ.child_id));
    }
    if (req.user.role === 'parent') return true;
    if (req.user.role === 'relative') return !!await relativeLinkedToChild(db, req.user.id, occ.child_id);
    return false;
  }

  if (req.user.role === 'child') {
    const c = await getChildFromUser(db, req.user.id);
    return !!(c && String(c.id) === String(occ.child_id));
  }

  return true;
}

router.use(authMiddleware, requireModule('tasks'));

// GET /api/tasks — template tasks (models)
router.get('/', async (req, res) => {
  try {
    const db = req.db;
    const { child_id, status, type, is_recurring } = req.query;
    let query = `
      SELECT t.*, c.name as child_name, c.color as child_color,
      r.affects_allowance, r.bonus_amount, r.discount_amount, r.apply_discount_if_late
      FROM tasks t 
      JOIN children c ON t.child_id = c.id 
      LEFT JOIN task_allowance_rules r ON t.id = r.task_id
      WHERE t.family_id = ?
    `;
    const params = [req.user.familyId];
    if (req.user.role === 'child') {
      const child = await getChildFromUser(db, req.user.id);
      if (child) { query += ' AND t.child_id = ?'; params.push(child.id); }
    } else if (child_id) { query += ' AND t.child_id = ?'; params.push(child_id); }
    if (status) { query += ' AND t.status = ?'; params.push(status); }
    if (type) { query += ' AND t.type = ?'; params.push(type); }
    if (is_recurring !== undefined) { query += ' AND t.is_recurring = ?'; params.push(is_recurring === 'true'); }
    query += ' ORDER BY t.created_at DESC';
    res.json(await db.prepare(query).all(...params));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao listar tarefas' }); }
});

// GET /api/tasks/occurrences — today's occurrences
router.get('/occurrences', async (req, res) => {
  try {
    const db = req.db;
    const { child_id, date, status } = req.query;
    const targetDate = date ? String(date).slice(0, 10) : getCalendarDateYMD(new Date());

    let query = `
      SELECT oc.*, t.title, t.description, t.type, t.points, t.coins, t.priority,
             t.due_time, t.requires_approval, t.affects_allowance,
             t.is_recurring, t.frequency,
             COALESCE(t.is_health_reminder, FALSE) as is_health_reminder,
             t.assignee_user_id,
             t.source_medication_id,
             r.bonus_amount, r.discount_amount,
             c.name as child_name, c.color as child_color, c.avatar_preset, c.avatar_url,
             assignee_u.name as assignee_name
      FROM task_occurrences oc
      JOIN tasks t ON oc.task_id = t.id
      LEFT JOIN children c ON oc.child_id = c.id
      LEFT JOIN users assignee_u ON t.assignee_user_id = assignee_u.id
      LEFT JOIN task_allowance_rules r ON t.id = r.task_id
      WHERE oc.family_id = ?
    `;
    const params = [req.user.familyId];

    if (req.user.role === 'child') {
      const child = await getChildFromUser(db, req.user.id);
      if (child) {
        query += " AND oc.child_id = ? AND COALESCE(t.assignee_user_id, '') = ''";
        params.push(child.id);
      }
    } else if (child_id) {
      query += " AND oc.child_id = ? AND COALESCE(t.assignee_user_id, '') = ''";
      params.push(child_id);
    } else if (req.user.role === 'relative') {
      query += ` AND (
        t.assignee_user_id = ?
        OR (
          COALESCE(t.assignee_user_id, '') = ''
          AND EXISTS (SELECT 1 FROM relative_children rc WHERE rc.relative_user_id = ? AND rc.child_id = oc.child_id)
        )
      )`;
      params.push(req.user.id, req.user.id);
    } else if (req.user.role === 'parent') {
      query += " AND (COALESCE(t.assignee_user_id, '') = '' OR t.assignee_user_id = ?)";
      params.push(req.user.id);
    }

    query += ' AND oc.occurrence_date = ?';
    params.push(targetDate);

    if (status) { query += ' AND oc.status = ?'; params.push(status); }
    query += ' ORDER BY t.due_time ASC, oc.created_at DESC';

    res.json(await db.prepare(query).all(...params));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao listar ocorrências' }); }
});

// POST /api/tasks — create task template
router.post('/', async (req, res) => {
  try {
    const db = req.db;
    const { 
      title, description, type, category, points, coins, 
      frequency, deadline, priority, child_id, allowance_rule,
      is_recurring, recurrence_days, start_date, end_date, due_time,
      requires_approval, visible_on_calendar, generate_notification
    } = req.body;
    const id = uuidv4();

    let targetChildId = child_id;
    if (req.user.role === 'child') {
      const child = await getChildFromUser(db, req.user.id);
      if (!child) return res.status(400).json({ error: 'Perfil de filho não encontrado' });
      targetChildId = child.id;
    } else if (!child_id) {
      return res.status(400).json({ error: 'Selecione um filho' });
    }

    // Validate: recurring tasks need due_time
    if (is_recurring && frequency !== 'once' && !due_time) {
      return res.status(400).json({ error: 'Tarefas recorrentes exigem um horário limite (due_time).' });
    }

    const wantsRoutine = !!(is_recurring || (frequency && frequency !== 'once'));
    if (wantsRoutine && !isEnabled(db, req.user.familyId, 'routines')) {
      return res.status(403).json({
        error: 'O módulo Rotinas está desativado para esta família',
        code: 'MODULE_DISABLED',
        module: 'routines',
      });
    }

    await db.prepare(`INSERT INTO tasks 
      (id, title, description, type, category, points, coins, frequency, deadline, priority, child_id, family_id,
       is_recurring, recurrence_days, start_date, end_date, due_time, created_by, requires_approval, affects_allowance, visible_on_calendar, generate_notification)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, title, description || null, type || 'home', category || null,
      req.user.role === 'child' ? 0 : (points || 10),
      coins || 0, frequency || 'once', deadline || null, priority || 'medium',
      targetChildId, req.user.familyId,
      !!is_recurring, recurrence_days || null, start_date || null, end_date || null, due_time || null,
      req.user.id,
      requires_approval !== false,
      !!(allowance_rule?.affects_allowance),
      !!visible_on_calendar,
      generate_notification !== false
    );

    if (allowance_rule && allowance_rule.affects_allowance) {
      await db.prepare('INSERT INTO task_allowance_rules (id, task_id, affects_allowance, bonus_amount, discount_amount, apply_discount_if_late) VALUES (?,?,?,?,?,?)').run(
        uuidv4(), id, true, allowance_rule.bonus_amount || 0, allowance_rule.discount_amount || 0, !!allowance_rule.apply_discount_if_late
      );
    }

    // For one-time tasks, create a single occurrence immediately
    if (!is_recurring || frequency === 'once') {
      const occDate = start_date || new Date().toISOString().split('T')[0];
      const dueDatetime = due_time ? `${occDate}T${due_time}:00` : null;
      try {
        await db.prepare(`INSERT OR IGNORE INTO task_occurrences (id, task_id, family_id, child_id, occurrence_date, due_datetime, status) VALUES (?,?,?,?,?,?,'pending')`).run(
          uuidv4(), id, req.user.familyId, targetChildId, occDate, dueDatetime
        );
      } catch(e) {}
    } else {
      // Generate today's occurrence immediately for recurring tasks
      const { generateTaskOccurrences } = require('../../cron/taskGenerator');
      setTimeout(() => generateTaskOccurrences(db), 100);
    }

    // Notify child of new task
    if (req.user.role !== 'child' && isEnabled(db, req.user.familyId, 'notifications')) {
      await db.prepare('INSERT INTO notifications (id,title,message,type,icon,child_id,family_id) VALUES (?,?,?,?,?,?,?)').run(
        uuidv4(), 'Nova tarefa!', `"${title}" foi adicionada!`, 'task', '📋', targetChildId, req.user.familyId
      );
    }

    res.status(201).json(await db.prepare('SELECT t.*,c.name as child_name,c.color as child_color FROM tasks t JOIN children c ON t.child_id=c.id WHERE t.id=?').get(id));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao criar tarefa' }); }
});

// PUT /api/tasks/:id — update task template
router.put('/:id', parentOnly, async (req, res) => {
  try {
    const db = req.db;
    const task = await db.prepare('SELECT * FROM tasks WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });

    const { title, description, type, points, coins, frequency, deadline, priority,
      is_recurring, recurrence_days, start_date, end_date, due_time,
      requires_approval, visible_on_calendar, allowance_rule, status } = req.body;

    const nextRecurring = is_recurring !== undefined ? !!is_recurring : !!task.is_recurring;
    const nextFreq = frequency !== undefined ? frequency : task.frequency;
    const wantsRoutine = !!(nextRecurring || (nextFreq && nextFreq !== 'once'));
    if (wantsRoutine && !isEnabled(db, req.user.familyId, 'routines')) {
      return res.status(403).json({
        error: 'O módulo Rotinas está desativado para esta família',
        code: 'MODULE_DISABLED',
        module: 'routines',
      });
    }
    const nextDue = due_time !== undefined ? due_time : task.due_time;
    if (wantsRoutine && nextFreq !== 'once' && !nextDue) {
      return res.status(400).json({ error: 'Tarefas recorrentes exigem um horário limite (due_time).' });
    }

    await db.prepare(`UPDATE tasks SET 
      title=COALESCE(?,title), description=COALESCE(?,description), type=COALESCE(?,type),
      points=COALESCE(?,points), coins=COALESCE(?,coins), frequency=COALESCE(?,frequency),
      deadline=COALESCE(?,deadline), priority=COALESCE(?,priority), status=COALESCE(?,status),
      is_recurring=COALESCE(?,is_recurring), recurrence_days=COALESCE(?,recurrence_days),
      start_date=COALESCE(?,start_date), end_date=COALESCE(?,end_date), due_time=COALESCE(?,due_time),
      requires_approval=COALESCE(?,requires_approval), visible_on_calendar=COALESCE(?,visible_on_calendar),
      updated_at=CURRENT_TIMESTAMP
      WHERE id=?`).run(
      title, description, type, points, coins, frequency, deadline, priority, status,
      is_recurring !== undefined ? !!is_recurring : null,
      recurrence_days, start_date, end_date, due_time,
      requires_approval !== undefined ? !!requires_approval : null,
      visible_on_calendar !== undefined ? !!visible_on_calendar : null,
      req.params.id
    );

    if (allowance_rule) {
      const existing = await db.prepare('SELECT id FROM task_allowance_rules WHERE task_id=?').get(req.params.id);
      if (existing) {
        await db.prepare('UPDATE task_allowance_rules SET affects_allowance=?, bonus_amount=?, discount_amount=? WHERE task_id=?')
          .run(!!allowance_rule.affects_allowance, allowance_rule.bonus_amount || 0, allowance_rule.discount_amount || 0, req.params.id);
      } else if (allowance_rule.affects_allowance) {
        await db.prepare('INSERT INTO task_allowance_rules (id, task_id, affects_allowance, bonus_amount, discount_amount) VALUES (?,?,?,?,?)')
          .run(uuidv4(), req.params.id, true, allowance_rule.bonus_amount || 0, allowance_rule.discount_amount || 0);
      }
    }

    res.json(await db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao atualizar tarefa' }); }
});

// PUT /api/tasks/occurrences/:id/complete — child marks occurrence as done
router.put('/occurrences/:id/complete', async (req, res) => {
  try {
    const db = req.db;
    const occ = await db.prepare('SELECT * FROM task_occurrences WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!occ) return res.status(404).json({ error: 'Ocorrência não encontrada' });
    if (!['pending', 'in_progress', 'delayed'].includes(occ.status)) {
      return res.status(400).json({ error: 'Ocorrência já processada' });
    }

    const task = await db.prepare('SELECT * FROM tasks WHERE id=?').get(occ.task_id);

    if (task.is_health_reminder) {
      const raw = req.body.health_intake ?? req.body.intake;
      if (raw == null || raw === '') {
        return res.status(400).json({ error: 'Informe health_intake: taken ou skipped.' });
      }
      let intake;
      if (raw === 'skipped' || raw === false || raw === 'não' || raw === 'nao' || raw === 'not_taken') intake = 'skipped';
      else if (raw === 'taken' || raw === true) intake = 'taken';
      else {
        return res.status(400).json({ error: 'Informe health_intake: taken ou skipped.' });
      }
      if (!await canOperateOccurrence(db, req, occ, task)) {
        return res.status(403).json({ error: 'Acesso negado' });
      }
      await db.prepare(`UPDATE task_occurrences SET status='completed', health_intake=?, health_confirmed_by=?, completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, points_awarded=0 WHERE id=?`).run(intake, req.user.id, occ.id);

      if (task.source_medication_id) {
        const med = await db.prepare('SELECT * FROM medications WHERE id=?').get(task.source_medication_id);
        if (med && med.family_id === req.user.familyId) {
          let takenTime = task.due_time || null;
          if (occ.due_datetime && typeof occ.due_datetime === 'string') {
            const part = occ.due_datetime.includes('T') ? occ.due_datetime.split('T')[1] : '';
            if (part) takenTime = part.slice(0, 5);
          }
          const logStatus = intake === 'taken' ? 'taken' : 'skipped';
          await db.prepare(`
            INSERT INTO medication_logs (id,family_id,child_id,patient_user_id,medication_id,taken_date,taken_time,status,notes,registered_by)
            VALUES (?,?,?,?,?,?,?,?,?,?)
          `).run(uuidv4(), med.family_id, med.child_id, med.patient_user_id || null, med.id,
            occ.occurrence_date, takenTime || null, logStatus, null, req.user.id);
        }
      }
      return res.json({ message: 'Registo de medicamento guardado', status: 'completed', health_intake: intake });
    }

    if (req.user.role === 'child') {
      const child = await getChildFromUser(db, req.user.id);
      if (!child || child.id !== occ.child_id) return res.status(403).json({ error: 'Acesso negado' });
    }

    const newStatus = task.requires_approval ? 'waiting_approval' : 'completed';

    await db.prepare(`UPDATE task_occurrences SET status=?, completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(newStatus, occ.id);

    if (!task.requires_approval) {
      // Auto-approve: give points
      await awardPoints(db, occ, task, req.user);
    } else {
      // Notify parents for approval
      if (await isEnabled(db, req.user.familyId, 'notifications')) {
        const parents = await db.prepare("SELECT id FROM users WHERE family_id=? AND role IN ('parent','master')").all(req.user.familyId);
        const child = await db.prepare('SELECT name FROM children WHERE id=?').get(occ.child_id);
        for (const p of parents) {
          await db.prepare('INSERT INTO notifications (id,title,message,type,icon,user_id,family_id) VALUES (?,?,?,?,?,?,?)').run(
            uuidv4(), 'Tarefa aguarda aprovação!', `${child?.name} concluiu "${task.title}"`, 'task', '⏳', p.id, req.user.familyId
          );
        }
      }
    }

    res.json({ message: 'Ocorrência atualizada', status: newStatus });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao completar ocorrência' }); }
});

// PUT /api/tasks/occurrences/:id/approve — parent approves/rejects occurrence
router.put('/occurrences/:id/approve', parentOnly, async (req, res) => {
  try {
    const db = req.db;
    const { approved, rejection_reason } = req.body;
    const occ = await db.prepare('SELECT * FROM task_occurrences WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!occ) return res.status(404).json({ error: 'Ocorrência não encontrada' });

    const task = await db.prepare('SELECT * FROM tasks WHERE id=?').get(occ.task_id);

    if (approved) {
      if (occ.status !== 'waiting_approval') {
        return res.status(400).json({ error: 'Esta ocorrência não está aguardando aprovação' });
      }
      await db.prepare(`UPDATE task_occurrences SET status='approved', approved_at=CURRENT_TIMESTAMP, approved_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(req.user.id, occ.id);
      if (!task.is_health_reminder) await awardPoints(db, occ, task, req.user);
    } else {
      if (occ.status !== 'waiting_approval') {
        return res.status(400).json({ error: 'Esta ocorrência não está aguardando reprovação' });
      }
      await db.prepare(`UPDATE task_occurrences SET status='rejected', rejected_at=CURRENT_TIMESTAMP, rejected_by=?, rejection_reason=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(req.user.id, rejection_reason || null, occ.id);
      // Apply discount if rule exists
      const rule = await db.prepare('SELECT * FROM task_allowance_rules WHERE task_id=?').get(task.id);
      if (rule && rule.affects_allowance && rule.discount_amount > 0) {
        await applyAllowanceDebit(db, occ, task, rule, req.user);
      }
      if (await isEnabled(db, req.user.familyId, 'notifications')) {
        await db.prepare('INSERT INTO notifications (id,title,message,type,icon,child_id,family_id) VALUES (?,?,?,?,?,?,?)').run(
          uuidv4(), 'Tarefa reprovada', `"${task.title}" foi reprovada.${rejection_reason ? ' Motivo: ' + rejection_reason : ''}`, 'task', '❌', occ.child_id, req.user.familyId
        );
      }
    }

    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao aprovar ocorrência' }); }
});

// PUT /api/tasks/:id/complete — LEGACY: mark old task complete (backward compat)
router.put('/:id/complete', async (req, res) => {
  try {
    const db = req.db;
    const task = await db.prepare('SELECT * FROM tasks WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
    if (task.status !== 'pending') return res.status(400).json({ error: 'Tarefa já processada' });

    if (req.user.role === 'child') {
      const child = await getChildFromUser(db, req.user.id);
      if (!child || child.id !== task.child_id) return res.status(403).json({ error: 'Acesso negado' });
    }

    await db.prepare("UPDATE tasks SET status='completed', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id);

    if (await isEnabled(db, req.user.familyId, 'notifications')) {
      const parents = await db.prepare("SELECT id FROM users WHERE family_id=? AND role='parent'").all(req.user.familyId);
      const child = await db.prepare('SELECT name FROM children WHERE id=?').get(task.child_id);
      for (const p of parents) {
        await db.prepare('INSERT INTO notifications (id,title,message,type,icon,user_id,family_id) VALUES (?,?,?,?,?,?,?)').run(
          uuidv4(), 'Tarefa concluída!', `${child?.name} concluiu "${task.title}"`, 'task', '✅', p.id, req.user.familyId
        );
      }
    }
    res.json({ message: 'Tarefa marcada como concluída' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao completar tarefa' }); }
});

// PUT /api/tasks/:id/approve — LEGACY: approve old-style tasks
router.put('/:id/approve', parentOnly, async (req, res) => {
  try {
    const { approved, rejection_reason } = req.body;
    const db = req.db;
    const task = await db.prepare('SELECT * FROM tasks WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
    const newStatus = approved ? 'approved' : 'rejected';
    await db.prepare("UPDATE tasks SET status=?, approved_by=?, approved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(newStatus, req.user.id, req.params.id);

    if (approved) {
      const child = await db.prepare('SELECT * FROM children WHERE id=?').get(task.child_id);
      if (child) {
        const newPts = child.points + task.points;
        const newCoins = child.coins + (task.coins || 0);
        let xp = child.xp + task.points, level = child.level, xpNext = child.xp_next_level;
        while (xp >= xpNext) { xp -= xpNext; level++; xpNext = level * 100; }
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        let streak = child.streak_last_date !== today ? (child.streak_last_date === yesterday ? child.streak_current + 1 : 1) : child.streak_current;
        await db.prepare("UPDATE children SET points=?,coins=?,level=?,xp=?,xp_next_level=?,streak_current=?,streak_best=?,streak_last_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .run(newPts, newCoins, level, xp, xpNext, streak, Math.max(child.streak_best, streak), today, task.child_id);
        await db.prepare('INSERT INTO history (id,event,points,coins,type,child_id,family_id) VALUES (?,?,?,?,?,?,?)').run(uuidv4(), `Tarefa: ${task.title}`, task.points, task.coins || 0, 'task', task.child_id, req.user.familyId);
        
        const rule = await db.prepare('SELECT * FROM task_allowance_rules WHERE task_id=?').get(task.id);
        if (rule && rule.affects_allowance && rule.bonus_amount > 0) {
          const now = new Date();
          const cycle = await db.prepare("SELECT id FROM allowance_cycles WHERE child_id=? AND month=? AND year=? AND status='open'").get(task.child_id, now.getMonth() + 1, now.getFullYear());
          if (cycle) {
            await db.prepare("INSERT INTO allowance_transactions (id, child_id, family_id, cycle_id, task_id, type, origin, description, amount, status, approved_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
              uuidv4(), task.child_id, req.user.familyId, cycle.id, task.id, 'credit', 'task', `Bônus da tarefa: ${task.title}`, rule.bonus_amount, 'approved', req.user.id
            );
            await db.prepare("UPDATE allowance_cycles SET total_bonus = total_bonus + ? WHERE id=?").run(rule.bonus_amount, cycle.id);
          }
        }

        if (await isEnabled(db, req.user.familyId, 'notifications')) {
          await db.prepare('INSERT INTO notifications (id,title,message,type,icon,child_id,family_id) VALUES (?,?,?,?,?,?,?)').run(uuidv4(), 'Tarefa aprovada!', `+${task.points} pontos`, 'task', '⭐', task.child_id, req.user.familyId);
        }
      }
    } else {
      if (await isEnabled(db, req.user.familyId, 'notifications')) {
        await db.prepare('INSERT INTO notifications (id,title,message,type,icon,child_id,family_id) VALUES (?,?,?,?,?,?,?)').run(
          uuidv4(), 'Tarefa reprovada', `"${task.title}" foi reprovada.`, 'task', '❌', task.child_id, req.user.familyId
        );
      }
    }
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao aprovar tarefa' }); }
});

// DELETE /api/tasks/:id — inactivate (soft delete)
router.delete('/:id', parentOnly, async (req, res) => {
  try {
    const db = req.db;
    await db.prepare("UPDATE tasks SET status='inactive', updated_at=CURRENT_TIMESTAMP WHERE id=? AND family_id=?").run(req.params.id, req.user.familyId);
    res.json({ message: 'Tarefa desativada' });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

async function allowanceTaskTxnExists(db, taskOccurrenceId) {
  const row = await db.prepare(`SELECT id FROM allowance_transactions WHERE task_occurrence_id=? AND origin='task' LIMIT 1`).get(taskOccurrenceId);
  return !!row;
}

// Helper: award points to child when task occurrence is approved/completed
async function awardPoints(db, occ, task, user) {
  if (task.is_health_reminder) {
    await db.prepare('UPDATE task_occurrences SET points_awarded=0 WHERE id=?').run(occ.id);
    return;
  }

  const hasPointsOrCoins = (task.points > 0) || (task.coins > 0);
  const child = await db.prepare('SELECT * FROM children WHERE id=?').get(occ.child_id);

  if (hasPointsOrCoins && child) {
    const newPts = child.points + (task.points || 0);
    const newCoins = child.coins + (task.coins || 0);
    let xp = child.xp + (task.points || 0), level = child.level, xpNext = child.xp_next_level;
    while (xp >= xpNext) { xp -= xpNext; level++; xpNext = level * 100; }
    const today = getCalendarDateYMD(new Date());
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const yesterday = getCalendarDateYMD(yest);
    let streak = child.streak_last_date !== today ? (child.streak_last_date === yesterday ? child.streak_current + 1 : 1) : child.streak_current;

    await db.prepare("UPDATE children SET points=?,coins=?,level=?,xp=?,xp_next_level=?,streak_current=?,streak_best=?,streak_last_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(newPts, newCoins, level, xp, xpNext, streak, Math.max(child.streak_best, streak), today, occ.child_id);

    await db.prepare("UPDATE task_occurrences SET points_awarded=? WHERE id=?").run(task.points || 0, occ.id);
    await db.prepare('INSERT INTO history (id,event,points,coins,type,child_id,family_id) VALUES (?,?,?,?,?,?,?)').run(
      uuidv4(), `Tarefa: ${task.title}`, task.points || 0, task.coins || 0, 'task', occ.child_id, occ.family_id
    );
  } else {
    await db.prepare('UPDATE task_occurrences SET points_awarded=0 WHERE id=?').run(occ.id);
  }

  // Allowance bonus (independente de pontos; idempotente por ocorrência)
  const rule = await db.prepare('SELECT * FROM task_allowance_rules WHERE task_id=?').get(task.id);
  if (rule && rule.affects_allowance && Number(rule.bonus_amount) > 0 && !(await allowanceTaskTxnExists(db, occ.id))) {
    const { month, year } = getCalendarMonthYearFromYmd(getCalendarDateYMD(new Date()));
    const cycle = await db.prepare("SELECT id FROM allowance_cycles WHERE child_id=? AND month=? AND year=? AND status='open'").get(occ.child_id, month, year);
    if (cycle) {
      await db.prepare("INSERT INTO allowance_transactions (id, child_id, family_id, cycle_id, task_id, task_occurrence_id, type, origin, description, amount, status, approved_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(
        uuidv4(), occ.child_id, occ.family_id, cycle.id, task.id, occ.id, 'credit', 'task', `Bônus: ${task.title}`, rule.bonus_amount, 'approved', user.id
      );
      await db.prepare("UPDATE allowance_cycles SET total_bonus = total_bonus + ? WHERE id=?").run(rule.bonus_amount, cycle.id);
    }
  }

  if (hasPointsOrCoins && (await isEnabled(db, occ.family_id, 'notifications'))) {
    await db.prepare('INSERT INTO notifications (id,title,message,type,icon,child_id,family_id) VALUES (?,?,?,?,?,?,?)').run(
      uuidv4(), 'Tarefa aprovada!', `+${task.points || 0} pontos por "${task.title}"`, 'task', '⭐', occ.child_id, occ.family_id
    );
  }
}

async function applyAllowanceDebit(db, occ, task, rule, user) {
  if (!rule || !rule.affects_allowance || Number(rule.discount_amount) <= 0) return;
  if (await allowanceTaskTxnExists(db, occ.id)) return;
  const { month, year } = getCalendarMonthYearFromYmd(getCalendarDateYMD(new Date()));
  const cycle = await db.prepare("SELECT id FROM allowance_cycles WHERE child_id=? AND month=? AND year=? AND status='open'").get(occ.child_id, month, year);
  if (cycle) {
    await db.prepare("INSERT INTO allowance_transactions (id, child_id, family_id, cycle_id, task_id, task_occurrence_id, type, origin, description, amount, status, approved_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(
      uuidv4(), occ.child_id, occ.family_id, cycle.id, task.id, occ.id, 'debit', 'task', `Desconto: ${task.title} reprovada`, rule.discount_amount, 'approved', user.id
    );
    await db.prepare("UPDATE allowance_cycles SET total_discount = total_discount + ? WHERE id=?").run(rule.discount_amount, cycle.id);
  }
}

module.exports = router;
