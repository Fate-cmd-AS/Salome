// Appli de la gérante (sur place) : vendre, dépenser, stock, pointage, clôture.
import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  useStore, me, person, recordSale, confirmMobileMoney, cancelSale, addExpense, stockMove, closeDay, checkIn, checkOut,
  ackReminder, locate, logout, salesOf, closeOf, inZone,
} from '../store';
import { F, fmt, time, today, dateLong, METHODS, METHOD_KEYS, waLink, phonePretty, dayKey, isWeighed, fmtQty, lineTotal, itemLabel } from '../format';
import type { PayMethod, Product, Sale, Geo } from '../types';
import { Icon, Money, MethodBadge, Pill, Sheet, toast, NetChip, TopBar, BottomNav, Section, Empty, Field, NumInput, DecInput, PhotoInput } from '../ui';

type Tab = 'accueil' | 'vendre' | 'depenses' | 'stock' | 'caisse';

export function ManagerApp() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>('accueil');
  const unread = s.reminders.filter(r => !r.ackAt && (r.to === 'all' || r.to === s.session?.personId)).length;
  const closed = !!closeOf(today());
  const titles: Record<Tab, string> = { accueil: `Bonjour ${me()?.name ?? ''}`, vendre: 'Nouvelle vente', depenses: 'Dépenses', stock: 'Stock', caisse: 'Caisse du jour' };
  return (
    <div class="app">
      <TopBar title={titles[tab]} sub={`${s.business.name} · ${dateLong(Date.now())}`}
        right={<><NetChip /><button class="icon-btn" aria-label="Se déconnecter" onClick={logout}><Icon n="logout" /></button></>} />
      <main class="body">
        {tab === 'accueil' && <Home go={setTab} />}
        {tab === 'vendre' && <Sell />}
        {tab === 'depenses' && <Expenses />}
        {tab === 'stock' && <Stock />}
        {tab === 'caisse' && <Close />}
      </main>
      <BottomNav<Tab> cur={tab} onTab={setTab} tabs={[
        ['accueil', 'Accueil', 'home', unread],
        ['vendre', 'Vendre', 'cart'],
        ['depenses', 'Dépenses', 'receipt'],
        ['stock', 'Stock', 'box'],
        ['caisse', 'Caisse', 'lock', closed ? 0 : undefined],
      ]} />
    </div>
  );
}

