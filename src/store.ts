// État de l'appli, actions et sauvegarde locale (hors ligne d'abord).
// Étape 2 : chaque action sera aussi poussée vers Supabase (voir sync.ts à venir).
import { useEffect, useState } from 'preact/hooks';
import type { State, Sale, Expense, PayMethod, Role, CashClose, StockMove, Invoice, PayRun, PayLine, Geo } from './types';
import { makeSeed } from './seed';
import { dayKey, today, setTz, uid, monthKey, hourOf, weekday } from './format';

const MODE_KEY = 'salome-mode';
export type Mode = 'demo' | 'cloud' | null;
let mode: Mode = null;
const key = () => (mode === 'cloud' ? 'salome-cloud-v1' : 'salome-state-v1');
let state: State;
export const getMode = () => mode;
function setMode(m: Mode) { mode = m; try { if (m) localStorage.setItem(MODE_KEY, m); else localStorage.removeItem(MODE_KEY); } catch { /* */ } }
let commitHook: ((s: State) => void) | null = null;
export const setCommitHook = (f: (s: State) => void) => { commitHook = f; };
const subs = new Set<() => void>();

// ---------- sauvegarde (IndexedDB, sinon localStorage, sinon mémoire) ----------
function idb(): Promise<IDBDatabase | null> {
  return new Promise(res => {
    try {
      const req = indexedDB.open('salome', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(null);
    } catch { res(null); }
  });
}
async function load(): Promise<State | null> {
  const db = await idb();
  if (db) {
    const v = await new Promise<unknown>(res => {
      try {
        const g = db.transaction('kv').objectStore('kv').get(key());
        g.onsuccess = () => res(g.result); g.onerror = () => res(null);
      } catch { res(null); }
    });
    if (v) return v as State;
  }
  try { const s = localStorage.getItem(key()); if (s) return JSON.parse(s); } catch { /* indisponible */ }
  return null;
}
let saveTimer: number | undefined;
function save() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    const db = await idb();
    if (db) {
      try { db.transaction('kv', 'readwrite').objectStore('kv').put(state, key()); return; } catch { /* repli */ }
    }
    try { localStorage.setItem(key(), JSON.stringify(state)); } catch { /* mémoire seulement */ }
  }, 250);
}

export async function init() {
  try { mode = (localStorage.getItem(MODE_KEY) as Mode) ?? null; } catch { mode = null; }
  const loaded = mode ? await load() : null;
  if (mode === 'cloud' && !loaded?.cloud) mode = null;
  state = loaded && loaded.version === 1 ? loaded : makeSeed();
  state.session = null; // on redemande le code à chaque ouverture
  if (mode === 'cloud' && state.cloud?.role === 'owner') state.session = { personId: state.cloud.userId, role: 'owner' };
  setTz(state.business.tz);
  if (mode && !loaded) save();
}
export function startDemo() { setMode('demo'); state = makeSeed(); setTz(state.business.tz); save(); notify(); }
/** Ouvre un commerce connecté avec l'état donné (création, invitation ou reconnexion). */
export function startCloud(s: State) {
  setMode('cloud'); state = s; setTz(s.business.tz);
  if (s.cloud?.role === 'owner') state.session = { personId: s.cloud.userId, role: 'owner' };
  save(); notify();
  commitHook?.(state);
}
export function leaveMode() { setMode(null); state = makeSeed(); notify(); }
const notify = () => subs.forEach(f => f());
type Coll = 'people' | 'products' | 'sales' | 'expenses' | 'stockMoves' | 'closes' | 'attendance' | 'reminders' | 'advances' | 'payRuns' | 'invoices' | 'log';
export const COLLECTIONS: Coll[] = ['people', 'products', 'sales', 'expenses', 'stockMoves', 'closes', 'attendance', 'reminders', 'advances', 'payRuns', 'invoices', 'log'];
/** Applique des enregistrements reçus du serveur (sans les renvoyer). */
export function applyRemote(rows: { collection: string; id: string; data: any }[]) {
  if (!rows.length) return;
  const s = { ...state };
  for (const r of rows) {
    if (r.collection === 'business') { s.business = { ...r.data }; continue; }
    const c = r.collection as Coll;
    if (!COLLECTIONS.includes(c)) continue;
    const arr = (s[c] as any[]).slice();
    const i = arr.findIndex(x => x.id === r.id);
    if (i >= 0) arr[i] = r.data; else arr.push(r.data);
    if (c === 'sales' || c === 'expenses' || c === 'attendance' || c === 'stockMoves') arr.sort((a, b) => (a.at ?? a.inAt) - (b.at ?? b.inAt));
    if (c === 'log' || c === 'reminders') arr.sort((a, b) => b.at - a.at);
    (s as any)[c] = arr;
  }
  state = s; setTz(state.business.tz); save(); notify();
}
export function setOutbox(n: number) { if (state.outbox !== n) { state = { ...state, outbox: n }; save(); notify(); } }

