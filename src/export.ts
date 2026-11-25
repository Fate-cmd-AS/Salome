// Export Excel de tous les mouvements, pour l'analyse financière.
// La bibliothèque Excel n'est chargée qu'au moment de l'export (l'appli reste légère).
import type { State, Person } from './types';
import { dayKey, METHODS, lineTotal, isWeighed, shiftDay } from './format';

/** Le propriétaire exporte toujours ; un gérant seulement si le propriétaire l'a autorisé. */
export function canExport(s: State, p?: Person) {
  if (!p || !s.session) return false;
  return s.session.role === 'owner' || (p.role === 'manager' && !!p.canExport);
}

type Row = Record<string, string | number | Date | null>;

export async function exportExcel(s: State, from: string, to: string) {
  const XLSX = await import('xlsx');
  const tz = s.business.tz;
  const inRange = (ts: number) => { const d = dayKey(ts); return d >= from && d <= to; };
  const dayIn = (d: string) => d >= from && d <= to;
  const name = (id: string) => s.people.find(p => p.id === id)?.name ?? '';
  // date locale du commerce, enregistrée comme vraie date Excel
  const local = (ts: number) => {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date(ts));
    const g = (t: string) => Number(p.find(x => x.type === t)?.value);
    return new Date(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  };
  const asDay = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd); };
  const meth = (m?: string) => (m ? METHODS[m as keyof typeof METHODS]?.name ?? m : '');
  const prod = (id: string | null) => s.products.find(p => p.id === id);

  const sales = s.sales.filter(x => inRange(x.at)).sort((a, b) => a.at - b.at);
  const ventes: Row[] = sales.map(x => ({
    'Date et heure': local(x.at), 'Jour': dayKey(x.at), 'N° vente': x.id,
    'Articles': x.items.map(i => (isWeighed(i.unit) ? `${i.qty} ${i.unit} ${i.name}` : `${i.qty} x ${i.name}`)).join(', '),
    'Montant (F)': x.total, 'Paiement': meth(x.method), 'Statut': x.status === 'ok' ? 'Validée' : 'Annulée',
    'Motif annulation': x.cancelReason ?? '',
    'Confirmé par opérateur': x.method === 'cash' ? '' : x.mmConfirmed ? 'Oui' : 'Non', 'Réf. opérateur': x.mmRef ?? '',
    'Téléphone client': x.customerPhone ?? '',
    'Vérification client': x.check ? (x.check.result === 'confirmed' ? 'Confirmée' : 'Contestée') : '',
    'Saisie par': name(x.byId),
  }));
  const lignes: Row[] = sales.flatMap(x => x.items.map(i => {
    const p = prod(i.productId);
    const ca = lineTotal(i);
    const cout = Math.round((p?.cost ?? 0) * i.qty);
    return {
      'Date et heure': local(x.at), 'Jour': dayKey(x.at), 'N° vente': x.id, 'Article': i.name, 'Catégorie': p?.category ?? 'Montant libre',
      'Quantité': i.qty, 'Unité': i.unit ?? p?.unit ?? '', 'Prix unitaire (F)': i.price, 'Montant (F)': ca,
      "Coût d'achat (F)": cout, 'Marge (F)': ca - cout, 'Paiement': meth(x.method), 'Statut': x.status === 'ok' ? 'Validée' : 'Annulée',
    };
  }));
  const depenses: Row[] = s.expenses.filter(e => inRange(e.at)).sort((a, b) => a.at - b.at).map(e => ({
    'Date et heure': local(e.at), 'Jour': dayKey(e.at), 'Libellé': e.label, 'Catégorie': e.category, 'Montant (F)': e.amount,
    'Statut': e.status === 'approved' ? 'Validée' : e.status === 'rejected' ? 'Refusée' : 'En attente',
    'Reçu photo': e.photo ? 'Oui' : 'Non', 'Position': e.geo ? 'Oui' : 'Non', 'Saisie par': name(e.byId),
    'Décision le': e.decidedAt ? local(e.decidedAt) : null, 'Note': e.note ?? '',
  }));
  const caisse: Row[] = s.closes.filter(c => dayIn(c.day)).sort((a, b) => a.day.localeCompare(b.day)).map(c => ({
    'Jour': c.day, 'Heure de clôture': local(c.at), 'Attendu (F)': c.expected, 'Compté (F)': c.counted, 'Écart (F)': c.gap,
    'Par': name(c.byId), 'Remarque': c.note ?? '',
  }));
  const stock: Row[] = s.stockMoves.filter(m => inRange(m.at)).sort((a, b) => a.at - b.at).map(m => {
    const p = prod(m.productId);
    return {
      'Date et heure': local(m.at), 'Article': p?.name ?? m.productId, 'Mouvement': m.kind === 'delivery' ? 'Livraison' : m.kind === 'loss' ? 'Casse / perte' : 'Inventaire',
      'Quantité (+/-)': m.qty, 'Unité': p?.unit ?? '', 'Attendu (inventaire)': m.expected ?? null, 'Compté (inventaire)': m.counted ?? null,
      'Valeur au prix de vente (F)': Math.round(m.qty * (p?.price ?? 0)), 'Note': m.note ?? '', 'Par': name(m.byId),
    };
  });
  const articles: Row[] = s.products.map(p => ({
    'Article': p.name, 'Catégorie': p.category, 'Unité': p.unit, 'Prix de vente (F)': p.price, "Prix d'achat (F)": p.cost,
    'Stock suivi': p.trackStock ? 'Oui' : 'Non', 'Stock actuel': p.trackStock ? p.stock : null, 'En vente': p.archived ? 'Non (retiré)' : 'Oui',
  }));
  const months = new Set<string>(); for (let d = from; d <= to; d = shiftDay(d, 1)) months.add(d.slice(0, 7));
  const paie: Row[] = s.payRuns.filter(r => months.has(r.month)).flatMap(r => r.lines.map(l => ({
    'Mois': r.month, 'Personne': name(l.personId), 'Salaire de base (F)': l.base, "Jours d'absence": l.absentDays, 'Retenue (F)': l.deduction,
    'Avances (F)': l.advances, 'Prime (F)': l.bonus, 'Net (F)': l.net, 'Payé le': l.paidAt ? local(l.paidAt) : null, 'Moyen': meth(l.method), 'Réf.': l.ref ?? '',
  })));
  const avances: Row[] = s.advances.filter(a => inRange(a.at)).map(a => ({ 'Date': local(a.at), 'Personne': name(a.personId), 'Montant (F)': a.amount, 'Note': a.note ?? '' }));
  const factures: Row[] = s.invoices.filter(i => inRange(i.issuedAt) || (i.paidAt && inRange(i.paidAt))).map(i => ({
    'N°': i.number, 'Type': i.kind === 'client' ? 'Client (à encaisser)' : 'Fournisseur (à payer)', 'Tiers': i.party, 'Montant (F)': i.total,
    'Émise le': local(i.issuedAt), 'Échéance': local(i.dueAt), 'Payée le': i.paidAt ? local(i.paidAt) : null, 'Moyen': meth(i.method),
  }));

  // synthèse jour par jour
  const synth: Row[] = [];
  for (let d = from; d <= to; d = shiftDay(d, 1)) {
    const ok = s.sales.filter(x => x.status === 'ok' && dayKey(x.at) === d);
    const rec = ok.reduce((a, x) => a + x.total, 0);
    const cash = ok.filter(x => x.method === 'cash').reduce((a, x) => a + x.total, 0);
    const marge = ok.reduce((a, x) => a + x.items.reduce((b, i) => b + lineTotal(i) - Math.round((prod(i.productId)?.cost ?? 0) * i.qty), 0), 0);
    const dep = s.expenses.filter(e => dayKey(e.at) === d && e.status !== 'rejected').reduce((a, e) => a + e.amount, 0);
    const c = s.closes.find(x => x.day === d);
    synth.push({
      'Jour': asDay(d), 'Nombre de ventes': ok.length, 'Recette (F)': rec, 'dont espèces (F)': cash, 'dont mobile money (F)': rec - cash,
      'Marge sur articles (F)': marge, 'Dépenses (F)': dep, 'Recette - dépenses (F)': rec - dep, 'Écart de caisse (F)': c ? c.gap : null,
      'Ventes annulées': s.sales.filter(x => x.status === 'cancelled' && dayKey(x.at) === d).length,
    });
  }
  const journal: Row[] = s.log.filter(l => inRange(l.at)).sort((a, b) => a.at - b.at).map(l => ({ 'Date et heure': local(l.at), 'Par': name(l.byId), 'Action': l.action, 'Détail': l.detail }));

  const wb = XLSX.utils.book_new();
  const add = (title: string, rows: Row[], empty: string) => {
    const ws = rows.length ? XLSX.utils.json_to_sheet(rows, { cellDates: true, dateNF: 'dd/mm/yyyy hh:mm' }) : XLSX.utils.aoa_to_sheet([[empty]]);
    if (rows.length) {
      const keys = Object.keys(rows[0]);
      ws['!cols'] = keys.map(k => ({ wch: Math.min(40, Math.max(k.length + 2, ...rows.slice(0, 200).map(r => String(r[k] ?? '').length + 1))) }));
      ws['!autofilter'] = { ref: ws['!ref']! };
      // format des montants et des dates
      const range = XLSX.utils.decode_range(ws['!ref']!);
      for (let c = range.s.c; c <= range.e.c; c++) {
        const isDayCol = keys[c] === 'Jour' && title === 'Synthèse par jour';
        for (let r = 1; r <= range.e.r; r++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (!cell) continue;
          if (cell.t === 'n' && /\(F\)/.test(keys[c])) cell.z = '#,##0';
          if (cell.t === 'd') cell.z = isDayCol ? 'dd/mm/yyyy' : 'dd/mm/yyyy hh:mm';
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, title);
  };
  add('Synthèse par jour', synth, 'Aucune donnée');
  add('Ventes', ventes, 'Aucune vente sur la période');
  add('Lignes de vente', lignes, 'Aucune vente sur la période');
  add('Dépenses', depenses, 'Aucune dépense sur la période');
  add('Caisse', caisse, 'Aucune clôture sur la période');
  add('Stock', stock, 'Aucun mouvement de stock sur la période');
  add('Articles', articles, 'Aucun article');
  add('Paie', paie, 'Aucun salaire payé sur la période');
  add('Avances', avances, 'Aucune avance sur la période');
  add('Factures', factures, 'Aucune facture sur la période');
  add('Journal', journal, 'Aucune action sur la période');

  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true });
  const clean = s.business.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const filename = `Salome_${clean || 'commerce'}_${from}_au_${to}.xlsx`;
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return { blob, filename, counts: { ventes: ventes.length, depenses: depenses.length } };
}

/** Enregistre ou partage le fichier (sur iPhone : feuille de partage, « Enregistrer dans Fichiers »). */
export async function saveFile(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try { await nav.share({ files: [file], title: filename }); return 'shared'; } catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
