const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const { isEnabled } = require('../middleware/familyModule');
const { getCalendarDateYMD } = require('../lib/calendarDate');

function logCronDbError(context, err) {
  const code = err && (err.code || err.errno);
  const transient = ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code);
  if (transient) {
    console.warn(
      `⚠️  [${context}] Base de dados inacessível (${code || err.message}). ` +
        'O API mantém-se ativa — confirme DATABASE_URL, rede e se o projeto Supabase existe.',
    );
  } else {
    console.error(`❌ [${context}]`, err && err.message ? err.message : err);
  }
}

async function generateTaskOccurrences(db) {
  try {
  const today = new Date();
  /** Data civil estável por fuso configurável — evita “dia errado” em servidores UTC */
  const todayStr = getCalendarDateYMD(today);
  const [, , dayStr] = todayStr.split('-');
  /** weekday / day-of-month relativos ao calendário do fuso configurado */
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: process.env.FAMILYBASE_CALENDAR_TIMEZONE || 'UTC',
    weekday: 'short',
    day: 'numeric',
  }).formatToParts(today);
  const wk = parts.find((p) => p.type === 'weekday')?.value;
  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dowMap[wk] ?? today.getDay();
  const dayOfMonth = Number(dayStr) || today.getDate();

  const recurringTasks = await db.prepare(`
    SELECT t.* FROM tasks t
    WHERE t.is_recurring = TRUE AND t.status = 'active'
    AND (t.start_date IS NULL OR t.start_date <= ?)
    AND (t.end_date IS NULL OR t.end_date >= ?)
  `).all(todayStr, todayStr);

  let created = 0;
  let skipped = 0;

  for (const task of recurringTasks) {
    if (task.is_health_reminder) {
      if (!(await isEnabled(db, task.family_id, 'tasks'))) {
        skipped++;
        continue;
      }
      const dueDatetime = task.due_time ? `${todayStr}T${task.due_time}:00` : null;
      try {
        const assignee = task.assignee_user_id || null;
        await db.prepare(`
          INSERT OR IGNORE INTO task_occurrences
          (id, task_id, family_id, child_id, assignee_user_id, occurrence_date, due_datetime, status)
          VALUES (?,?,?,?,?,?,?,'pending')
        `).run(uuidv4(), task.id, task.family_id, task.child_id, assignee, todayStr, dueDatetime);
        created++;
      } catch {
        skipped++;
      }
      continue;
    }

    if (!(await isEnabled(db, task.family_id, 'tasks')) || !(await isEnabled(db, task.family_id, 'routines'))) {
      skipped++;
      continue;
    }

    let shouldGenerate = false;
    switch (task.frequency) {
      case 'daily':
        shouldGenerate = true;
        break;
      case 'weekly':
        if (task.recurrence_days) {
          const days = task.recurrence_days.split(',').map(Number);
          shouldGenerate = days.includes(dayOfWeek);
        } else {
          shouldGenerate = true;
        }
        break;
      case 'monthly':
        if (task.recurrence_days) {
          shouldGenerate = task.recurrence_days.split(',').map(Number).includes(dayOfMonth);
        } else if (task.start_date) {
          shouldGenerate = new Date(task.start_date).getDate() === dayOfMonth;
        }
        break;
      case 'custom':
        if (task.recurrence_days) {
          const days = task.recurrence_days.split(',').map(Number);
          shouldGenerate = days.includes(dayOfWeek);
        }
        break;
      default:
        break;
    }

    if (!shouldGenerate) {
      skipped++;
      continue;
    }

    const dueDatetime = task.due_time ? `${todayStr}T${task.due_time}:00` : null;

    try {
      await db.prepare(`
        INSERT OR IGNORE INTO task_occurrences 
        (id, task_id, family_id, child_id, assignee_user_id, occurrence_date, due_datetime, status)
        VALUES (?,?,?,?,?,?,?,'pending')
      `).run(uuidv4(), task.id, task.family_id, task.child_id, null, todayStr, dueDatetime);
      created++;
    } catch {
      skipped++;
    }
  }

    console.log(`📋 Task occurrences: ${created} created, ${skipped} skipped for ${todayStr}`);
    return { created, skipped };
  } catch (err) {
    logCronDbError('generateTaskOccurrences', err);
    return { created: 0, skipped: 0, error: true };
  }
}