export const get = () => state;
function commit(mut: (s: State) => void, logAction?: string, logDetail = '') {
  mut(state);
  if (logAction) state.log.unshift({ id: uid(), at: Date.now(), byId: state.session?.personId ?? '?', action: logAction, detail: logDetail });
  if (state.log.length > 500) state.log.length = 500;
  if (mode === 'demo' && !navigator.onLine) state.outbox += 1;
  state = { ...state };
  if (mode === 'cloud') commitHook?.(state);
  save();
  subs.forEach(f => f());
}
if (typeof window !== 'undefined') window.addEventListener('online', () => { if (mode === 'demo' && state?.outbox) commit(s => { s.outbox = 0; }); });

export function useStore(): State {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set(x => x + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return state;
}

export function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false);
    window.addEventListener('online', a); window.addEventListener('offline', b);
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b); };
  }, []);
  return on;
}

// ---------- requêtes ----------
export const person = (id: string) => state.people.find(p => p.id === id);
export const me = () => (state.session ? person(state.session.personId) : undefined);
export const salesOf = (day: string, s = state) => s.sales.filter(x => dayKey(x.at) === day);
export const okSales = (day: string, s = state) => salesOf(day, s).filter(x => x.status === 'ok');
export const revenue = (day: string, s = state) => okSales(day, s).reduce((a, x) => a + x.total, 0);
export const expensesOf = (day: string, s = state) => s.expenses.filter(x => dayKey(x.at) === day);
export function expectedCash(day: string, s = state) {
  const cashIn = okSales(day, s).filter(x => x.method === 'cash').reduce((a, x) => a + x.total, 0);
  const out = expensesOf(day, s).reduce((a, x) => a + x.amount, 0);
  return s.business.openingFloat + cashIn - out;
}
export const closeOf = (day: string, s = state) => s.closes.find(c => c.day === day);
export function avgRevenue(day: string, n = 4, s = state) {
  // moyenne des n mêmes jours de semaine précédents
  const vals: number[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 7 * i);
    const k = d.toISOString().slice(0, 10);
    const v = revenue(k, s); if (v > 0) vals.push(v);
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}
export function revenueUntilHour(day: string, hour: number, s = state) {
  return okSales(day, s).filter(x => hourOf(x.at) < hour).reduce((a, x) => a + x.total, 0);
}

// ---------- géolocalisation et photo ----------
export function locate(): Promise<Geo> {
  return new Promise(res => {
    try {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(
        p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
        () => res(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
    } catch { res(null); }
  });
}
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371e3, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function inZone(g: Geo): boolean | null {
  const z = state.business.zone;
  if (!g || !z) return null;
  return distanceM(g, z) <= z.radiusM + Math.min(g.acc, 100);
}
/** Réduit une photo (≈480 px, JPEG) pour les téléphones et les petits forfaits. */
export function compressPhoto(file: File, max = 480): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = rej; img.src = url;
  });
}

// ---------- actions ----------
export function login(personId: string, role: Role) { commit(s => { s.session = { personId, role }; }, 'Connexion', role === 'owner' ? 'Propriétaire' : 'Gérante'); }
export function logout() { state = { ...state, session: null }; notify(); }
export function resetDemo() { state = makeSeed(); save(); notify(); }

