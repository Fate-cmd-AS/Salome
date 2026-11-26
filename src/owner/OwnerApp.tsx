// Appli du propriétaire (à distance) : voir, vérifier, valider, agir.
import { useMemo, useState } from 'preact/hooks';
import { useStore, logout, revenue, okSales, salesOf, expectedCash, closeOf, avgRevenue, revenueUntilHour, decideExpense, checkSale, markSeen, person } from '../store';
import { computeAlerts, trustScore } from '../alerts';
import { F, fmt, signedF, time, today, shiftDay, dayLabel, dateShort, METHODS, METHOD_KEYS, waLink, telLink, phonePretty, hourOf, ago, dayKey, itemLabel, lineTotal, isWeighed, fmtQty } from '../format';
import type { Sale, Expense, Alert } from '../types';
import { Icon, Money, MethodBadge, Pill, Sheet, toast, NetChip, TopBar, BottomNav, Section, Empty, Bars, Split, Field } from '../ui';
import { ExportPanel } from '../ExportPanel';
import { Team, CashPage, StockPage, InvoicesPage, LogPage, SettingsPage } from './OwnerMore';

export type OTab = 'accueil' | 'ventes' | 'alertes' | 'equipe' | 'plus' | 'caisse' | 'stock' | 'factures' | 'journal' | 'reglages' | 'export';
const PLUS: [OTab, string, string, string][] = [
  ['caisse', 'Caisse et clôtures', 'lock', 'Comptages du soir et écarts'],
  ['stock', 'Stock et articles', 'box', 'Niveaux, inventaires, prix'],
  ['factures', 'Factures', 'doc', 'Clients et fournisseurs'],
  ['export', 'Export Excel', 'doc', 'Tous les mouvements, pour vos analyses'],
  ['journal', "Journal d'activité", 'list', 'Tout ce qui a été fait, par qui'],
  ['reglages', 'Réglages', 'gear', 'Commerce, seuils, équipe'],
];

export function OwnerApp() {
  const s = useStore();
  const [tab, setTab] = useState<OTab>('accueil');
  const [focus, setFocus] = useState<string | undefined>();
  const alerts = useMemo(() => computeAlerts(s), [s]);
  const unseen = alerts.filter(a => !s.seenAlerts.includes(a.id)).length + s.expenses.filter(e => e.status === 'pending').length;
  const go = (t: string, ref?: string) => { setTab(t as OTab); setFocus(ref); window.scrollTo(0, 0); };
  const plusPage = PLUS.find(p => p[0] === tab);
  const main: OTab = plusPage ? 'plus' : tab;
  const titles: Partial<Record<OTab, string>> = { accueil: s.business.name, ventes: 'Ventes', alertes: 'À traiter', equipe: 'Équipe', plus: 'Plus' };
  return (
    <div class="app">
      <TopBar title={plusPage ? plusPage[1] : titles[tab]!} sub={plusPage ? undefined : tab === 'accueil' ? `${s.business.kind} · ${s.business.district}, ${s.business.city}` : s.business.name}
        right={<>{plusPage && <button class="btn sm" onClick={() => go('plus')}><Icon n="left" size={14} /> Retour</button>}<NetChip /><button class="icon-btn" aria-label="Se déconnecter" onClick={logout}><Icon n="logout" /></button></>} />
      <main class="body">
        {tab === 'accueil' && <Home alerts={alerts} go={go} />}
        {tab === 'ventes' && <Sales focus={focus} />}
        {tab === 'alertes' && <Alerts alerts={alerts} go={go} />}
        {tab === 'equipe' && <Team />}
        {tab === 'plus' && (
          <div class="card list">
            {PLUS.map(([k, l, i, d]) => <button key={k} class="row btnrow" onClick={() => go(k)}><span class="mico soft"><Icon n={i} size={18} /></span><div class="main"><div class="ttl">{l}</div><div class="sub">{d}</div></div><Icon n="right" size={16} /></button>)}
          </div>
        )}
        {tab === 'caisse' && <CashPage focus={focus} />}
        {tab === 'stock' && <StockPage />}
        {tab === 'factures' && <InvoicesPage />}
        {tab === 'journal' && <LogPage />}
        {tab === 'reglages' && <SettingsPage />}
        {tab === 'export' && <ExportPanel />}
      </main>
      <BottomNav<OTab> cur={main} onTab={t => go(t)} tabs={[
        ['accueil', 'Accueil', 'home'],
        ['ventes', 'Ventes', 'trend'],
        ['alertes', 'À traiter', 'shield', unseen],
        ['equipe', 'Équipe', 'users'],
        ['plus', 'Plus', 'more'],
      ]} />
    </div>
  );
}

