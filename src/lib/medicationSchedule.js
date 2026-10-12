// Calendar dates and prescribed hours belong to the device's local timezone.
// Only instants (taken_at) are converted to UTC for storage.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/;
const CONSUMED = new Set(['taken', 'late']);

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function localTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function localDateTime(date, time = '00:00') {
  if (!DATE_RE.test(date || '') || !TIME_RE.test(time || '')) throw new Error('Informe uma data e um horário válidos.');
  const instant = new Date(`${date}T${time.slice(0, 5)}:00`);
  if (Number.isNaN(instant.getTime()) || localDate(instant) !== date || localTime(instant) !== time.slice(0, 5)) {
    throw new Error('Informe uma data e um horário válidos.');
  }
  return instant;
}

export function localDayBounds(date) {
  const start = localDateTime(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function parseScheduledTimes(med) {
  let times = med?.scheduled_times;
  if (typeof times === 'string') {
    try { times = JSON.parse(times); } catch { times = times.split(','); }
  }
  if (!Array.isArray(times) || !times.length) times = med?.scheduled_time ? [med.scheduled_time] : [];
  return [...new Set(times.map((t) => String(t || '').trim()).filter((t) => TIME_RE.test(t)).map((t) => t.slice(0, 5)))].sort();
}

export function medicationState(med, day = localDate()) {
  if (['inactive', 'suspended'].includes(med.status)) return 'inactive';
  if (['completed', 'finished'].includes(med.status) || (med.end_date && med.end_date < day)) return 'completed';
  if (med.start_date && med.start_date > day) return 'upcoming';
  return 'active';
}

export function isMedicationActive(med, day = localDate()) {
  return medicationState(med, day) === 'active';
}

export function normalizeMedication(body, existing = {}) {
  const row = { ...body };
  for (const key of ['start_date', 'end_date']) {
    if (key in row) {
      row[key] = row[key] || null;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(row[key] || '')) row[key] = row[key].split('/').reverse().join('-');
      if (row[key]) localDateTime(row[key]);
    }
  }
  const merged = { ...existing, ...row };
  if (merged.start_date && merged.end_date && merged.end_date < merged.start_date) {
    throw new Error('A data de término deve ser igual ou posterior à data de início.');
  }
  if ('scheduled_times' in row) {
    let raw = row.scheduled_times;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { throw new Error('Informe os horários das doses.'); }
    }
    if (!Array.isArray(raw) || !raw.length || raw.length > 24 || raw.some((t) => !TIME_RE.test(String(t || '').trim()))) {
      throw new Error('Preencha cada horário no formato HH:MM, de 00:00 a 23:59.');
    }
    const times = raw.map((t) => String(t).trim().slice(0, 5));
    if (new Set(times).size !== times.length) throw new Error('Cada dose deve ter um horário diferente.');
    row.scheduled_times = [...times].sort();
    row.scheduled_time = row.scheduled_times[0];
  }
  if ('status' in row) row.status = ({ finished: 'completed', suspended: 'inactive' })[row.status] || row.status;
  return row;
}

export function indexMedicationLogs(logs) {
  const index = new Map();
  for (const log of logs) {
    if (!index.has(log.medication_id)) index.set(log.medication_id, []);
    index.get(log.medication_id).push(log);
  }
  return index;
}

// Every prescribed time has its own completion state, including the 04:00 dose.
// Legacy logs without a dose key consume at most one slot, never the whole day.
export function medicationDoses(med, logs = [], day = localDate(), now = new Date()) {
  if (!isMedicationActive(med, day)) return [];
  const times = parseScheduledTimes(med);
  const slots = (times.length ? times : ['']).map((time) => ({
    date: day, time, log: null, state: time && now > localDateTime(day, time) ? 'overdue' : 'pending',
  }));
  const legacy = [];
  for (const log of logs) {
    if (log.medication_id !== med.id || !CONSUMED.has(log.status)) continue;
    if (log.scheduled_date && log.scheduled_time) {
      if (log.scheduled_date === day) {
        const slot = slots.find((s) => s.time === log.scheduled_time.slice(0, 5));
        if (slot) { slot.log = log; slot.state = 'taken'; }
      }
    } else if (log.taken_at && localDate(new Date(log.taken_at)) === day) legacy.push(log);
  }
  legacy.sort((a, b) => new Date(a.taken_at) - new Date(b.taken_at));
  for (const log of legacy) {
    const time = localTime(new Date(log.taken_at));
    const slot = slots.filter((s) => s.time <= time).at(-1) || slots[0];
    // An old duplicate must not spill into another prescribed time.
    if (slot && !slot.log) { slot.log = log; slot.state = 'taken'; }
  }
  return slots;
}

export function buildMedicationLog(body, med, now = new Date()) {
  let taken;
  if (body.taken_at) {
    if (!/(Z|[+-]\d{2}:\d{2})$/.test(body.taken_at)) throw new Error('A data e hora da tomada precisam incluir o fuso horário.');
    taken = new Date(body.taken_at);
  } else {
    taken = localDateTime(body.taken_date || localDate(now), body.taken_time || localTime(now));
  }
  if (Number.isNaN(taken.getTime())) throw new Error('Data e hora da tomada inválidas.');
  if (taken.getTime() > now.getTime() + 60000) throw new Error('A tomada não pode ser registrada no futuro.');
  const date = body.scheduled_date || null;
  if (body.scheduled_time && !TIME_RE.test(String(body.scheduled_time))) throw new Error('Horário da dose prevista inválido.');
  const time = body.scheduled_time ? String(body.scheduled_time).slice(0, 5) : null;
  if (!!date !== !!time) throw new Error('Selecione a data e o horário da dose prevista.');
  const treatmentDay = date || localDate(taken);
  if ((med.start_date && treatmentDay < med.start_date) || (med.end_date && treatmentDay > med.end_date)) {
    throw new Error('A dose prevista deve estar dentro do período do tratamento.');
  }
  let status = body.status || 'taken';
  if (!['taken', 'late', 'skipped', 'missed'].includes(status)) throw new Error('Situação da dose inválida.');
  if (date) {
    const due = localDateTime(date, time);
    if (!parseScheduledTimes(med).includes(time)) throw new Error('Este horário não está cadastrado para o medicamento.');
    if (CONSUMED.has(status)) status = taken > due ? 'late' : 'taken';
  }
  return { taken_at: taken.toISOString(), scheduled_date: date, scheduled_time: time, status };
}