export function recordSale(input: { items: Sale['items']; method: PayMethod; customerPhone?: string; receipt: Sale['receipt'] }) {
  const total = input.items.reduce((a, x) => a + x.qty * x.price, 0);
  const sale: Sale = { id: uid(), at: Date.now(), items: input.items, total, method: input.method, byId: state.session!.personId, status: 'ok', customerPhone: input.customerPhone || undefined, receipt: input.receipt };
  if (input.method !== 'cash') sale.mmConfirmed = false;
  commit(s => {
    s.sales.push(sale);
    for (const it of input.items) {
      const p = s.products.find(x => x.id === it.productId);
      if (p?.trackStock) p.stock -= it.qty;
    }
  }, 'Vente', `${total} F · ${input.method}`);
  return sale;
}
/** Démo : simule la confirmation de l'opérateur Mobile Money (webhook en production). */
export function confirmMobileMoney(id: string) {
  commit(s => { const x = s.sales.find(v => v.id === id); if (x) { x.mmConfirmed = true; x.mmRef = x.method.toUpperCase() + Math.floor(1e8 + Math.random() * 9e8); } });
}
export function cancelSale(id: string, reason: string) {
  commit(s => {
    const x = s.sales.find(v => v.id === id); if (!x) return;
    x.status = 'cancelled'; x.cancelReason = reason; x.cancelledAt = Date.now();
    for (const it of x.items) { const p = s.products.find(q => q.id === it.productId); if (p?.trackStock) p.stock += it.qty; }
  }, 'Vente annulée', reason);
}
export function checkSale(id: string, result: 'confirmed' | 'disputed', note?: string) {
  commit(s => { const x = s.sales.find(v => v.id === id); if (x) x.check = { result, at: Date.now(), note }; }, result === 'confirmed' ? 'Client a confirmé' : 'Client conteste', note ?? '');
}

export function addExpense(e: Omit<Expense, 'id' | 'at' | 'byId' | 'status'>) {
  const auto = e.amount <= state.business.settings.expenseApprovalAbove && !!e.photo;
  commit(s => { s.expenses.push({ ...e, id: uid(), at: Date.now(), byId: s.session!.personId, status: auto ? 'approved' : 'pending', decidedAt: auto ? Date.now() : undefined }); }, 'Dépense', `${e.label} · ${e.amount} F`);
}
export function decideExpense(id: string, ok: boolean, note?: string) {
  commit(s => { const x = s.expenses.find(v => v.id === id); if (x) { x.status = ok ? 'approved' : 'rejected'; x.decidedAt = Date.now(); x.note = note; } }, ok ? 'Dépense validée' : 'Dépense refusée', note ?? '');
}

export function stockMove(m: Omit<StockMove, 'id' | 'at' | 'byId' | 'qty' | 'expected'> & { qty?: number }) {
  commit(s => {
    const p = s.products.find(x => x.id === m.productId)!;
    const mv: StockMove = { ...m, id: uid(), at: Date.now(), byId: s.session!.personId, qty: m.qty ?? 0 };
    if (m.kind === 'inventory') { mv.expected = p.stock; mv.qty = (m.counted ?? 0) - p.stock; p.stock = m.counted ?? 0; }
    else p.stock += mv.qty;
    s.stockMoves.push(mv);
  }, m.kind === 'delivery' ? 'Réception stock' : m.kind === 'loss' ? 'Perte de stock' : 'Inventaire', m.note ?? '');
}
export function archiveProduct(id: string, archived: boolean) {
  commit(s => { const p = s.products.find(x => x.id === id); if (p) p.archived = archived; }, archived ? 'Article retiré de la vente' : 'Article remis en vente', state.products.find(x => x.id === id)?.name ?? '');
}
export function saveProduct(p: State['products'][number]) {
  commit(s => { const i = s.products.findIndex(x => x.id === p.id); if (i >= 0) s.products[i] = p; else s.products.push(p); }, 'Article modifié', p.name);
}

export function closeDay(counted: number, detail: Record<string, number>, note?: string, photo?: string) {
  const day = today();
  const expected = expectedCash(day);
  const c: CashClose = { id: uid(), day, at: Date.now(), counted, expected, gap: counted - expected, detail, note, photo, byId: state.session!.personId };
  commit(s => { s.closes = s.closes.filter(x => x.day !== day).concat(c); }, 'Clôture de caisse', `${counted} F compté`);
}

export function checkIn(personId: string, geo: Geo, photo?: string) {
  const day = today();
  commit(s => {
    if (s.attendance.some(a => a.personId === personId && a.day === day)) return;
    s.attendance.push({ id: uid(), personId, day, inAt: Date.now(), geo, inZone: inZone(geo), photo, byId: s.session!.personId });
  }, 'Pointage arrivée', person(personId)?.name ?? '');
}
export function checkOut(personId: string) {
  commit(s => { const a = s.attendance.find(x => x.personId === personId && x.day === today()); if (a) a.outAt = Date.now(); }, 'Pointage départ', person(personId)?.name ?? '');
}

