// Synchronisation avec Supabase : chaque enregistrement modifié part au serveur
// (ou attend dans une file s'il n'y a pas de réseau), et les changements faits sur
// l'autre téléphone arrivent en temps réel.
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { State } from './types';
import { COLLECTIONS, get, getMode, setCommitHook, applyRemote, setOutbox } from './store';

// Valeurs publiques (protégées par les règles RLS) ; peuvent être remplacées par les variables d'environnement Vercel.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zglrqjxaimkkuymwvjal.supabase.co';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_XiS6Ywl9aejTMANv_8eKiQ_MXyYkHxq';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

type Row = { business_id: string; collection: string; id: string; data: unknown };
const QKEY = 'salome-outbox';
const queue = new Map<string, Row>();
const sent = new Map<string, string>(); // dernière version connue du serveur
let channel: RealtimeChannel | null = null;
let flushing = false;
let lastError = '';
export const syncError = () => lastError;

function persistQueue() { try { localStorage.setItem(QKEY, JSON.stringify(Array.from(queue.values()))); } catch { /* */ } setOutbox(queue.size); }
function loadQueue() { try { for (const r of JSON.parse(localStorage.getItem(QKEY) || '[]') as Row[]) queue.set(`${r.collection}/${r.id}`, r); } catch { /* */ } }

function each(s: State, f: (coll: string, id: string, data: unknown) => void) {
  f('business', s.business.id, s.business);
  for (const c of COLLECTIONS) for (const x of s[c] as { id: string }[]) f(c, x.id, x);
}

/** Repère ce qui a changé depuis la dernière synchro et le met dans la file. */
function onCommit(s: State) {
  if (!s.cloud) return;
  const b = s.cloud.businessId;
  each(s, (coll, id, data) => {
    if (coll === 'log' && sent.has(`log/${id}`)) return;
    const k = `${coll}/${id}`;
    const j = JSON.stringify(data);
    if (sent.get(k) !== j) { sent.set(k, j); queue.set(k, { business_id: b, collection: coll, id, data }); }
  });
  persistQueue();
  void flush();
}

export async function flush() {
  if (flushing || !queue.size || !navigator.onLine) return;
  flushing = true;
  try {
    const rows = Array.from(queue.values());
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const { error } = await sb.from('records').upsert(chunk, { onConflict: 'business_id,collection,id' });
      if (!error) { chunk.forEach(r => queue.delete(`${r.collection}/${r.id}`)); lastError = ''; continue; }
      if (error.code === '42501' && chunk.length > 1) {
        // un enregistrement refusé (ex. clôture déjà envoyée) : on renvoie un par un
        for (const r of chunk) {
          const e = (await sb.from('records').upsert(r, { onConflict: 'business_id,collection,id' })).error;
          if (!e || e.code === '42501') queue.delete(`${r.collection}/${r.id}`);
        }
        continue;
      }
      if (error.code === '42501') { chunk.forEach(r => queue.delete(`${r.collection}/${r.id}`)); continue; }
      lastError = error.message; break;
    }
  } catch (e) { lastError = String(e); }
  flushing = false;
  persistQueue();
}

/** Télécharge tout le commerce depuis le serveur. */
export async function pullAll(businessId: string) {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('records').select('collection,id,data,business_id').eq('business_id', businessId).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data as Row[]));
    if (!data || data.length < 1000) break;
  }
  for (const r of rows) sent.set(`${r.collection}/${r.id}`, JSON.stringify(r.data));
  // une modification locale en attente reste prioritaire
  applyRemote(rows.filter(r => !queue.has(`${r.collection}/${r.id}`)));
  return rows.length;
}

function subscribe(businessId: string) {
  channel?.unsubscribe();
  channel = sb.channel('records-' + businessId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `business_id=eq.${businessId}` }, payload => {
      const r = payload.new as Row;
      if (!r?.id) return;
      const k = `${r.collection}/${r.id}`;
      const j = JSON.stringify(r.data);
      if (sent.get(k) === j || queue.has(k)) return;
      sent.set(k, j);
      applyRemote([r]);
    })
    .subscribe();
}

/** Démarre la synchro pour le commerce connecté de ce téléphone. */
export async function startSync() {
  const s = get();
  if (getMode() !== 'cloud' || !s.cloud) return;
  loadQueue();
  // tout ce qui est en local et pas dans la file est considéré comme déjà envoyé
  each(s, (coll, id, data) => { const k = `${coll}/${id}`; if (!queue.has(k)) sent.set(k, JSON.stringify(data)); });
  setCommitHook(onCommit);
  setOutbox(queue.size);
  window.addEventListener('online', () => { void flush(); void pullAll(s.cloud!.businessId).catch(() => {}); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void pullAll(s.cloud!.businessId).catch(() => {}); });
  subscribe(s.cloud.businessId);
  await flush();
  try { await pullAll(s.cloud.businessId); } catch { /* hors ligne : on garde le local */ }
}

/** Premier envoi d'un commerce tout neuf (tout part au serveur). */
export function seedUpload(s: State) { setCommitHook(onCommit); onCommit(s); subscribe(s.cloud!.businessId); }

export async function signOutAll() {
  channel?.unsubscribe(); channel = null;
  queue.clear(); sent.clear(); persistQueue();
  await sb.auth.signOut().catch(() => {});
}
