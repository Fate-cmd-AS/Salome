// Règles anti-fraude : chaque règle correspond à une ruse fréquente
// (voir le tableau « fraude → parade » du cahier des charges).
import type { State, Alert } from './types';
import { F, signedF, dayKey, today, shiftDay, hourOf, time, dateShort } from './format';
import { revenue, avgRevenue, revenueUntilHour, closeOf } from './store';

export function computeAlerts(s: State, now = Date.now()): Alert[] {
  const out: Alert[] = [];
  const t = today();
  const since = shiftDay(t, -6); // une semaine glissante
  const recent = (ts: number) => dayKey(ts) >= since;
  const name = (id: string) => s.people.find(p => p.id === id)?.name ?? '?';
  const set = s.business.settings;

  // 1. Écart de caisse à la clôture (argent qui manque)
  for (const c of s.closes) if (c.day >= since && Math.abs(c.gap) >= set.cashGapAlert) {
    out.push({ id: `gap-${c.day}`, at: c.at, level: c.gap < 0 ? 'high' : 'med',
      title: c.gap < 0 ? `Il manque ${F(-c.gap)} en caisse` : `Surplus de ${F(c.gap)} en caisse`,
      detail: `Clôture du ${dateShort(c.at)} par ${name(c.byId)} : ${F(c.counted)} comptés pour ${F(c.expected)} attendus.`, go: { tab: 'caisse', ref: c.day } });
  }
  // 2. Ventes annulées (vendre puis effacer pour garder l'argent)
  for (const x of s.sales) if (x.status === 'cancelled' && recent(x.at)) {
    out.push({ id: `cancel-${x.id}`, at: x.cancelledAt ?? x.at, level: x.total >= 5000 ? 'high' : 'med', title: `Vente de ${F(x.total)} annulée`,
      detail: `${time(x.at)} · motif : « ${x.cancelReason ?? '—'} » · par ${name(x.byId)}`, go: { tab: 'ventes', ref: x.id } });
  }
  // 3. Mobile Money déclaré mais jamais confirmé par l'opérateur (faux paiement)
  for (const x of s.sales) if (x.status === 'ok' && x.method !== 'cash' && x.mmConfirmed === false && now - x.at > 10 * 60e3 && recent(x.at)) {
    out.push({ id: `mm-${x.id}`, at: x.at, level: 'high', title: `Paiement mobile de ${F(x.total)} non reçu`,
      detail: `Déclaré à ${time(x.at)}, mais l'opérateur n'a jamais confirmé. L'argent n'est pas sur votre compte.`, go: { tab: 'ventes', ref: x.id } });
  }
  // 4. Client qui conteste le montant (vente sous-déclarée)
  for (const x of s.sales) if (x.check?.result === 'disputed' && recent(x.at)) {
    out.push({ id: `disp-${x.id}`, at: x.check.at, level: 'high', title: `Un client conteste une vente de ${F(x.total)}`,
      detail: x.check.note ?? 'Le montant enregistré ne correspond pas.', go: { tab: 'ventes', ref: x.id } });
  }
  // 5. Dépenses : sans justificatif, hors du commerce, ou refusées
  for (const e of s.expenses) if (recent(e.at)) {
    if (e.status === 'pending' && !e.photo) out.push({ id: `nophoto-${e.id}`, at: e.at, level: 'med', title: `Dépense sans reçu : ${F(e.amount)}`, detail: `${e.label} · ${name(e.byId)} à ${time(e.at)}`, go: { tab: 'alertes', ref: e.id } });
    if (e.geo && s.business.zone && e.status === 'pending') {
      const z = s.business.zone; const d = Math.hypot((e.geo.lat - z.lat) * 111e3, (e.geo.lng - z.lng) * 111e3);
      if (d > z.radiusM + 300) out.push({ id: `geo-${e.id}`, at: e.at, level: 'med', title: 'Dépense saisie loin du commerce', detail: `${e.label} · à environ ${Math.round(d / 100) / 10} km`, go: { tab: 'alertes', ref: e.id } });
    }
  }
  // 6. Inventaire : bouteilles ou marchandises disparues
  for (const m of s.stockMoves) if (m.kind === 'inventory' && m.qty < 0 && recent(m.at)) {
    const p = s.products.find(x => x.id === m.productId);
    const value = -m.qty * (p?.price ?? 0);
    out.push({ id: `inv-${m.id}`, at: m.at, level: value >= 5000 ? 'high' : 'med', title: `${-m.qty} ${p?.unit ?? 'unité'}(s) de ${p?.name ?? '?'} manquent`,
      detail: `Inventaire : ${m.counted} comptés pour ${m.expected} attendus, soit ${F(value)} de ventes perdues.`, go: { tab: 'stock', ref: m.productId } });
  }
  // 7. Pertes déclarées fréquentes
  const losses = s.stockMoves.filter(m => m.kind === 'loss' && recent(m.at));
  if (losses.length >= 3) out.push({ id: `loss-${t}-${losses.length}`, at: losses[losses.length - 1].at, level: 'med', title: `${losses.length} pertes ou casses en 7 jours`, detail: 'Vérifiez avec la gérante, ou demandez une photo à chaque casse.', go: { tab: 'stock' } });
  // 8. Pas de clôture hier
  const y = shiftDay(t, -1);
  if (!closeOf(y, s) && revenue(y, s) > 0) out.push({ id: `noclose-${y}`, at: now, level: 'med', title: "La caisse d'hier n'a pas été clôturée", detail: "Demandez à la gérante de compter la caisse chaque soir.", go: { tab: 'caisse' } });
  // 9. Recette anormalement basse par rapport aux mêmes jours (recettes non déclarées)
  const h = hourOf(now);
  if (h >= 15) {
    const avg = avgRevenue(t, 4, s);
    // comparer à la même heure les jours précédents
    let ref = 0, n = 0;
    for (let i = 1; i <= 4; i++) { const d = shiftDay(t, -7 * i); const v = revenueUntilHour(d, h, s); if (v) { ref += v; n++; } }
    const cur = revenueUntilHour(t, h, s);
    if (n && avg && cur < 0.6 * (ref / n)) out.push({ id: `low-${t}-${h}`, at: now, level: 'med', title: 'Recette du jour anormalement basse',
      detail: `${F(cur)} à ${h} h, contre ${F(ref / n)} en moyenne les mêmes jours (${signedF(cur - ref / n)}).`, go: { tab: 'accueil' } });
  }
  // 10. Retards et absences du jour
  if (h >= s.business.settings.openHour + 1) {
    for (const p of s.people) if (p.active && p.role !== 'owner' && p.restDay !== new Date(t + 'T12:00:00Z').getUTCDay()) {
      if (!s.attendance.some(a => a.personId === p.id && a.day === t)) out.push({ id: `abs-${p.id}-${t}`, at: now, level: 'low', title: `${p.name} n'a pas pointé aujourd'hui`, detail: `${p.job} · attendu à ${s.business.settings.openHour} h`, go: { tab: 'equipe' } });
    }
  }
  for (const a of s.attendance) if (a.day === t && a.inZone === false) out.push({ id: `zone-${a.id}`, at: a.inAt, level: 'med', title: `${name(a.personId)} a pointé hors du commerce`, detail: `À ${time(a.inAt)}. La position ne correspond pas à l'adresse du commerce.`, go: { tab: 'equipe' } });
  // 11. Rappels ignorés
  for (const r of s.reminders) if (!r.ackAt && now - r.at > 2 * 3600e3) out.push({ id: `rem-${r.id}`, at: r.at, level: 'low', title: 'Rappel pas encore lu', detail: `« ${r.text} » envoyé à ${time(r.at)}`, go: { tab: 'equipe' } });
  // 12. Factures en retard
  for (const i of s.invoices) if (!i.paidAt && i.dueAt < now) out.push({ id: `inv-late-${i.id}`, at: i.dueAt, level: i.kind === 'client' ? 'med' : 'low', title: i.kind === 'client' ? `${i.party} vous doit ${F(i.total)}` : `Facture ${i.party} à payer`, detail: `Facture ${i.number}, échue le ${dateShort(i.dueAt)}`, go: { tab: 'factures', ref: i.id } });

  const rank = { high: 0, med: 1, low: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || b.at - a.at);
}

/** Score de confiance (0-100) sur 7 jours : plus il est haut, moins il y a d'anomalies. */
export function trustScore(alerts: Alert[]) {
  const p = alerts.reduce((s, a) => s + (a.level === 'high' ? 12 : a.level === 'med' ? 5 : 1), 0);
  return Math.max(0, 100 - p);
}