export function sendReminder(text: string, to: string, due?: string) { commit(s => { s.reminders.unshift({ id: uid(), at: Date.now(), text, to, due }); }, 'Rappel envoyé', text); }
export function ackReminder(id: string, done = false) {
  commit(s => { const r = s.reminders.find(x => x.id === id); if (r) { r.ackAt ??= Date.now(); if (done) r.doneAt = Date.now(); } }, done ? 'Rappel fait' : 'Rappel lu', '');
}

export function addAdvance(personId: string, amount: number, note?: string) { commit(s => { s.advances.push({ id: uid(), personId, amount, at: Date.now(), note }); }, 'Avance', `${person(personId)?.name} · ${amount} F`); }

export function computePayRun(month: string): PayRun {
  const existing = state.payRuns.find(p => p.month === month);
  const workDays = 26; // base de calcul d'une journée de salaire
  const lines: PayLine[] = state.people.filter(p => p.active && p.role !== 'owner').map(p => {
    const prev = existing?.lines.find(l => l.personId === p.id);
    if (prev?.paidAt) return prev;
    const days = new Set(state.attendance.filter(a => a.personId === p.id && a.day.startsWith(month)).map(a => a.day));
    // jours où la personne devait venir : tous les jours du mois écoulés, sauf son jour de repos
    const t = today();
    const [y, m] = month.split('-').map(Number);
    const last = month === t.slice(0, 7) ? Number(t.slice(8)) : new Date(Date.UTC(y, m, 0)).getUTCDate();
    let expectedDays = 0;
    for (let d = 1; d <= last; d++) {
      const key = `${month}-${String(d).padStart(2, '0')}`;
      if (key === t && !days.has(key)) continue; // la journée n'est pas finie
      if (weekday(key) !== p.restDay) expectedDays++;
    }
    const absentDays = Math.max(0, expectedDays - days.size);
    const deduction = Math.round((p.salary / workDays) * absentDays / 100) * 100;
    const advances = state.advances.filter(a => a.personId === p.id && monthKey(a.at) === month).reduce((s, a) => s + a.amount, 0);
    const bonus = prev?.bonus ?? 0;
    return { personId: p.id, base: p.salary, absentDays, deduction, advances, bonus, net: Math.max(0, p.salary - deduction - advances + bonus) };
  });
  return { id: existing?.id ?? uid(), month, lines };
}
export function payLine(month: string, line: PayLine, method: PayMethod) {
  commit(s => {
    let run = s.payRuns.find(p => p.month === month);
    if (!run) { run = computePayRun(month); s.payRuns.push(run); }
    const i = run.lines.findIndex(l => l.personId === line.personId);
    const paid = { ...line, paidAt: Date.now(), method, ref: method.toUpperCase() + Math.floor(1e8 + Math.random() * 9e8) };
    if (i >= 0) run.lines[i] = paid; else run.lines.push(paid);
  }, 'Salaire payé', `${person(line.personId)?.name} · ${line.net} F`);
}

export function saveInvoice(inv: Invoice) {
  commit(s => { const i = s.invoices.findIndex(x => x.id === inv.id); if (i >= 0) s.invoices[i] = inv; else s.invoices.unshift(inv); }, 'Facture', inv.number);
}
export function nextInvoiceNumber(kind: Invoice['kind']) {
  const pre = kind === 'client' ? 'F' : 'FF';
  const y = today().slice(0, 4);
  const n = state.invoices.filter(i => i.kind === kind && i.number.startsWith(`${pre}-${y}`)).map(i => Number(i.number.split('-')[2]) || 0);
  return `${pre}-${y}-${String((n.length ? Math.max(...n) : 0) + 1).padStart(3, '0')}`;
}

export function updateBusiness(b: Partial<State['business']>) { commit(s => { s.business = { ...s.business, ...b }; }, 'Réglages', ''); }
export function updatePerson(id: string, p: Partial<State['people'][number]>) { commit(s => { s.people = s.people.map(x => x.id === id ? { ...x, ...p } : x); }, 'Équipe', p.name ?? ''); }
export function addPerson(p: Omit<State['people'][number], 'id'>) { commit(s => { s.people.push({ ...p, id: uid() }); }, 'Équipe', p.name); }
export function markSeen(ids: string[]) { commit(s => { s.seenAlerts = Array.from(new Set(s.seenAlerts.concat(ids))); }); }
export function upsertPerson(p: State['people'][number]) { commit(s => { const i = s.people.findIndex(x => x.id === p.id); if (i >= 0) s.people[i] = p; else s.people.push(p); }, 'Équipe', p.name); }
