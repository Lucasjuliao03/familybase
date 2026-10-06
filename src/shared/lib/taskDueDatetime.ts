export function buildDueDatetime(dateStr: string | null | undefined, timeStr?: string | null): Date | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (timeStr && /^\d{2}:\d{2}/.test(timeStr)) {
    const [h, min] = timeStr.split(':').map(Number);
    return new Date(y, m - 1, d, h, min, 0, 0);
  }
  return new Date(y, m - 1, d, 23, 59, 59, 0);
}