// ---------------- Accueil ----------------
function Home({ alerts, go }: { alerts: Alert[]; go: (t: string, ref?: string) => void }) {
  const s = useStore();
  const t = today();
  const rev = revenue(t);
  const sales = okSales(t);
  const h = hourOf(Date.now());
  let ref = 0, n = 0;
  for (let i = 1; i <= 4; i++) { const v = revenueUntilHour(shiftDay(t, -7 * i), h); if (v) { ref += v; n++; } }
  const avgSoFar = n ? ref / n : 0;
  const delta = avgSoFar ? (rev - avgSoFar) / avgSoFar : 0;
  const byM = METHOD_KEYS.map(k => ({ k, v: sales.filter(x => x.method === k).reduce((a, x) => a + x.total, 0) }));
  const mmDirect = sales.filter(x => x.method !== 'cash' && x.mmConfirmed).reduce((a, x) => a + x.total, 0);
  const score = trustScore(alerts);
  const pendingExp = s.expenses.filter(e => e.status === 'pending');
  const high = alerts.filter(a => a.level === 'high');
  const days = Array.from({ length: 14 }, (_, i) => shiftDay(t, i - 13));
  const yClose = closeOf(shiftDay(t, -1));
  const team = s.people.filter(p => p.active && p.role !== 'owner');
  const present = s.attendance.filter(a => a.day === t).length;
  const avgDay = avgRevenue(t);
  return (
    <>
      <div class="hero">
        <div class="hero-top"><span class="live">En direct</span><span class="lab">mis à jour {sales.length ? ago(sales[sales.length - 1].at) : '—'}</span></div>
        <div class="lab">Recette d'aujourd'hui</div>
        <div class="big num">{fmt(rev)} <small>F CFA</small></div>
        {avgSoFar > 0 && <div class={'delta ' + (delta < -0.15 ? 'down' : 'up')}>{delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(delta * 100))} % par rapport aux mêmes jours à {h} h</div>}
        <Split parts={byM.map(x => ({ v: x.v, color: METHODS[x.k].color }))} />
        <div class="legend">{byM.filter(x => x.v).map(x => <span key={x.k}><i style={{ background: METHODS[x.k].color }} />{METHODS[x.k].name} <b class="num">{fmt(x.v)}</b></span>)}</div>
        <div class="hero-kpis">
          <div><span class="lab">Reçu sur vos comptes mobiles</span><b class="num">{F(mmDirect)}</b></div>
          <div><span class="lab">Espèces attendues en caisse</span><b class="num">{F(expectedCash(t))}</b></div>
        </div>
      </div>

      <button class="card score btnrow" onClick={() => go('alertes')}>
        <div class="ring" style={{ '--p': score, '--c': score >= 80 ? 'var(--ok)' : score >= 60 ? 'var(--warn)' : 'var(--danger)' } as any}><span>{score}</span></div>
        <div class="main">
          <div class="ttl">Indice de confiance sur 7 jours</div>
          <div class="sub">{high.length ? `${high.length} alerte${high.length > 1 ? 's' : ''} importante${high.length > 1 ? 's' : ''}` : 'Rien de grave'}{pendingExp.length ? ` · ${pendingExp.length} dépense${pendingExp.length > 1 ? 's' : ''} à valider` : ''}</div>
        </div>
        <Icon n="right" size={16} />
      </button>

      {high.slice(0, 2).map(a => (
        <button key={a.id} class="alert bad btnrow" onClick={() => go(a.go?.tab ?? 'alertes', a.go?.ref)}><div><b>{a.title}</b><span>{a.detail}</span></div></button>
      ))}

      <Section title="14 derniers jours" aside={`moyenne ${dayLabel(t).toLowerCase() === "aujourd'hui" ? 'du même jour' : ''} : ${F(avgDay)}`}>
        <div class="card"><Bars highlight={13} data={days.map(d => ({ label: dayLabel(d), v: revenue(d), sub: d.slice(8) }))} /></div>
      </Section>

      <Section title="Dernières ventes" aside={<button class="link" onClick={() => go('ventes')}>Tout voir</button>}>
        <div class="card list">
          {sales.length ? sales.slice(-6).reverse().map(x => <SaleRow key={x.id} x={x} />) : <Empty>Pas encore de vente aujourd'hui.</Empty>}
        </div>
      </Section>

      <div class="grid2">
        <button class="card mini btnrow" onClick={() => go('caisse')}>
          <span class="lab">Caisse d'hier</span>
          {yClose ? <><b class={'num ' + (yClose.gap < 0 ? 'neg' : '')}>{yClose.gap === 0 ? 'Juste' : signedF(yClose.gap)}</b><span class="sub">{F(yClose.counted)} comptés</span></> : <><b>Non clôturée</b><span class="sub">à demander</span></>}
        </button>
        <button class="card mini btnrow" onClick={() => go('equipe')}>
          <span class="lab">Équipe présente</span><b class="num">{present} / {team.length}</b><span class="sub">pointage avec photo</span>
        </button>
      </div>
    </>
  );
}

