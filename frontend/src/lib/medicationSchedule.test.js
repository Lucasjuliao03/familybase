import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as web from './medicationSchedule.js';
import * as mobile from '../../../mobile/src/lib/medicationSchedule.js';

test('web and native use the same schedule rules', () => {
  assert.equal(readFileSync(new URL('./medicationSchedule.js', import.meta.url), 'utf8'), readFileSync(new URL('../../../mobile/src/lib/medicationSchedule.js', import.meta.url), 'utf8'));
});

for (const [name, lib] of [['web', web], ['mobile', mobile]]) {
  test(`${name}: inclusive treatment dates, future starts and suspended treatments`, () => {
    const med = { status: 'active', start_date: '2026-10-10', end_date: '2026-10-12' };
    assert.equal(lib.medicationState(med, '2026-10-09'), 'upcoming');
    assert.equal(lib.isMedicationActive(med, '2026-10-10'), true);
    assert.equal(lib.isMedicationActive(med, '2026-10-12'), true);
    assert.equal(lib.medicationState(med, '2026-10-13'), 'completed');
    assert.equal(lib.isMedicationActive({ ...med, status: 'inactive' }, '2026-10-11'), false);
    assert.equal(lib.isMedicationActive({ status: 'active' }, '2026-12-31'), true);
  });

  test(`${name}: three daily doses are independent and a skipped dose remains pending`, () => {
    const med = { id: 'med', status: 'active', scheduled_times: '["12:00","20:00","04:00"]' };
    const now = new Date('2026-10-10T14:00:00');
    const logs = [
      { medication_id: 'med', status: 'late', scheduled_date: '2026-10-10', scheduled_time: '04:00:00', taken_at: new Date('2026-10-10T05:30:00').toISOString() },
      { medication_id: 'med', status: 'skipped', scheduled_date: '2026-10-10', scheduled_time: '12:00:00', taken_at: now.toISOString() },
    ];
    assert.deepEqual(lib.medicationDoses(med, logs, '2026-10-10', now).map((d) => [d.time, d.state]), [['04:00', 'taken'], ['12:00', 'overdue'], ['20:00', 'pending']]);
    assert.deepEqual(lib.medicationDoses({ ...med, end_date: '2026-10-09' }, logs, '2026-10-10', now), []);
  });

  test(`${name}: legacy logs consume just one slot and do not consume another patient's doses`, () => {
    const med = { id: 'med', status: 'active', scheduled_times: ['04:00', '12:00', '20:00'] };
    const now = new Date('2026-10-10T21:00:00');
    const logs = [{ medication_id: 'med', status: 'taken', taken_at: new Date('2026-10-10T12:10:00').toISOString() }, { medication_id: 'other', status: 'taken', taken_at: now.toISOString() }];
    assert.deepEqual(lib.medicationDoses(med, logs, '2026-10-10', now).map((d) => d.state), ['overdue', 'taken', 'overdue']);
    const duplicate = { medication_id: 'med', status: 'taken', taken_at: new Date('2026-10-10T12:12:00').toISOString() };
    assert.deepEqual(lib.medicationDoses(med, [...logs, duplicate], '2026-10-10', now).map((d) => d.state), ['overdue', 'taken', 'overdue']);
    const linked = { ...duplicate, scheduled_date: '2026-10-10', scheduled_time: '12:00' };
    assert.deepEqual(lib.medicationDoses(med, [...logs, linked], '2026-10-10', now).map((d) => d.state), ['overdue', 'taken', 'overdue']);
  });

  test(`${name}: reject inverted or invalid dates, duplicate times and incomplete dose times`, () => {
    assert.throws(() => lib.normalizeMedication({ start_date: '2026-10-12', end_date: '2026-10-10' }));
    assert.throws(() => lib.normalizeMedication({ end_date: '2026-10-09' }, { start_date: '2026-10-10' }));
    assert.throws(() => lib.normalizeMedication({ start_date: '2026-02-30' }));
    assert.throws(() => lib.normalizeMedication({ scheduled_times: ['04:00', '04:00:00'] }));
    for (const time of ['', '24:00', '04:60', '4:00']) assert.throws(() => lib.normalizeMedication({ scheduled_times: [time] }));
    assert.deepEqual(lib.normalizeMedication({ start_date: '10/10/2026', end_date: '', scheduled_times: ['20:00', '04:00', '12:00'] }), { start_date: '2026-10-10', end_date: null, scheduled_times: ['04:00', '12:00', '20:00'], scheduled_time: '04:00' });
    assert.deepEqual(lib.parseScheduledTimes({ scheduled_time: '04:00:00' }), ['04:00']);
  });

  test(`${name}: late dose after midnight belongs to its original prescribed day`, () => {
    const med = { id: 'med', status: 'active', scheduled_times: ['04:00', '12:00', '20:00'], start_date: '2026-10-10', end_date: '2026-10-10' };
    const now = new Date('2026-10-11T00:30:00');
    const row = lib.buildMedicationLog({ taken_at: now.toISOString(), scheduled_date: '2026-10-10', scheduled_time: '20:00' }, med, now);
    assert.equal(row.status, 'late');
    assert.equal(row.scheduled_date, '2026-10-10');
    assert.equal(lib.localDate(new Date(row.taken_at)), '2026-10-11');
    assert.equal(lib.medicationDoses(med, [{ ...row, medication_id: 'med' }], '2026-10-10', now)[2].state, 'taken');
    assert.throws(() => lib.buildMedicationLog({ scheduled_date: '2026-10-11', scheduled_time: '20:00', taken_at: now.toISOString() }, med, now));
    assert.throws(() => lib.buildMedicationLog({ scheduled_date: '2026-10-10', scheduled_time: '22:00', taken_at: now.toISOString() }, med, now));
  });

  test(`${name}: actual input time is preserved and future or ambiguous instants are rejected`, () => {
    const now = new Date('2026-10-10T15:00:00');
    const med = { id: 'med', status: 'active', scheduled_times: ['12:00'] };
    const row = lib.buildMedicationLog({ taken_date: '2026-10-10', taken_time: '13:45', scheduled_date: '2026-10-10', scheduled_time: '12:00', status: 'taken' }, med, now);
    assert.equal(lib.localTime(new Date(row.taken_at)), '13:45');
    assert.equal(row.status, 'late');
    assert.equal(lib.buildMedicationLog({ taken_date: '2026-10-10', taken_time: '11:45', scheduled_date: '2026-10-10', scheduled_time: '12:00' }, med, now).status, 'taken');
    assert.throws(() => lib.buildMedicationLog({ taken_date: '2026-10-11', taken_time: '15:00' }, med, now));
    assert.throws(() => lib.buildMedicationLog({ taken_at: '2026-10-10T13:45:00' }, med, now));
    assert.throws(() => lib.buildMedicationLog({ scheduled_date: '2026-10-10', taken_at: now.toISOString() }, med, now));
    assert.equal(lib.buildMedicationLog({}, med, now).taken_at, new Date('2026-10-10T15:00:00').toISOString());
  });
}

test('local day filters include the entire user day across UTC midnight and DST', () => {
  const url = new URL('./medicationSchedule.js', import.meta.url).href;
  for (const [zone, date, hours, expectedStart] of [
    ['America/Sao_Paulo', '2026-10-10', 24, '2026-10-10T03:00:00.000Z'],
    ['Asia/Tokyo', '2026-10-10', 24, '2026-10-09T15:00:00.000Z'],
    ['America/New_York', '2026-03-08', 23, '2026-03-08T05:00:00.000Z'],
    ['America/New_York', '2026-11-01', 25, '2026-11-01T04:00:00.000Z'],
  ]) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import {localDayBounds,localDate,localTime,buildMedicationLog} from ${JSON.stringify(url)}; const b=localDayBounds('${date}'); const now=new Date('${date}T23:45:00'); const r=buildMedicationLog({taken_date:'${date}',taken_time:'23:30'},{},now); console.log(JSON.stringify({start:b.start,hours:(new Date(b.end)-new Date(b.start))/3600000,date:localDate(new Date(r.taken_at)),time:localTime(new Date(r.taken_at))}));`], { env: { ...process.env, TZ: zone }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { start: expectedStart, hours, date, time: '23:30' }, zone);
  }
});