async function markExpiredOccurrences(db) {
  try {
    const now = new Date().toISOString();
    const today = getCalendarDateYMD(new Date());

    const delayedResult = await db.prepare(`
      UPDATE task_occurrences 
      SET status = 'delayed', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'pending'
      AND due_datetime IS NOT NULL
      AND due_datetime < ?
      AND occurrence_date = ?
    `).run(now, today);

    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const yesterdayStr = getCalendarDateYMD(yest);

    // 1. Fetch occurrences that are about to expire to process allowance deductions
    const expiringOccs = await db.prepare(`
      SELECT o.id as occ_id, o.task_id, o.child_id, o.family_id, t.title,
             r.affects_allowance, r.discount_amount
      FROM task_occurrences o
      JOIN tasks t ON o.task_id = t.id
      LEFT JOIN task_allowance_rules r ON t.id = r.task_id
      WHERE o.status IN ('pending', 'delayed', 'in_progress')
      AND o.occurrence_date = ?
    `).all(yesterdayStr);

    let deductionsApplied = 0;

    for (const occ of expiringOccs) {
      if (occ.affects_allowance && occ.discount_amount > 0) {
        // Check idempotency: ensure no existing deduction for this occurrence
        const existingTx = await db.prepare(`SELECT id FROM allowance_transactions WHERE task_occurrence_id=? AND origin='task' LIMIT 1`).get(occ.occ_id);
        if (!existingTx) {
          const { month, year } = require('../lib/calendarDate').getCalendarMonthYearFromYmd(today);
          const cycle = await db.prepare("SELECT id FROM allowance_cycles WHERE child_id=? AND month=? AND year=? AND status='open'").get(occ.child_id, month, year);
          
          if (cycle) {
            await db.prepare(`
              INSERT INTO allowance_transactions (id, child_id, family_id, cycle_id, task_id, task_occurrence_id, type, origin, description, amount, status, approved_by) 
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            `).run(
              require('uuid').v4(), occ.child_id, occ.family_id, cycle.id, occ.task_id, occ.occ_id, 
              'debit', 'task', `Desconto: "${occ.title}" não realizada`, occ.discount_amount, 'approved', null
            );
            
            await db.prepare("UPDATE allowance_cycles SET total_discount = total_discount + ? WHERE id=?").run(occ.discount_amount, cycle.id);
            deductionsApplied++;
          }
        }
      }
    }

    // 2. Mark them as expired
    const expiredResult = await db.prepare(`
      UPDATE task_occurrences 
      SET status = 'expired', updated_at = CURRENT_TIMESTAMP
      WHERE status IN ('pending', 'delayed', 'in_progress')
      AND occurrence_date = ?
    `).run(yesterdayStr);

    if (delayedResult.changes > 0 || expiredResult.changes > 0 || deductionsApplied > 0) {
      console.log(`⏰ Marked ${delayedResult.changes} delayed, ${expiredResult.changes} expired. Applied ${deductionsApplied} allowance deductions.`);
    }
  } catch (err) {
    logCronDbError('markExpiredOccurrences', err);
  }
}

async function runInitialTaskCron(db) {
  try {
    console.log('🚀 Generating initial task occurrences for today...');
    await generateTaskOccurrences(db);
    await markExpiredOccurrences(db);
  } catch (err) {
    logCronDbError('initialTaskCron', err);
  }
}

async function runMidnightTaskCron(db) {
  try {
    console.log('🌙 Running midnight task generation cron...');
    await generateTaskOccurrences(db);
    await markExpiredOccurrences(db);
  } catch (err) {
    logCronDbError('midnightTaskCron', err);
  }
}

function startCronJobs(db) {
  cron.schedule('0 0 * * *', () => {
    runMidnightTaskCron(db).catch((err) => logCronDbError('midnightTaskCron(unhandled)', err));
  });

  cron.schedule('*/30 * * * *', () => {
    markExpiredOccurrences(db).catch((err) => logCronDbError('markExpiredOccurrences(schedule)', err));
  });

  setTimeout(() => {
    runInitialTaskCron(db).catch((err) => logCronDbError('initialTaskCron(unhandled)', err));
  }, 2000);

  console.log('✅ Cron jobs started');
}

module.exports = { startCronJobs, generateTaskOccurrences, markExpiredOccurrences };
