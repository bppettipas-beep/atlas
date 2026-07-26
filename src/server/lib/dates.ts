export function startOfDay(date = new Date()): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function endOfDay(date = new Date()): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

export function daysAgo(days: number, from = new Date()): Date {
  const copy = new Date(from);
  copy.setDate(copy.getDate() - days);
  return copy;
}

export function daysFromNow(days: number, from = new Date()): Date {
  const copy = new Date(from);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function startOfWeek(date = new Date()): Date {
  const copy = startOfDay(date);
  const day = copy.getDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1; // weeks start on Monday
  copy.setDate(copy.getDate() - diff);
  return copy;
}

export function isOverdue(dueAt: Date | null, status: string): boolean {
  if (!dueAt || status === 'DONE') return false;
  return dueAt.getTime() < Date.now();
}

/** Applies an "HH:mm" string to a date. */
export function withTimeOfDay(date: Date, timeOfDay: string): Date {
  const [hoursRaw, minutesRaw] = timeOfDay.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  const copy = new Date(date);
  copy.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return copy;
}