function SaleRow({ x, onClick }: { x: Sale; onClick?: () => void }) {
  const tags = [];
  if (x.status === 'cancelled') tags.push(<Pill k="bad">Annulée</Pill>);
  else if (x.method !== 'cash' && !x.mmConfirmed) tags.push(<Pill k="bad">Non reçu</Pill>);
  if (x.check) tags.push(<Pill k={x.check.result === 'confirmed' ? 'ok' : 'bad'}>{x.check.result === 'confirmed' ? 'Vérifiée' : 'Contestée'}</Pill>);
  return (
    <button class="row btnrow" onClick={onClick} disabled={!onClick}>
      <MethodBadge m={x.method} />
      <div class="main"><div class="ttl">{x.items.map(itemLabel).join(', ')}</div>
        <div class="sub">{time(x.at)} · {person(x.byId)?.name}{x.customerPhone ? ` · client ${phonePretty(x.customerPhone)}` : ''} {tags}</div></div>
      <span class="amt">{x.status === 'cancelled' ? <s><Money v={x.total} /></s> : <Money v={x.total} />}</span>
    </button>
  );
}

// ---------------- Ventes ----------------
function Sales({ focus }: { focus?: string }) {
  const s = useStore();
  const focused = focus ? s.sales.find(x => x.id === focus) : undefined;
  const [day, setDay] = useState(focused ? dayKey(focused.at) : today());
  const [f, setF] = useState<'all' | 'phone' | 'flag'>('all');
  const [sel, setSel] = useState<Sale | null>(focused ?? null);
  const all = salesOf(day);
  const ok = all.filter(x => x.status === 'ok');
  const total = ok.reduce((a, x) => a + x.total, 0);
  const list = all.filter(x => f === 'all' || (f === 'phone' ? !!x.customerPhone : x.status === 'cancelled' || (x.method !== 'cash' && !x.mmConfirmed) || x.check?.result === 'disputed')).slice().reverse();
  const toCheck = ok.filter(x => x.customerPhone && !x.check);
  return (
    <>
      <div class="daynav">
        <button class="icon-btn" onClick={() => setDay(shiftDay(day, -1))} aria-label="Jour précédent"><Icon n="left" /></button>
        <b>{dayLabel(day)}</b>
        <button class="icon-btn" onClick={() => setDay(shiftDay(day, 1))} disabled={day >= today()} aria-label="Jour suivant"><Icon n="right" /></button>
      </div>
      <div class="kpis">
        <div><span>Recette</span><b class="num">{fmt(total)}</b></div>
        <div><span>Ventes</span><b class="num">{ok.length}</b></div>
        <div><span>Panier moyen</span><b class="num">{ok.length ? fmt(total / ok.length) : '—'}</b></div>
      </div>
      {toCheck.length > 0 && (
        <div class="banner">
          <b>Vérifiez au hasard.</b> {toCheck.length} client{toCheck.length > 1 ? 's ont' : ' a'} laissé un numéro. Appeler 2 ou 3 clients par semaine suffit à dissuader les fausses déclarations.
          <button class="btn sm" onClick={() => setSel(toCheck[Math.floor(Math.random() * toCheck.length)])}>Choisir un client au hasard</button>
        </div>
      )}
      <div class="chips">
        {([['all', 'Toutes'], ['phone', 'Avec numéro client'], ['flag', 'À surveiller']] as const).map(([k, l]) => <button key={k} class="chip" aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>)}
      </div>
      <div class="card list">{list.length ? list.map(x => <SaleRow key={x.id} x={x} onClick={() => setSel(x)} />) : <Empty>Aucune vente.</Empty>}</div>
      {sel && <SaleSheet x={s.sales.find(v => v.id === sel.id) ?? sel} onClose={() => setSel(null)} />}
    </>
  );
}

