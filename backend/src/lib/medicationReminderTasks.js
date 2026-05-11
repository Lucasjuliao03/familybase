/**
 * Syncs recurring daily tasks + occurrences for medication reminders (no pontos/mesada).
 * Uses placeholder child_id for FK when patient is adult; real assignee via assignee_user_id.
 */

const { v4: uuidv4 } = require('uuid');
const { isEnabled } = require('../middleware/familyModule');

function parseTimes(medRow) {
  if (medRow.scheduled_times) {
    try {
      const arr = typeof medRow.scheduled_times === 'string' ? JSON.parse(medRow.scheduled_times) : medRow.scheduled_times;
      if (Array.isArray(arr)) return arr.map((s) => String(s || '').trim()).filter(Boolean);
    } catch { /* ignore */ }
  }
  if (medRow.scheduled_time) return [String(medRow.scheduled_time).trim()].filter(Boolean);
  return [];
}

/** First child id for FK quando o paciente é adulto — null se não houver filho na família */
async function carrierChildId(db, familyId) {
  const r = await db.prepare('SELECT id FROM children WHERE family_id=? ORDER BY created_at ASC LIMIT 1').get(familyId);
  return r?.id ?? null;
}

/** Remove tasks criadas por este medicamento */
async function removeMedicationTasks(db, medicationId) {
  const tasks = await db.prepare('SELECT id FROM tasks WHERE source_medication_id=?').all(medicationId);
  for (const t of tasks) {
    await db.prepare('DELETE FROM task_occurrences WHERE task_id=?').run(t.id);
    await db.prepare('DELETE FROM task_allowance_rules WHERE task_id=?').run(t.id);
    await db.prepare('DELETE FROM tasks WHERE id=?').run(t.id);
  }
}

/**
 * Cria uma tarefa diária por horário (+ ocorrências futuras já existentes no cron geram só hoje pelo generator).
 */
async function syncMedicationReminderTasks(db, medicationId) {
  const med = await db.prepare(`
    SELECT m.*, fam.id as fam_chk FROM medications m JOIN families fam ON fam.id=m.family_id
    WHERE m.id=?
  `).get(medicationId);
  if (!med) return;

  await removeMedicationTasks(db, medicationId);

  if (med.status !== 'active') return;

  const times = parseTimes(med);
  if (!times.length) return;

  const start = med.start_date || null;
  if (!start) return;
  const end = med.end_date || start;

  const today = new Date().toISOString().split('T')[0];

  const patientUserId = med.patient_user_id || null;
  const assigneeUserId = patientUserId || null;

  let taskChildFk = med.child_id;
  if (patientUserId) {
    const carrier = await carrierChildId(db, med.family_id);
    if (!carrier) {
      console.warn('medication reminders: sem filho cadastrado na família para suportar tarefas (FK); ignorado', medicationId);
      return;
    }
    taskChildFk = carrier;
  }

  const tasksMod = await isEnabled(db, med.family_id, 'tasks');
  if (!tasksMod) return;

  for (const time of times) {
    const taskId = uuidv4();
    const title = `Tomar ${med.name} às ${time}`;
    const description = `[Saúde] Lembrete de medicamento. Marque tomado ou não tomado ao concluir.`;

    await db.prepare(`
      INSERT INTO tasks (
        id, title, description, type, category, points, coins, frequency,
        recurrence_days, start_date, end_date, due_time, deadline, is_recurring, status,
        priority, child_id, family_id, created_by,
        requires_approval, affects_allowance, visible_on_calendar, generate_notification,
        assignee_user_id, source_medication_id, is_health_reminder
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      taskId, title, description, 'routine', 'medicina',
      0, 0, 'daily',
      null, start, end, time, null, true, 'active',
      'high', taskChildFk, med.family_id, med.created_by,
      false, false, !!(await isEnabled(db, med.family_id, 'calendar')), false,
      assigneeUserId, medicationId, true,
    );

    /** Ocorrências para hoje até fim da recorrência o cron vai gerar próximos dias — gerar já hoje */
    try {
      if (today >= start && today <= end) {
        const dueDatetime = `${today}T${time}:00`;
        await db.prepare(`
          INSERT OR IGNORE INTO task_occurrences
          (id, task_id, family_id, child_id, assignee_user_id, occurrence_date, due_datetime, status)
          VALUES (?,?,?,?,?,?,?,'pending')
        `).run(uuidv4(), taskId, med.family_id, taskChildFk, assigneeUserId, today, dueDatetime);
      }
    } catch (e) {
      console.warn('medication reminder occ insert:', e.message);
    }
  }

  /** Disparar geração caso cron não rode */
  try {
    const { generateTaskOccurrences } = require('../cron/taskGenerator');
    await generateTaskOccurrences(db);
  } catch { /* ignore */ }
}

module.exports = {
  parseTimes,
  syncMedicationReminderTasks,
  removeMedicationTasks,
  carrierChildId,
};
