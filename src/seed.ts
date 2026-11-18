// Données de démonstration : Maquis Le Baobab, Marcory (Abidjan).
// Propriétaire : Moussa, à Paris. Gérante : Awa.
import type { State, Sale, Expense, CashClose, Attendance, PayMethod, StockMove, Product } from './types';
import { dayKey, shiftDay, weekday } from './format';

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RECEIPT_SVG = (label: string, amount: string) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160"><rect width="120" height="160" fill="#efe9dc"/><rect x="14" y="10" width="92" height="140" fill="#fffdf7" stroke="#d8cfbb"/><text x="60" y="30" font-size="9" text-anchor="middle" font-family="monospace" fill="#555">REÇU</text><text x="60" y="48" font-size="7" text-anchor="middle" font-family="monospace" fill="#777">${label}</text><g stroke="#ccc">${[62, 72, 82, 92, 102].map(y => `<line x1="24" x2="96" y1="${y}" y2="${y}"/>`).join('')}</g><text x="60" y="128" font-size="10" text-anchor="middle" font-family="monospace" fill="#333">${amount}</text></svg>`);

export function makeSeed(now = Date.now()): State {
  const r = rng(20261118);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const t = dayKey(now);
  const at = (day: string, h: number, m = 0) => Date.parse(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);

  const products = starterProducts([41, 30, 14, 26, 9]);
  const methodPick = (): PayMethod => { const x = r(); return x < 0.55 ? 'cash' : x < 0.8 ? 'wave' : x < 0.92 ? 'om' : x < 0.97 ? 'mtn' : 'moov'; };
  const phones = ['0707112233', '0505889012', '0141526374', '0778901234', '0102030405', '0546372819', '0789654123', '0170809010'];
  const staffIds = ['u2', 'u3', 'u5'];
  const REST: Record<string, number> = { u2: 1, u3: 2, u4: 3, u5: 4 };

  const sales: Sale[] = [];
  const expenses: Expense[] = [];
  const closes: CashClose[] = [];
  const attendance: Attendance[] = [];
  const moves: StockMove[] = [];
  const nowHour = new Date(now).getUTCHours() + new Date(now).getUTCMinutes() / 60;
  const zone = { lat: 5.30048, lng: -3.98862 };
  const geoIn = () => ({ lat: zone.lat + (r() - 0.5) * 0.0008, lng: zone.lng + (r() - 0.5) * 0.0008, acc: 15 + Math.round(r() * 20) });

  for (let d = 20; d >= 0; d--) {
    const day = shiftDay(t, -d);
    const wd = weekday(day);
    const isToday = d === 0;
    const busy = wd === 5 || wd === 6 ? 1.45 : wd === 0 ? 1.2 : 1;
    const n = Math.round((34 + r() * 16) * busy);
    let cashIn = 0;
    for (let i = 0; i < n; i++) {
      // plus de monde le midi et le soir
      const h = r() < 0.35 ? 12 + r() * 2.5 : 18 + r() * 5;
      if (isToday && h > nowHour - 0.05) continue;
      const items = [] as Sale['items'];
      const k = 1 + Math.floor(r() * 3);
      for (let j = 0; j < k; j++) {
        const p = pick(products);
        const qty = p.category === 'Boissons' ? 1 + Math.floor(r() * 3) : 1 + Math.floor(r() * 2);
        const ex = items.find(x => x.productId === p.id);
        if (ex) ex.qty += qty; else items.push({ productId: p.id, name: p.name, qty, price: p.price });
      }
      const total = items.reduce((s, x) => s + x.qty * x.price, 0);
      const method = methodPick();
      const ts = at(day, Math.floor(h), Math.floor((h % 1) * 60));
      const hasPhone = r() < 0.42;
      const s: Sale = {
        id: `s${d}-${i}`, at: ts, items, total, method, byId: 'u2', status: 'ok',
        customerPhone: hasPhone ? pick(phones) : undefined,
        receipt: hasPhone ? 'sms' : 'none',
      };
      if (method !== 'cash') { s.mmRef = method.toUpperCase() + Math.floor(1e8 + r() * 9e8); s.mmConfirmed = true; }
      if (method === 'cash') cashIn += total;
      sales.push(s);
    }
    // dépenses du jour
    const exps: [string, string, number][] = [['Marché (poulets, poissons, légumes)', 'Achats cuisine', Math.round((18000 + r() * 16000) / 500) * 500]];
    if (wd === 1) exps.push(['Recharge gaz 12,5 kg', 'Gaz', 6500]);
    if (r() < 0.5) exps.push(['Transport livraison casiers', 'Transport', 1500]);
    let cashOut = 0;
    exps.forEach(([label, category, amount], i) => {
      if (isToday && nowHour < 10) return;
      const e: Expense = { id: `e${d}-${i}`, at: at(day, 9 + i, 20), label, category, amount, byId: 'u2', geo: geoIn(), photo: RECEIPT_SVG(label.slice(0, 18), amount + ' F'), status: isToday && amount > 10000 ? 'pending' : 'approved', decidedAt: isToday && amount > 10000 ? undefined : at(day, isToday ? 10 : 21, 5) };
      expenses.push(e); cashOut += amount;
    });
    // pointage
    for (const pid of staffIds.concat('u4')) {
      if (wd === REST[pid]) continue; // jour de repos
      if (pid === 'u4' && (d === 6 || d === 13)) continue; // Ibrahim absent
      if (isToday && pid === 'u3') continue; // Koffi pas encore arrivé
      if (isToday && nowHour < 10) continue;
      const late = r() < 0.15 ? 50 : 0;
      attendance.push({ id: `a${d}-${pid}`, personId: pid, day, inAt: at(day, 10, Math.floor(r() * 25) + late), outAt: isToday ? undefined : at(day, 23, 10 + Math.floor(r() * 20)), geo: geoIn(), inZone: true, byId: 'u2' });
    }
    // clôture
    if (!isToday) {
      const expected = 25000 + cashIn - cashOut;
      let gap = Math.round((r() - 0.6) * 4) * 250;
      if (d === 1) gap = -6500;
      if (d === 4) gap = -3000;
      closes.push({ id: `c${d}`, day, at: at(day, 23, 40), expected, counted: expected + gap, gap, byId: 'u2' });
    }
    if (wd === 2 && d > 0) {
      moves.push({ id: `m${d}a`, at: at(day, 11, 0), productId: 'p7', kind: 'delivery', qty: 48, byId: 'u2', note: 'Livraison Solibra, 2 casiers' });
      moves.push({ id: `m${d}b`, at: at(day, 11, 1), productId: 'p8', kind: 'delivery', qty: 24, byId: 'u2', note: 'Livraison Solibra, 1 casier' });
    }
  }
  moves.push({ id: 'minv', at: at(shiftDay(t, -2), 22, 50), productId: 'p7', kind: 'inventory', qty: -7, expected: 48, counted: 41, byId: 'u2', note: 'Inventaire du soir' });

  sales.sort((a, b) => a.at - b.at);
  // Événements à surveiller aujourd'hui
  const todays = sales.filter(s => dayKey(s.at) === t);
  if (todays.length > 4) {
    const c = todays[Math.floor(todays.length / 2)];
    c.status = 'cancelled'; c.cancelReason = 'Erreur de saisie'; c.cancelledAt = c.at + 25 * 60000;
    const w = todays.find(s => s.method === 'wave' && s.status === 'ok');
    if (w) { w.mmConfirmed = false; w.mmRef = undefined; }
  }
  if (nowHour >= 10) {
    expenses.push({ id: 'e-np', at: at(t, Math.min(Math.floor(nowHour), 12), 5), label: 'Réparation congélateur', category: 'Entretien', amount: 12000, byId: 'u2', geo: null, status: 'pending' });
  }
  const y = sales.filter(s => dayKey(s.at) === shiftDay(t, -1) && s.customerPhone && s.total >= 6000);
  if (y[0]) y[0].check = { result: 'disputed', at: at(shiftDay(t, -1), 22, 0), note: 'Le client dit avoir payé 12 000 F' };
  if (y[1]) y[1].check = { result: 'confirmed', at: at(shiftDay(t, -1), 22, 5) };

  const month = t.slice(0, 7);
  return {
    version: 1,
    business: {
      id: 'b1', name: 'Maquis Le Baobab', kind: 'Maquis', city: 'Abidjan', district: 'Marcory', tz: 'Africa/Abidjan',
      zone: { ...zone, radiusM: 150 }, openingFloat: 25000,
      settings: { cashGapAlert: 2000, expenseApprovalAbove: 10000, openHour: 10, closeHour: 23 },
    },
    people: [
      { id: 'u1', name: 'Moussa', job: 'Propriétaire', phone: '33612345678', role: 'owner', pin: '1111', salary: 0, payMethod: 'wave', active: true },
      { id: 'u2', name: 'Awa', job: 'Gérante', phone: '0707000001', role: 'manager', pin: '2222', salary: 120000, payMethod: 'wave', restDay: 1, active: true },
      { id: 'u3', name: 'Koffi', job: 'Serveur', phone: '0505000002', role: 'staff', salary: 60000, payMethod: 'om', restDay: 2, active: true },
      { id: 'u4', name: 'Ibrahim', job: 'Serveur', phone: '0101000003', role: 'staff', salary: 60000, payMethod: 'wave', restDay: 3, active: true },
      { id: 'u5', name: 'Mariam', job: 'Cuisinière', phone: '0707000004', role: 'staff', salary: 75000, payMethod: 'wave', restDay: 4, active: true },
    ],
    products, sales, expenses, stockMoves: moves, closes, attendance,
    reminders: [
      { id: 'r1', at: at(shiftDay(t, -2), 15, 0), text: 'Commander 3 casiers de Flag avant vendredi', to: 'u2', ackAt: at(shiftDay(t, -2), 15, 12), doneAt: at(shiftDay(t, -1), 11, 0) },
      { id: 'r2', at: now - 3 * 3600e3, text: 'Envoyer la photo du compteur CIE', to: 'u2', due: t },
    ],
    advances: [{ id: 'ad1', personId: 'u3', at: Date.parse(month + '-08T12:00:00Z'), amount: 10000, note: 'Avance sur salaire' }],
    payRuns: [],
    invoices: [
      { id: 'i1', number: 'FF-2026-014', kind: 'supplier', party: 'Solibra, dépôt Marcory', phone: '0707998877', lines: [{ label: 'Casiers Flag 65 cl', qty: 4, price: 15600 }, { label: 'Casiers Bock 65 cl', qty: 1, price: 15600 }], total: 78000, issuedAt: now - 4 * 864e5, dueAt: now + 3 * 864e5 },
      { id: 'i2', number: 'F-2026-007', kind: 'client', party: 'Famille Kouassi (mariage)', phone: '0778901234', lines: [{ label: 'Service traiteur 50 couverts', qty: 50, price: 5000 }], total: 250000, issuedAt: now - 12 * 864e5, dueAt: now - 2 * 864e5 },
      { id: 'i3', number: 'F-2026-006', kind: 'client', party: 'Entreprise BTP Zone 4', phone: '0545454545', lines: [{ label: 'Repas équipe (forfait mensuel)', qty: 1, price: 180000 }], total: 180000, issuedAt: now - 20 * 864e5, dueAt: now - 5 * 864e5, paidAt: now - 6 * 864e5, method: 'wave' },
    ],
    log: [],
    seenAlerts: [],
    outbox: 0,
    session: null,
  };
}