function SaleSheet({ x, onClose }: { x: Sale; onClose: () => void }) {
  const s = useStore();
  const [note, setNote] = useState('');
  const msg = `Bonjour, c'est ${person(s.session!.personId)?.name}, propriétaire de ${s.business.name}. Merci pour votre passage le ${dateShort(x.at)} à ${time(x.at)}. Pouvez-vous me confirmer le montant payé ? Nous avons enregistré ${F(x.total)}. Merci !`;
  return (
    <Sheet title={`Vente de ${F(x.total)}`} onClose={onClose}>
      <div class="card list tight">
        {x.items.map((i, k) => <div class="kv" key={k}><span>{isWeighed(i.unit) ? `${fmtQty(i.qty)} ${i.unit} × ${fmt(i.price)} F` : `${i.qty} ×`} {i.name}</span><Money v={lineTotal(i)} /></div>)}
        <div class="kv tot"><span>Total</span><Money v={x.total} /></div>
      </div>
      <div class="kv"><span>Heure</span><b>{dateShort(x.at)} à {time(x.at)}</b></div>
      <div class="kv"><span>Enregistrée par</span><b>{person(x.byId)?.name}</b></div>
      <div class="kv"><span>Paiement</span><b>{METHODS[x.method].name}</b></div>
      {x.method !== 'cash' && <div class="kv"><span>Opérateur</span>{x.mmConfirmed ? <Pill k="ok">Reçu · réf. {x.mmRef}</Pill> : <Pill k="bad">Jamais confirmé</Pill>}</div>}
      {x.status === 'cancelled' && <div class="banner bad">Annulée {x.cancelledAt ? `à ${time(x.cancelledAt)}` : ''} · motif : « {x.cancelReason} »</div>}
      {x.customerPhone ? (
        <Section title="Vérifier auprès du client">
          <p class="muted">Client : <b class="num">{phonePretty(x.customerPhone)}</b>{x.receipt === 'sms' ? ' · a reçu un reçu SMS' : ''}</p>
          <div class="grid2">
            <a class="btn" href={telLink(x.customerPhone)}><Icon n="phone" size={16} /> Appeler</a>
            <a class="btn" href={waLink(x.customerPhone, msg)} target="_blank" rel="noopener"><Icon n="chat" size={16} /> WhatsApp</a>
          </div>
          {x.check ? <div class={'banner ' + (x.check.result === 'confirmed' ? 'ok' : 'bad')}>{x.check.result === 'confirmed' ? 'Le client a confirmé le montant.' : `Le client conteste : ${x.check.note ?? ''}`}</div> : (
            <>
              <Field label="Ce que dit le client (facultatif)"><input class="inp" value={note} onInput={e => setNote(e.currentTarget.value)} placeholder="ex. Il dit avoir payé 8 000 F" /></Field>
              <div class="grid2">
                <button class="btn pri" onClick={() => { checkSale(x.id, 'confirmed', note); toast('Vente vérifiée'); }}>Le client confirme</button>
                <button class="btn danger" onClick={() => { checkSale(x.id, 'disputed', note || 'Montant contesté'); toast('Contestation enregistrée'); }}>Le client conteste</button>
              </div>
            </>
          )}
        </Section>
      ) : <p class="muted">Pas de numéro client pour cette vente.</p>}
    </Sheet>
  );
}

