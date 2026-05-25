import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveParentHistoryBucket,
  historyBucketLabel,
  isOccurrenceDayEnded,
  toLocalYmdStr,
  endOfLocalCalendarDay,
} from './taskHistoryStatus.js';

function fixedNowYmdClock() {
  // 2026-05-20 14:30 local
  return new Date(2026, 4, 20, 14, 30, 0);
}

describe('deriveParentHistoryBucket', () => {
  const now = fixedNowYmdClock();

  it('approved → completed', () => {
    assert.equal(
      deriveParentHistoryBucket(
        {
          occurrence_date: '2026-05-19',
          status: 'approved',
          requires_approval: true,
        },
        now,
      ),
      'completed',
    );
  });

  it('completed + requires approval + dia anterior terminou → waiting edge → not_completed', () => {
    assert.equal(
      deriveParentHistoryBucket(
        {
          occurrence_date: '2026-05-19',
          status: 'completed',
          requires_approval: true,
        },
        now,
      ),
      'not_completed',
    );
  });

  it('completed + sem aprovação → completed mesmo no passado', () => {
    assert.equal(
      deriveParentHistoryBucket(
        {
          occurrence_date: '2026-05-18',
          status: 'completed',
          requires_approval: false,
        },
        now,
      ),
      'completed',
    );
  });

  it('rejected bucket', () => {
    assert.equal(
      deriveParentHistoryBucket(
        { occurrence_date: '2026-05-19', status: 'rejected', requires_approval: true },
        now,
      ),
      'rejected',
    );
  });

  it('waiting_approval hoje antes da meia-noite → pending_open', () => {
    assert.equal(
      deriveParentHistoryBucket(
        {
          occurrence_date: toLocalYmdStr(now),
          status: 'waiting_approval',
          requires_approval: true,
        },
        now,
      ),
      'pending_open',
    );
  });

  it('waiting_approval ontem → not_completed', () => {
    assert.equal(
      deriveParentHistoryBucket(
        {
          occurrence_date: '2026-05-19',
          status: 'waiting_approval',
          requires_approval: true,
        },
        now,
      ),
      'not_completed',
    );
  });

  it('pending + dia passado → rejected (fecho automático)', () => {
    assert.equal(
      deriveParentHistoryBucket(
        {
          occurrence_date: '2026-05-10',
          status: 'pending',
          requires_approval: true,
        },
        now,
      ),
      'rejected',
    );
  });

  it('inactive template não muda histórico: registo approved continua completed', () => {
    assert.equal(
      deriveParentHistoryBucket({
        occurrence_date: '2026-05-01',
        status: 'approved',
        requires_approval: true,
      }),
      'completed',
    );
  });

  it('health reminder completed → sempre completed bucket', () => {
    assert.equal(
      deriveParentHistoryBucket(
        {
          occurrence_date: '2026-05-18',
          status: 'completed',
          requires_approval: true,
          is_health_reminder: 1,
        },
        now,
      ),
      'completed',
    );
  });
});

describe('isOccurrenceDayEnded', () => {
  it('após último ms do dia local o dia actual terminou', () => {
    const d = new Date(2026, 4, 20, 23, 59, 59, 999);
    assert.equal(typeof endOfLocalCalendarDay(d).getTime(), 'number');
    assert.equal(isOccurrenceDayEnded('2026-05-19', new Date(2026, 4, 20, 8, 0, 0)), true);
    assert.equal(isOccurrenceDayEnded('2026-05-21', new Date(2026, 4, 20, 23, 0, 0)), false);
  });
});

describe('historyBucketLabel', () => {
  it('retorna texto PT', () => {
    assert.equal(historyBucketLabel('rejected'), 'Reprovada');
    assert.ok(historyBucketLabel('completed').includes('Concl'));
  });
});
