const eurFmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

export const eur = (n: number) => eurFmt.format(n || 0);
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const todayISO = () => toISO(new Date());

export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function fmtDate(s: string): string {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

export function fmtDateLong(s: string): string {
  return fromISO(s).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function addDays(s: string, n: number): string {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function daysBetween(a: string, b: string): number {
  if (!a || !b) return 9999;
  return Math.round(Math.abs(fromISO(a).getTime() - fromISO(b).getTime()) / 86400000);
}

/** Numero seriale Excel -> YYYY-MM-DD */
export function excelSerialToISO(n: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Accetta seriale Excel, 'gg/mm/aaaa' o 'aaaa-mm-gg' */
export function anyToISO(v: unknown): string {
  if (typeof v === 'number' && v > 20000 && v < 80000) return excelSerialToISO(v);
  if (v instanceof Date) return toISO(v);
  if (typeof v === 'string') {
    const s = v.trim();
    let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return '';
}

/** Orari del foglio spazi: 20.3 = 20:30, frazione di giorno, oppure '19:00' */
export function anyToTime(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    if (v > 0 && v < 1) {
      const tot = Math.round(v * 1440);
      return `${pad(Math.floor(tot / 60))}:${pad(tot % 60)}`;
    }
    if (v >= 0 && v < 25) {
      const [h, dec = ''] = String(v).split('.');
      const mm = Math.min(59, parseInt(dec.padEnd(2, '0').slice(0, 2), 10) || 0);
      return `${pad(+h)}:${pad(mm)}`;
    }
    return '';
  }
  const m = String(v).trim().match(/^(\d{1,2})(?:[:.,](\d{1,2}))?/);
  if (!m || +m[1] > 24) return '';
  const mm = m[2] ? (m[2].length === 1 ? m[2] + '0' : m[2]) : '00';
  return `${pad(+m[1])}:${pad(Math.min(59, +mm))}`;
}

export function parseAmount(s: string): number {
  const n = parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? round2(n) : 0;
}

export function hash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