/** Catalogue de départ d'un maquis (modifiable par le propriétaire). */
export function starterProducts(stocks: number[] = []): Product[] {
  const list: Product[] = [
    ['p1', 'Poulet braisé', 'Plats', 5000, 2600, false, 0, 0, 'plat'],
    ['p2', 'Poisson braisé', 'Plats', 6000, 3200, false, 0, 0, 'plat'],
    ['p3', 'Attiéké poisson', 'Plats', 3000, 1500, false, 0, 0, 'plat'],
    ['p4', 'Kédjénou', 'Plats', 4500, 2200, false, 0, 0, 'plat'],
    ['p5', 'Garba', 'Plats', 1000, 550, false, 0, 0, 'plat'],
    ['p6', 'Alloco', 'Accompagnements', 1000, 400, false, 0, 0, 'portion'],
    ['p7', 'Bière Flag 65 cl', 'Boissons', 1000, 650, true, 41, 24, 'bouteille'],
    ['p8', 'Bock 65 cl', 'Boissons', 1000, 650, true, 30, 24, 'bouteille'],
    ['p9', 'Coca-Cola 33 cl', 'Boissons', 500, 300, true, 14, 24, 'bouteille'],
    ['p10', 'Eau 1,5 L', 'Boissons', 500, 280, true, 26, 12, 'bouteille'],
    ['p11', 'Bissap maison', 'Boissons', 500, 150, false, 0, 0, 'verre'],
    ['p12', 'Vin rouge (bouteille)', 'Boissons', 6000, 3500, true, 9, 4, 'bouteille'],
  ].map(([id, name, category, price, cost, trackStock, stock, lowStock, unit]) => ({ id, name, category, price, cost, trackStock, stock, lowStock, unit } as Product));
  let k = 0;
  for (const p of list) if (p.trackStock) p.stock = stocks[k++] ?? 0;
  return list;
}



/** Nouveau commerce connecté, vide. */
export function makeEmpty(o: { name: string; kind: string; district: string; city: string; ownerName: string; userId: string; businessId: string; inviteCode: string; role: 'owner' | 'manager'; fresh?: boolean }): State {
  return {
    version: 1,
    business: { id: o.businessId, name: o.name, kind: o.kind, city: o.city, district: o.district, tz: 'Africa/Abidjan', zone: null, openingFloat: 20000,
      settings: { cashGapAlert: 2000, expenseApprovalAbove: 10000, openHour: 10, closeHour: 23 } },
    people: o.fresh ? [{ id: o.userId, name: o.ownerName, job: 'Propriétaire', phone: '', role: 'owner', salary: 0, payMethod: 'wave', active: true }] : [],
    products: o.fresh ? starterProducts() : [],
    sales: [], expenses: [], stockMoves: [], closes: [], attendance: [], reminders: [], advances: [], payRuns: [], invoices: [], log: [],
    seenAlerts: [], outbox: 0, session: null,
    cloud: { businessId: o.businessId, userId: o.userId, role: o.role, inviteCode: o.inviteCode },
  };
}
