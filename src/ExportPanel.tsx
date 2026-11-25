// Écran d'export Excel (propriétaire, ou gérant autorisé).
import { useState } from 'preact/hooks';
import { useStore, me, logExport } from './store';
import { today, shiftDay, dateShort, dayKey } from './format';
import { canExport, exportExcel, saveFile } from './export';
import { Icon, Field, toast } from './ui';

export function ExportPanel() {
  const s = useStore();
  const t = today();
  const [from, setFrom] = useState(t.slice(0, 8) + '01');
  const [to, setTo] = useState(t);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  if (!canExport(s, me())) return <div class="banner warn">Seul le propriétaire peut exporter les données, ou une personne qu'il a autorisée.</div>;
  const presets: [string, string, string][] = [
    ['Ce mois', t.slice(0, 8) + '01', t],
    ['Mois dernier', shiftDay(t.slice(0, 8) + '01', -1).slice(0, 8) + '01', shiftDay(t.slice(0, 8) + '01', -1)],
    ['30 derniers jours', shiftDay(t, -29), t],
    ['Depuis le début', dayKey(s.sales.reduce((m, x) => Math.min(m, x.at), Date.now())), t],
  ];
  async function run() {
    if (from > to) { toast('La date de début doit être avant la date de fin'); return; }
    setBusy(true); setDone('');
    try {
      const { blob, filename, counts } = await exportExcel(s, from, to);
      logExport(from, to);
      const r = await saveFile(blob, filename);
      if (r !== 'cancelled') setDone(`${filename} : ${counts.ventes} ventes et ${counts.depenses} dépenses.`);
    } catch (e) { toast("L'export a échoué. Réessayez."); console.error(e); }
    setBusy(false);
  }
  return (
    <div class="stack">
      <p class="muted">Un fichier Excel avec tous les mouvements de la période : synthèse jour par jour (recette, marge, dépenses, écart de caisse), ventes, détail des articles vendus, dépenses, clôtures, stock, articles, paie, avances, factures et journal.</p>
      <div class="chips wrap">{presets.map(([l, f, tt]) => <button key={l} class="chip" aria-pressed={from === f && to === tt} onClick={() => { setFrom(f); setTo(tt); }}>{l}</button>)}</div>
      <div class="grid2">
        <Field label="Du"><input id="exp-from" class="inp" type="date" value={from} max={t} onInput={e => setFrom(e.currentTarget.value)} /></Field>
        <Field label="Au"><input id="exp-to" class="inp" type="date" value={to} max={t} onInput={e => setTo(e.currentTarget.value)} /></Field>
      </div>
      <button class="btn pri big" disabled={busy || !from || !to} onClick={run}><Icon n="doc" size={18} /> {busy ? 'Préparation…' : `Exporter du ${dateShort(Date.parse(from + 'T12:00:00Z'))} au ${dateShort(Date.parse(to + 'T12:00:00Z'))}`}</button>
      {done && <div class="banner ok">Fichier prêt : {done}</div>}
      <p class="hint">Sur iPhone, choisissez « Enregistrer dans Fichiers » ou envoyez-le par e-mail ou WhatsApp. Chaque export est noté dans le journal.</p>
    </div>
  );
}
