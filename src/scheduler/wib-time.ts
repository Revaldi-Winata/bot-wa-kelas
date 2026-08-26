export interface WibDateTime {
  datePart: string;
  timePart: string;
  hour: number;
  minute: number;
  dayOfWeek: number;
  wibDate: Date;
}

/**
 * Returns current date and time normalized to Western Indonesia Time (WIB, UTC+7)
 */
export function getWibDateTime(): WibDateTime {
  const nowUtc = new Date();
  const wibTimeStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(nowUtc); // e.g. "2026-08-25, 04:00"

  const [datePart, timePart] = wibTimeStr.split(', ');
  const [hourStr, minStr] = timePart.split(':');
  const wibDate = new Date(datePart + 'T00:00:00Z');

  return {
    datePart,
    timePart,
    hour: Number(hourStr),
    minute: Number(minStr),
    dayOfWeek: wibDate.getUTCDay(), // 0=Sun, 1=Mon, ..., 6=Sat
    wibDate,
  };
}
