/**
 * Data civil (YYYY-MM-DD) num fuso opcional via FAMILYBASE_CALENDAR_TIMEZONE
 * (ex.: America/Sao_Paulo). Evita inconsistência cron/API em servidores UTC.
 */
function getCalendarDateYMD(now = new Date(), timeZone = process.env.FAMILYBASE_CALENDAR_TIMEZONE || 'UTC') {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch (_) {
    /* fallback */
  }
  return now.toISOString().split('T')[0];
}

function getCalendarMonthYearFromYmd(ymd) {
  const [y, m] = String(ymd).slice(0, 10).split('-').map(Number);
  return { year: y, month: m };
}

module.exports = { getCalendarDateYMD, getCalendarMonthYearFromYmd };
