const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const { isEnabled } = require('../middleware/familyModule');

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
  const todayStr = today.toISOString().split('T')[0];
  const dayOfWeek = today.getDay();
  const dayOfMonth = today.getDate();

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
  const today = new Date().toISOString().split('T')[0];

  const delayedResult = await db.prepare(`
    UPDATE task_occurrences 
    SET status = 'delayed', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'pending'
    AND due_datetime IS NOT NULL
    AND due_datetime < ?
    AND occurrence_date = ?
  `).run(now, today);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const expiredResult = await db.prepare(`
    UPDATE task_occurrences 
    SET status = 'expired', updated_at = CURRENT_TIMESTAMP
    WHERE status IN ('pending', 'delayed', 'in_progress')
    AND occurrence_date = ?
  `).run(yesterdayStr);

    if (delayedResult.changes > 0 || expiredResult.changes > 0) {
      console.log(`⏰ Marked ${delayedResult.changes} delayed, ${expiredResult.changes} expired`);
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