// ---------------- Accueil ----------------
function Home({ go }: { go: (t: Tab) => void }) {
  const s = useStore();
  const t = today();
  const mine = s.reminders.filter(r => r.to === 'all' || r.to === s.session?.personId).filter(r => !r.doneAt).slice(0, 5);
  const sales = salesOf(t).filter(x => x.status === 'ok');
  const total = sales.reduce((a, x) => a + x.total, 0);
  const team = s.people.filter(p => p.active && p.role !== 'owner');
  const [pointing, setPointing] = useState<string | null>(null);
  const pending = s.expenses.filter(e => e.status === 'pending');
  return (
    <>
      <div class="hero">
        <div class="lab">Ventes enregistrées aujourd'hui</div>
        <div class="big num">{fmt(total)} <small>F</small></div>
        <div class="lab">{sales.length} vente{sales.length > 1 ? 's' : ''} · la dernière à {sales.length ? time(sales[sales.length - 1].at) : '—'}</div>
        <button class="btn pri big" onClick={() => go('vendre')}><Icon n="plus" size={18} /> Enregistrer une vente</button>
      </div>

      {mine.length > 0 && (
        <Section title="Messages du propriétaire">
          <div class="card list">
            {mine.map(r => (
              <div class="row" key={r.id}>
                <span class="mico" style={{ background: 'var(--accent)' }}><Icon n="bell" size={16} /></span>
                <div class="main"><div class="ttl wrap">{r.text}</div><div class="sub">{time(r.at)}{r.due ? ` · pour ${r.due === t ? "aujourd'hui" : r.due}` : ''}</div></div>
                {!r.ackAt ? <button class="btn sm" onClick={() => ackReminder(r.id)}>J'ai lu</button>
                  : <button class="btn sm pri" onClick={() => { ackReminder(r.id, true); toast('Le propriétaire est prévenu'); }}>C'est fait</button>}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Pointage de l'équipe" aside="avec photo et position">
        <div class="card list">
          {team.map(p => {
            const a = s.attendance.find(x => x.personId === p.id && x.day === t);
            const rest = p.restDay === new Date(t + 'T12:00:00Z').getUTCDay();
            return (
              <div class="row" key={p.id}>
                <span class="av sm">{p.name[0]}</span>
                <div class="main"><div class="ttl">{p.name}</div>
                  <div class="sub">{p.job} · {a ? `arrivé${p.job.endsWith('e') ? 'e' : ''} à ${time(a.inAt)}${a.outAt ? `, parti à ${time(a.outAt)}` : ''}` : rest ? 'jour de repos' : 'pas encore pointé'}</div></div>
                {!a ? <button class="btn sm pri" onClick={() => setPointing(p.id)}>Arrivée</button>
                  : !a.outAt ? <button class="btn sm" onClick={() => { checkOut(p.id); toast(`Départ de ${p.name} enregistré`); }}>Départ</button>
                    : <Pill k="ok">Fini</Pill>}
              </div>
            );
          })}
        </div>
      </Section>

      {pending.length > 0 && (
        <Section title="En attente du propriétaire">
          <div class="card list">
            {pending.map(e => <div class="row" key={e.id}><div class="main"><div class="ttl">{e.label}</div><div class="sub">{time(e.at)} · {e.photo ? 'reçu joint' : 'sans reçu'}</div></div><span class="amt"><Money v={e.amount} /></span></div>)}
          </div>
        </Section>
      )}
      {pointing && <CheckInSheet personId={pointing} onClose={() => setPointing(null)} />}
    </>
  );
}

function useGeo() {
  const [geo, setGeo] = useState<Geo | undefined>(undefined);
  useEffect(() => { locate().then(setGeo); }, []);
  return geo;
}
function GeoLine({ geo }: { geo: Geo | undefined }) {
  if (geo === undefined) return <p class="hint"><Icon n="pin" size={14} /> Recherche de la position…</p>;
  if (geo === null) return <p class="hint warn"><Icon n="pin" size={14} /> Position indisponible. Activez la localisation du téléphone.</p>;
  const z = inZone(geo);
  return <p class={'hint ' + (z === false ? 'warn' : 'okc')}><Icon n="pin" size={14} /> {z === false ? 'Vous semblez loin du commerce' : 'Position enregistrée au commerce'} (± {geo.acc} m)</p>;
}

function CheckInSheet({ personId, onClose }: { personId: string; onClose: () => void }) {
  const p = person(personId)!;
  const geo = useGeo();
  const [photo, setPhoto] = useState<string>();
  return (
    <Sheet title={`Arrivée de ${p.name}`} onClose={onClose} foot={
      <button class="btn pri big" disabled={geo === undefined} onClick={() => { checkIn(personId, geo ?? null, photo); toast(`Arrivée de ${p.name} à ${time(Date.now())}`); onClose(); }}>Valider l'arrivée</button>}>
      <p class="muted">Une photo du visage, prise maintenant au commerce, prouve la présence. Le propriétaire la voit.</p>
      <PhotoInput value={photo} onChange={setPhoto} label="Photo du visage" capture="user" />
      <GeoLine geo={geo} />
    </Sheet>
  );
}

// ---------------- Vendre ----------------
type Line = Sale['items'][number];
function Sell() {
  const s = useStore();
  const [cart, setCart] = useState<Line[]>([]);
  const [cat, setCat] = useState('Tout');
  const [q, setQ] = useState('');
  const [pay, setPay] = useState(false);
  const [free, setFree] = useState(false);
  const [done, setDone] = useState<Sale | null>(null);
  const [cancel, setCancel] = useState<Sale | null>(null);
  const active = s.products.filter(p => !p.archived);
  const cats = ['Tout', ...Array.from(new Set(active.map(p => p.category)))];
  const list = active.filter(p => (cat === 'Tout' || p.category === cat) && p.name.toLowerCase().includes(q.toLowerCase()));
  const [weigh, setWeigh] = useState<Product | null>(null);
  const addQty = (p: Product, q: number) => setCart(c => { const i = c.findIndex(x => x.productId === p.id); if (i >= 0) { const n = [...c]; n[i] = { ...n[i], qty: Math.round((n[i].qty + q) * 1000) / 1000 }; return n; } return [...c, { productId: p.id, name: p.name, qty: q, price: p.price, unit: p.unit }]; });
  const add = (p: Product) => isWeighed(p.unit) ? setWeigh(p) : addQty(p, 1);
  const total = cart.reduce((a, x) => a + lineTotal(x), 0);
  const count = cart.reduce((a, x) => a + (isWeighed(x.unit) ? 1 : x.qty), 0);
  const recent = salesOf(today()).slice(-8).reverse();
  return (
    <>
      <input class="inp" type="search" placeholder="Chercher un article" value={q} onInput={e => setQ(e.currentTarget.value)} />
      <div class="chips">{cats.map(c => <button key={c} class="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}</div>
      <div class="items">
        {list.map(p => {
          const inCart = cart.find(x => x.productId === p.id)?.qty;
          const out = p.trackStock && p.stock <= 0;
          return (
            <button key={p.id} onClick={() => add(p)} class={inCart ? 'in' : ''}>
              <span class="n">{p.name}</span><span class="p num">{fmt(p.price)} F{isWeighed(p.unit) ? ` / ${p.unit}` : ''}</span>
              {p.trackStock && <span class={'st' + (out ? ' bad' : p.stock <= p.lowStock ? ' low' : '')}>{out ? 'épuisé' : `${fmtQty(p.stock)}${isWeighed(p.unit) ? ' ' + p.unit : ''} en stock`}</span>}
              {inCart && <span class="q">{fmtQty(inCart)}</span>}
            </button>
          );
        })}
        <button class="free" onClick={() => setFree(true)}><span class="n">+ Montant libre</span><span class="p">service, autre</span></button>
      </div>

      <Section title="Dernières ventes du jour">
        <div class="card list">
          {recent.length ? recent.map(x => (
            <div class="row" key={x.id}>
              <MethodBadge m={x.method} />
              <div class="main"><div class="ttl">{x.items.map(itemLabel).join(', ')}</div>
                <div class="sub">{time(x.at)}{x.status === 'cancelled' ? ` · annulée (${x.cancelReason})` : x.method !== 'cash' ? (x.mmConfirmed ? ` · reçu par ${METHODS[x.method].name}` : ' · en attente de l\'opérateur') : ''}</div></div>
              <div class="amt">{x.status === 'cancelled' ? <s><Money v={x.total} /></s> : <Money v={x.total} />}
                {x.status === 'ok' && Date.now() - x.at < 30 * 60e3 && <button class="link sm" onClick={() => setCancel(x)}>Annuler</button>}</div>
            </div>
          )) : <Empty>Aucune vente pour l'instant.</Empty>}
        </div>
      </Section>

      {count > 0 && (
        <div class="cartbar">
          <button class="btn ghost" onClick={() => setCart([])}>Vider</button>
          <button class="btn pri grow" onClick={() => setPay(true)}>{count} article{count > 1 ? 's' : ''} · <span class="num">{fmt(total)} F</span> · Encaisser</button>
        </div>
      )}
      {weigh && <WeighSheet p={weigh} onClose={() => setWeigh(null)} onAdd={q => { addQty(weigh, q); setWeigh(null); }} />}
      {free && <FreeAmount onClose={() => setFree(false)} onAdd={l => { setCart(c => [...c, l]); setFree(false); }} />}
      {pay && <PaySheet cart={cart} setCart={setCart} onClose={() => setPay(false)} onDone={sale => { setPay(false); setCart([]); setDone(sale); }} />}
      {done && <DoneSheet sale={done} onClose={() => setDone(null)} />}
      {cancel && <CancelSheet sale={cancel} onClose={() => setCancel(null)} />}
    </>
  );
}

function WeighSheet({ p, onClose, onAdd }: { p: Product; onClose: () => void; onAdd: (q: number) => void }) {
  const [mode, setMode] = useState<'poids' | 'montant'>('poids');
  const [q, setQ] = useState<number | ''>('');
  const [amount, setAmount] = useState<number | ''>('');
  const qty = mode === 'poids' ? Number(q) || 0 : Math.round(((Number(amount) || 0) / p.price) * 1000) / 1000;
  const quick = [0.25, 0.5, 1, 1.5, 2, 3];
  return (
    <Sheet title={p.name} onClose={onClose} foot={
      <button class="btn pri big" disabled={qty <= 0} onClick={() => onAdd(qty)}>Ajouter {fmtQty(qty)} {p.unit} · <span class="num">{fmt(lineTotal({ qty, price: p.price }))} F</span></button>}>
      <p class="muted">{fmt(p.price)} F le {p.unit}</p>
      <div class="seg"><button aria-pressed={mode === 'poids'} onClick={() => setMode('poids')}>Au poids</button><button aria-pressed={mode === 'montant'} onClick={() => setMode('montant')}>Pour un montant</button></div>
      {mode === 'poids' ? (
        <>
          <div class="chips wrap">{quick.map(v => <button key={v} class="chip" aria-pressed={q === v} onClick={() => setQ(v)}>{fmtQty(v)} {p.unit}</button>)}</div>
          <Field label={`Poids exact (${p.unit})`} hint="Lisez le poids sur la balance, ex. 1,35"><DecInput value={q} onInput={setQ} big /></Field>
        </>
      ) : (
        <Field label="Le client veut en avoir pour (F CFA)" hint={amount ? `Soit ${fmtQty(qty)} ${p.unit} à peser` : undefined}><NumInput value={amount} onInput={setAmount} big autoFocus /></Field>
      )}
    </Sheet>
  );
}

function FreeAmount({ onClose, onAdd }: { onClose: () => void; onAdd: (l: Line) => void }) {
  const [label, setLabel] = useState('');
  const [v, setV] = useState<number | ''>('');
  return (
    <Sheet title="Montant libre" onClose={onClose} foot={<button class="btn pri big" disabled={!v} onClick={() => onAdd({ productId: null, name: label || 'Prestation', qty: 1, price: Number(v) })}>Ajouter</button>}>
      <Field label="Quoi ?"><input class="inp" placeholder="ex. Commande à emporter, livraison" value={label} onInput={e => setLabel(e.currentTarget.value)} /></Field>
      <Field label="Montant (F CFA)"><NumInput value={v} onInput={setV} big autoFocus /></Field>
    </Sheet>
  );
}

function PaySheet({ cart, setCart, onClose, onDone }: { cart: Line[]; setCart: (c: Line[]) => void; onClose: () => void; onDone: (s: Sale) => void }) {
  const s = useStore();
  const [m, setM] = useState<PayMethod>('cash');
  const [phone, setPhone] = useState('');
  const total = cart.reduce((a, x) => a + lineTotal(x), 0);
  const mm = METHODS[m].mm;
  const setQty = (i: number, d: number) => { const n = [...cart]; const step = isWeighed(n[i].unit) ? 0.25 * d : d; n[i] = { ...n[i], qty: Math.round((n[i].qty + step) * 1000) / 1000 }; setCart(n.filter(x => x.qty > 0)); };
  return (
    <Sheet title="Encaisser" onClose={onClose} foot={
      <button class="btn pri big" disabled={!cart.length} onClick={() => { const sale = recordSale({ items: cart, method: m, customerPhone: phone.replace(/\D/g, ''), receipt: phone ? 'sms' : 'none' }); onDone(sale); }}>
        Valider la vente · <span class="num">{fmt(total)} F</span>
      </button>}>
      <div class="card list tight">
        {cart.map((x, i) => (
          <div class="row" key={i}>
            <div class="main"><div class="ttl">{x.name}</div><div class="sub num">{fmt(x.price)} F{isWeighed(x.unit) ? ` / ${x.unit} · ${fmt(lineTotal(x))} F` : ''}</div></div>
            <div class="stepper"><button onClick={() => setQty(i, -1)} aria-label="Moins">−</button><b class="num">{fmtQty(x.qty)}{isWeighed(x.unit) ? ` ${x.unit}` : ''}</b><button onClick={() => setQty(i, 1)} aria-label="Plus">+</button></div>
          </div>
        ))}
        <div class="kv tot"><span>Total</span><Money v={total} /></div>
      </div>
      <Field label="Le client paie en">
        <div class="meths">{METHOD_KEYS.map(k => <button key={k} aria-pressed={m === k} onClick={() => setM(k)}><MethodBadge m={k} />{METHODS[k].name.split(' ')[0]}</button>)}</div>
      </Field>
      {mm && <p class="note">Le client paie directement sur le compte marchand {METHODS[m].name} de {s.business.name}. La vente sera marquée « reçue » quand l'opérateur confirme.</p>}
      <Field label="Numéro du client (conseillé)" hint="Il reçoit un reçu par SMS. Le propriétaire peut le rappeler pour vérifier.">
        <input class="inp num" type="tel" inputMode="tel" placeholder="07 07 12 34 56" value={phone} onInput={e => setPhone(e.currentTarget.value)} />
      </Field>
    </Sheet>
  );
}

function DoneSheet({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const s = useStore();
  const cur = s.sales.find(x => x.id === sale.id) ?? sale;
  useEffect(() => {
    // Démo : l'opérateur confirme au bout de 2 secondes (en production : notification de Wave/Orange/MTN/Moov)
    if (cur.method !== 'cash' && !cur.mmConfirmed) { const h = setTimeout(() => confirmMobileMoney(cur.id), 2000); return () => clearTimeout(h); }
  }, []);
  const receipt = `${s.business.name}\nReçu du ${new Date(cur.at).toLocaleDateString('fr-FR')} à ${time(cur.at)}\n${cur.items.map(i => `${isWeighed(i.unit) ? `${fmtQty(i.qty)} ${i.unit} × ${fmt(i.price)} F` : `${i.qty} ×`} ${i.name} : ${fmt(lineTotal(i))} F`).join('\n')}\nTOTAL : ${fmt(cur.total)} F (${METHODS[cur.method].name})\nMerci de votre visite !`;
  return (
    <Sheet title="Vente enregistrée" onClose={onClose} foot={<button class="btn pri big" onClick={onClose}>Nouvelle vente</button>}>
      <div class="done-ic"><Icon n="check" size={30} /></div>
      <p class="center big-t num">{F(cur.total)}</p>
      {cur.method !== 'cash' && <p class="center">{cur.mmConfirmed ? <Pill k="ok">Paiement reçu par {METHODS[cur.method].name}</Pill> : <Pill k="warn">En attente de {METHODS[cur.method].name}…</Pill>}</p>}
      {cur.customerPhone ? (
        <>
          <p class="muted center">Reçu envoyé par SMS au {phonePretty(cur.customerPhone)}.</p>
          <pre class="receipt">{receipt}</pre>
          <a class="btn big" href={waLink(cur.customerPhone, receipt)} target="_blank" rel="noopener"><Icon n="chat" size={18} /> Envoyer aussi par WhatsApp</a>
        </>
      ) : <p class="muted center">Pas de numéro client : pas de reçu envoyé.</p>}
    </Sheet>
  );
}

function CancelSheet({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const reasons = ['Erreur de saisie', 'Client parti sans payer', 'Plat retourné', 'Doublon'];
  return (
    <Sheet title={`Annuler la vente de ${F(sale.total)}`} onClose={onClose} foot={<button class="btn danger big" disabled={!reason} onClick={() => { cancelSale(sale.id, reason); toast('Vente annulée. Le propriétaire est prévenu.'); onClose(); }}>Annuler la vente</button>}>
      <p class="muted">Une vente n'est jamais effacée : elle reste visible, barrée, avec le motif. Le propriétaire reçoit une alerte.</p>
      <div class="chips wrap">{reasons.map(r => <button key={r} class="chip" aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>)}</div>
      <Field label="Autre motif"><input class="inp" value={reasons.includes(reason) ? '' : reason} onInput={e => setReason(e.currentTarget.value)} /></Field>
    </Sheet>
  );
}

// ---------------- Dépenses ----------------
const EXP_CATS = ['Achats cuisine', 'Boissons', 'Gaz', 'Transport', 'Entretien', 'Électricité / eau', 'Autre'];
function Expenses() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const list = s.expenses.slice().sort((a, b) => b.at - a.at).slice(0, 25);
  const st = { pending: <Pill k="warn">En attente</Pill>, approved: <Pill k="ok">Validée</Pill>, rejected: <Pill k="bad">Refusée</Pill> };
  return (
    <>
      <button class="btn pri big" onClick={() => setOpen(true)}><Icon n="plus" size={18} /> Nouvelle dépense</button>
      <p class="hint">Photo du reçu obligatoire. Au-delà de {F(s.business.settings.expenseApprovalAbove)}, ou sans photo, le propriétaire doit valider.</p>
      <div class="card list">
        {list.map(e => (
          <div class="row" key={e.id}>
            {e.photo ? <img class="thumb" src={e.photo} alt="" /> : <span class="thumb none"><Icon n="receipt" size={16} /></span>}
            <div class="main"><div class="ttl">{e.label}</div><div class="sub">{dayKey(e.at) === today() ? time(e.at) : new Date(e.at).toLocaleDateString('fr-FR')} · {e.category}</div></div>
            <div class="amt"><Money v={e.amount} />{st[e.status]}</div>
          </div>
        ))}
      </div>
      {open && <NewExpense onClose={() => setOpen(false)} />}
    </>
  );
}
function NewExpense({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState<number | ''>('');
  const [cat, setCat] = useState(EXP_CATS[0]);
  const [label, setLabel] = useState('');
  const [photo, setPhoto] = useState<string>();
  const geo = useGeo();
  return (
    <Sheet title="Nouvelle dépense" onClose={onClose} foot={
      <button class="btn pri big" disabled={!amount || !label} onClick={() => { addExpense({ amount: Number(amount), category: cat, label, photo, geo: geo ?? null }); toast(photo ? 'Dépense envoyée' : 'Dépense envoyée sans reçu : le propriétaire doit valider'); onClose(); }}>Enregistrer la dépense</button>}>
      <Field label="Montant payé (F CFA)"><NumInput value={amount} onInput={setAmount} big autoFocus /></Field>
      <Field label="Catégorie"><div class="chips wrap">{EXP_CATS.map(c => <button key={c} class="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}</div></Field>
      <Field label="Pour quoi ?"><input class="inp" placeholder="ex. 6 poulets au marché de Marcory" value={label} onInput={e => setLabel(e.currentTarget.value)} /></Field>
      <Field label="Photo du reçu"><PhotoInput value={photo} onChange={setPhoto} label="Photographier le reçu" /></Field>
      <GeoLine geo={geo} />
    </Sheet>
  );
}

// ---------------- Stock ----------------
function Stock() {
  const s = useStore();
  const [sel, setSel] = useState<Product | null>(null);
  const tracked = s.products.filter(p => p.trackStock && !p.archived);
  const low = tracked.filter(p => p.stock <= p.lowStock);
  return (
    <>
      {low.length > 0 && <div class="banner warn"><b>{low.length} article{low.length > 1 ? 's' : ''} bientôt épuisé{low.length > 1 ? 's' : ''}</b> : {low.map(p => p.name).join(', ')}</div>}
      <div class="card list">
        {tracked.map(p => (
          <button class="row btnrow" key={p.id} onClick={() => setSel(p)}>
            <div class="main"><div class="ttl">{p.name}</div><div class="sub">alerte sous {p.lowStock} · {fmt(p.price)} F l'unité</div></div>
            <span class={'qty num' + (p.stock <= p.lowStock ? ' low' : '')}>{fmtQty(p.stock)}{isWeighed(p.unit) ? <small> {p.unit}</small> : null}</span><Icon n="right" size={16} />
          </button>
        ))}
      </div>
      <p class="hint">Touchez un article pour enregistrer une livraison, une casse ou un inventaire. Le stock baisse tout seul à chaque vente.</p>
      {sel && <StockSheet p={sel} onClose={() => setSel(null)} />}
    </>
  );
}
function StockSheet({ p, onClose }: { p: Product; onClose: () => void }) {
  const [kind, setKind] = useState<'delivery' | 'loss' | 'inventory'>('delivery');
  const [n, setN] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string>();
  const labels = { delivery: 'Livraison reçue', loss: 'Casse / perte', inventory: 'Inventaire' };
  const valid = n !== '' && (kind === 'inventory' || n > 0) && (kind !== 'loss' || note.length > 2);
  return (
    <Sheet title={p.name} onClose={onClose} foot={
      <button class="btn pri big" disabled={!valid} onClick={() => {
        if (kind === 'inventory') stockMove({ productId: p.id, kind, counted: Number(n), note: note || 'Inventaire' });
        else stockMove({ productId: p.id, kind, qty: kind === 'loss' ? -Number(n) : Number(n), note, photo });
        toast('Stock mis à jour'); onClose();
      }}>Enregistrer</button>}>
      <p class="muted">Stock actuel : <b class="num">{fmtQty(p.stock)}</b> {p.unit}{isWeighed(p.unit) ? '' : '(s)'}</p>
      <div class="seg">{(['delivery', 'loss', 'inventory'] as const).map(k => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{labels[k]}</button>)}</div>
      <Field label={kind === 'inventory' ? 'Combien en comptez-vous ?' : 'Quantité'} hint={kind === 'inventory' ? (isWeighed(p.unit) ? `Pesez sans regarder le chiffre au-dessus (en ${p.unit}, ex. 12,5).` : 'Comptez sans regarder le chiffre au-dessus.') : isWeighed(p.unit) ? `En ${p.unit}, ex. 12,5` : undefined}>{isWeighed(p.unit) ? <DecInput value={n} onInput={setN} big /> : <NumInput value={n} onInput={setN} big />}</Field>
      <Field label={kind === 'loss' ? 'Motif (obligatoire)' : 'Note'}><input class="inp" value={note} placeholder={kind === 'delivery' ? 'ex. Solibra, bon n° 4512' : kind === 'loss' ? 'ex. 2 bouteilles cassées au service' : ''} onInput={e => setNote(e.currentTarget.value)} /></Field>
      {kind !== 'inventory' && <Field label={kind === 'delivery' ? 'Photo du bon de livraison' : 'Photo de la casse'}><PhotoInput value={photo} onChange={setPhoto} /></Field>}
    </Sheet>
  );
}

// ---------------- Clôture à l'aveugle ----------------
const DENOMS = [10000, 5000, 2000, 1000, 500, 250, 200, 100, 50, 25];
function Close() {
  const s = useStore();
  const t = today();
  const c = closeOf(t);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string>();
  const [confirm, setConfirm] = useState(false);
  const total = useMemo(() => DENOMS.reduce((a, d) => a + d * (counts[d] || 0), 0), [counts]);
  if (c) return (
    <div class="card center">
      <div class="done-ic"><Icon n="lock" size={28} /></div>
      <p><b>Caisse clôturée à {time(c.at)}</b></p>
      <p class="num big-t">{F(c.counted)} comptés</p>
      <p class="muted">Le comptage a été envoyé au propriétaire. Laissez {F(s.business.openingFloat)} de fond de caisse pour demain et rangez le reste comme convenu.</p>
    </div>
  );
  return (
    <>
      <div class="banner"><b>Comptez tout l'argent liquide du tiroir.</b> Entrez le nombre de billets et de pièces. Le montant attendu n'est pas affiché : c'est normal, le système compare de son côté.</div>
      <div class="card list tight">
        {DENOMS.map(d => (
          <div class="row" key={d}>
            <div class="main"><div class="ttl num">{fmt(d)} F</div><div class="sub">{d >= 500 && d !== 250 ? (d === 500 ? 'billet ou pièce' : 'billet') : 'pièce'}</div></div>
            <div class="stepper"><button onClick={() => setCounts({ ...counts, [d]: Math.max(0, (counts[d] || 0) - 1) })} aria-label="Moins">−</button>
              <input class="num" inputMode="numeric" value={counts[d] || ''} placeholder="0" onInput={e => setCounts({ ...counts, [d]: Number(e.currentTarget.value.replace(/\D/g, '')) || 0 })} aria-label={`Nombre de ${d} F`} />
              <button onClick={() => setCounts({ ...counts, [d]: (counts[d] || 0) + 1 })} aria-label="Plus">+</button></div>
          </div>
        ))}
        <div class="kv tot"><span>Total compté</span><Money v={total} /></div>
      </div>
      <Field label="Photo du tiroir (conseillé)"><PhotoInput value={photo} onChange={setPhoto} /></Field>
      <Field label="Remarque"><input class="inp" value={note} onInput={e => setNote(e.currentTarget.value)} placeholder="ex. 5 000 F donnés à Koffi pour le transport" /></Field>
      <button class="btn pri big" disabled={!total} onClick={() => setConfirm(true)}>Clôturer la journée</button>
      {confirm && (
        <Sheet title="Confirmer la clôture" onClose={() => setConfirm(false)} foot={<button class="btn pri big" onClick={() => { closeDay(total, Object.fromEntries(Object.entries(counts).filter(([, v]) => v)), note, photo); toast('Clôture envoyée'); setConfirm(false); }}>Oui, clôturer</button>}>
          <p>Vous avez compté <b class="num">{F(total)}</b> en espèces.</p>
          <p class="muted">Après validation, vous ne pourrez plus modifier ce comptage.</p>
        </Sheet>
      )}
    </>
  );
}
