import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldAutoRejectOccurrence,
  isCompletionLate,
  isRecurringTask,
} from './taskOccurrenceClosure.js';

const recurringDaily = { is_recurring: true, frequency: 'daily', due_time: '10:00' };
const onceTask = { is_recurring: false, frequency: 'once', due_time: '20:00' };

describe('shouldAutoRejectOccurrence', () => {
  it('recorrente diária: ainda no mesmo dia após limite → não reprova', () => {
    const now = new Date(2026, 4, 20, 11, 30, 0);
    assert.equal(
      shouldAutoRejectOccurrence(
        { occurrence_date: '2026-05-20', status: 'pending' },
        recurringDaily,
        now,
      ),
      false,
    );
  });

  it('recorrente diária: dia seguinte → reprova', () => {
    const now = new Date(2026, 4, 21, 8, 0, 0);
    assert.equal(
      shouldAutoRejectOccurrence(
        { occurrence_date: '2026-05-20', status: 'pending' },
        recurringDaily,
        now,
      ),
      true,
    );
  });

  it('única: após horário limite no mesmo dia → reprova', () => {
    const now = new Date(2026, 4, 20, 20, 5, 0);
    assert.equal(
      shouldAutoRejectOccurrence(
        { occurrence_date: '2026-05-20', status: 'pending' },
        onceTask,
        now,
      ),
      true,
    );
  });

  it('única: antes do limite → não reprova', () => {
    const now = new Date(2026, 4, 20, 19, 0, 0);
    assert.equal(
      shouldAutoRejectOccurrence(
        { occurrence_date: '2026-05-20', status: 'pending' },
        onceTask,
        now,
      ),
      false,
    );
  });

  it('ignora status já fechado', () => {
    const now = new Date(2026, 4, 21, 8, 0, 0);
    assert.equal(
      shouldAutoRejectOccurrence(
        { occurrence_date: '2026-05-20', status: 'approved' },
        recurringDaily,
        now,
      ),
      false,
    );
  });
});

describe('isCompletionLate', () => {
  it('conclusão após limite no mesmo dia', () => {
    const completedAt = new Date(2026, 4, 20, 14, 0, 0);
    assert.equal(
      isCompletionLate(
        { occurrence_date: '2026-05-20' },
        recurringDaily,
        completedAt,
      ),
      true,
    );
  });

  it('conclusão antes do limite', () => {
    const completedAt = new Date(2026, 4, 20, 8, 30, 0);
    assert.equal(
      isCompletionLate(
        { occurrence_date: '2026-05-20' },
        recurringDaily,
        completedAt,
      ),
      false,
    );
  });
});

describe('isRecurringTask', () => {
  it('once não é recorrente', () => {
    assert.equal(isRecurringTask({ is_recurring: false, frequency: 'once' }), false);
  });

  it('daily recorrente', () => {
    assert.equal(isRecurringTask({ is_recurring: true, frequency: 'daily' }), true);
  });
});