// ---------------- À traiter ----------------
function Alerts({ alerts, go }: { alerts: Alert[]; go: (t: string, ref?: string) => void }) {
  const s = useStore();
  const pend = s.expenses.filter(e => e.status === 'pending').sort((a, b) => b.at - a.at);
  const [sel, setSel] = useState<Expense | null>(null);
  const unseen = alerts.filter(a => !s.seenAlerts.includes(a.id));
  const seen = alerts.filter(a => s.seenAlerts.includes(a.id));
  const lvl = { high: 'bad', med: '', low: 'ok' } as const;
  const A = (a: Alert, dim = false) => (
    <div key={a.id} class={`alert ${lvl[a.level]}${dim ? ' dim' : ''}`}>
      <div><b>{a.title}</b><span>{a.detail}</span>
        <div class="acts">
          {a.go && a.go.tab !== 'alertes' && <button class="btn sm" onClick={() => go(a.go!.tab, a.go!.ref)}>Voir</button>}
          {!dim && <button class="btn sm ghost" onClick={() => markSeen([a.id])}>Vu</button>}
        </div></div>
    </div>
  );
  return (
    <>
      <Section title="Dépenses à valider" aside={pend.length ? `${pend.length}` : undefined}>
        {pend.length ? <div class="card list">{pend.map(e => (
          <button class="row btnrow" key={e.id} onClick={() => setSel(e)}>
            {e.photo ? <img class="thumb" src={e.photo} alt="" /> : <span class="thumb none"><Icon n="receipt" size={16} /></span>}
            <div class="main"><div class="ttl">{e.label}</div><div class="sub">{dayLabel(dayKey(e.at))} à {time(e.at)} · {person(e.byId)?.name}{!e.photo ? ' · sans reçu' : ''}</div></div>
            <span class="amt"><Money v={e.amount} /></span>
          </button>))}</div> : <Empty>Aucune dépense en attente.</Empty>}
      </Section>
      <Section title="Alertes" aside={unseen.length ? <button class="link" onClick={() => markSeen(unseen.map(a => a.id))}>Tout marquer vu</button> : undefined}>
        {unseen.length ? <div class="stack">{unseen.map(a => A(a))}</div> : <Empty>Aucune nouvelle alerte. Tout va bien.</Empty>}
      </Section>
      {seen.length > 0 && <Section title="Déjà vues"><div class="stack">{seen.slice(0, 15).map(a => A(a, true))}</div></Section>}
      {sel && <ExpenseSheet e={sel} onClose={() => setSel(null)} />}
    </>
  );
}

function ExpenseSheet({ e, onClose }: { e: Expense; onClose: () => void }) {
  const [note, setNote] = useState('');
  return (
    <Sheet title={`Dépense de ${F(e.amount)}`} onClose={onClose} foot={
      <div class="grid2">
        <button class="btn danger big" onClick={() => { decideExpense(e.id, false, note || 'Refusée'); toast('Dépense refusée. La gérante est prévenue.'); onClose(); }}>Refuser</button>
        <button class="btn pri big" onClick={() => { decideExpense(e.id, true, note); toast('Dépense validée'); onClose(); }}>Valider</button>
      </div>}>
      {e.photo ? <img class="receipt-img" src={e.photo} alt="Photo du reçu" /> : <div class="banner warn">Aucune photo de reçu. Demandez-la avant de valider.</div>}
      <div class="kv"><span>Objet</span><b>{e.label}</b></div>
      <div class="kv"><span>Catégorie</span><b>{e.category}</b></div>
      <div class="kv"><span>Saisie</span><b>{dateShort(e.at)} à {time(e.at)} par {person(e.byId)?.name}</b></div>
      <div class="kv"><span>Position</span><b>{e.geo ? `au commerce (± ${e.geo.acc} m)` : 'inconnue'}</b></div>
      <Field label="Message pour la gérante (facultatif)"><input class="inp" value={note} onInput={ev => setNote(ev.currentTarget.value)} placeholder="ex. Envoie-moi le reçu du réparateur" /></Field>
    </Sheet>
  );
}
