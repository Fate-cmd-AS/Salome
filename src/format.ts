import type { PayMethod } from './types';

export const TZ_DEFAULT = 'Africa/Abidjan';

export const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ');
export const F = (n: number) => fmt(n) + ' F';
export const signedF = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n)) + ' F';

let tz = TZ_DEFAULT;
export const setTz = (t: string) => { tz = t; };

export const dayKey = (ts: number) => new Date(ts).toLocaleDateString('en-CA', { timeZone: tz });
export const today = () => dayKey(Date.now());
export const hourOf = (ts: number) => Number(new Date(ts).toLocaleString('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }));
export const time = (ts: number) => new Date(ts).toLocaleTimeString('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
export const dateShort = (ts: number) => new Date(ts).toLocaleDateString('fr-FR', { timeZone: tz, day: 'numeric', month: 'short' });
export const dateLong = (ts: number) => new Date(ts).toLocaleDateString('fr-FR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' });
export const dayLabel = (day: string) => {
  const t = today();
  if (day === t) return "Aujourd'hui";
  if (day === shiftDay(t, -1)) return 'Hier';
  const d = new Date(day + 'T12:00:00Z');
  return d.toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' });
};
export const shiftDay = (day: string, n: number) => {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const weekday = (day: string) => new Date(day + 'T12:00:00Z').getUTCDay();
export const monthKey = (ts: number) => dayKey(ts).slice(0, 7);
export const monthLabel = (m: string) => new Date(m + '-15T12:00:00Z').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const ago = (ts: number) => {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return dateShort(ts);
};

export const METHODS: Record<PayMethod, { name: string; short: string; color: string; mm: boolean }> = {
  cash: { name: 'Espèces', short: 'ESP', color: 'var(--cash)', mm: false },
  wave: { name: 'Wave', short: 'W', color: 'var(--wave)', mm: true },
  om: { name: 'Orange Money', short: 'OM', color: 'var(--om)', mm: true },
  mtn: { name: 'MTN MoMo', short: 'MTN', color: 'var(--mtn)', mm: true },
  moov: { name: 'Moov Money', short: 'MV', color: 'var(--moov)', mm: true },
};
export const METHOD_KEYS = Object.keys(METHODS) as PayMethod[];

export const phoneIntl = (p: string) => {
  const d = p.replace(/\D/g, '');
  if (d.startsWith('225') || d.startsWith('33')) return d;
  if (d.length === 10) return '225' + d; // numéros ivoiriens à 10 chiffres
  return d;
};
export const phonePretty = (p: string) => {
  const d = p.replace(/\D/g, '');
  const local = d.startsWith('225') ? d.slice(3) : d;
  return local.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
};
export const waLink = (phone: string, text: string) => `https://wa.me/${phoneIntl(phone)}?text=${encodeURIComponent(text)}`;
export const telLink = (phone: string) => `tel:+${phoneIntl(phone)}`;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
