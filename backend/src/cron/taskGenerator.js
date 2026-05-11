const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const { isEnabled } = require('../middleware/familyModule');

async function generateTaskOccurrences(db) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const dayOfWeek = today.getDay();
  const dayOfMonth = today.getDate();

  const recurringTasks = await db.prepare(`
    SELECT t.* FROM tasks t
    WHERE t.is_recurring = 1 AND t.status = 'active'
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
        db.prepare(`
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
}

async function markExpiredOccurrences(db) {
  const now = new Date().toISOString();
  const today = new Date().toISOString().split('T')[0];

  const delayedResult = await db.prepare(`
    UPDATE task_occurrences 
    SET status = 'delayed', updated_at = datetime('now')
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
    SET status = 'expired', updated_at = datetime('now')
    WHERE status IN ('pending', 'delayed', 'in_progress')
    AND occurrence_date = ?
  `).run(yesterdayStr);

  if (delayedResult.changes > 0 || expiredResult.changes > 0) {
    console.log(`⏰ Marked ${delayedResult.changes} delayed, ${expiredResult.changes} expired`);
  }
}

function startCronJobs(db) {
  cron.schedule('0 0 * * *', () => {
    console.log('🌙 Running midnight task generation cron...');
    generateTaskOccurrences(db);
    markExpiredOccurrences(db);
  });

  cron.schedule('*/30 * * * *', () => {
    markExpiredOccurrences(db);
  });

  setTimeout(() => {
    console.log('🚀 Generating initial task occurrences for today...');
    generateTaskOccurrences(db);
    markExpiredOccurrences(db);
  }, 2000);

  console.log('✅ Cron jobs started');
}

module.exports = { startCronJobs, generateTaskOccurrences, markExpiredOccurrences };
