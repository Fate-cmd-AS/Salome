import { useState } from 'preact/hooks';
import {
  useStore, person, sendReminder, computePayRun, payLine, addAdvance, closeOf, saveProduct, archiveProduct, saveInvoice, nextInvoiceNumber,
  updateBusiness, updatePerson, addPerson, resetDemo, logout, getMode, leaveMode, get,
} from '../store';
import { sb, signOutAll } from '../sync';
import { F, fmt, signedF, time, today, shiftDay, dayLabel, dateShort, METHODS, METHOD_KEYS, monthKey, monthLabel, waLink, phonePretty, weekday, uid, isWeighed, fmtQty, lineTotal, parseDec } from '../format';
import type { PayLine, PayMethod, Product, Invoice, Person } from '../types';
import { Icon, Money, MethodBadge, Pill, Sheet, toast, Section, Empty, Field, NumInput } from '../ui';

const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

// ---------------- Équipe : présence, rappels, paie ----------------
export function Team() {
  const [v, setV] = useState<'presence' | 'rappels' | 'paie'>('presence');
  return (
    <>
      <div class="seg">{([['presence', 'Présence'], ['rappels', 'Rappels'], ['paie', 'Paie']] as const).map(([k, l]) => <button key={k} aria-pressed={v === k} onClick={() => setV(k)}>{l}</button>)}</div>
      {v === 'presence' && <Presence />}
      {v === 'rappels' && <Reminders />}
      {v === 'paie' && <Payroll />}
    </>
  );
}

function Presence() {
  const s = useStore();
  const [edit, setEdit] = useState<Person | null>(null);
  const t = today();
  const team = s.people.filter(p => p.active && p.role !== 'owner');
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(t, i - 6));
  const [photo, setPhoto] = useState<string | null>(null);
  return (
    <>
      <Section title="Aujourd'hui" aside="« Fiche » pour le salaire et le poste">
        <div class="card list">
          {team.map(p => {
            const a = s.attendance.find(x => x.personId === p.id && x.day === t);
            const rest = p.restDay === weekday(t);
            return (
              <div class="row" key={p.id}>
                {a?.photo ? <button class="thumb-b" onClick={() => setPhoto(a.photo!)}><img class="thumb round" src={a.photo} alt={`Photo de ${p.name}`} /></button> : <span class="av sm">{p.name[0]}</span>}
                <div class="main"><div class="ttl">{p.name} <span class="sub">· {p.job}</span></div>
                  <div class="sub">{a ? <>Arrivée {time(a.inAt)}{a.outAt ? ` · départ ${time(a.outAt)}` : ''} {a.inZone === false ? <Pill k="bad">hors zone</Pill> : a.inZone ? <Pill k="ok">au commerce</Pill> : <Pill>position ?</Pill>}</> : rest ? 'Jour de repos' : 'Pas encore pointé'}</div></div>
                <button class="btn sm" onClick={() => setEdit(p)}>Fiche</button>
                <a class="icon-btn" href={waLink(p.phone, `Bonjour ${p.name}, `)} target="_blank" rel="noopener" aria-label={`Écrire à ${p.name}`}><Icon n="chat" size={18} /></a>
              </div>
            );
          })}
        </div>
      </Section>
      <Section title="7 derniers jours">
        <div class="card tbl-wrap">
          <table class="att">
            <thead><tr><th></th>{days.map(d => <th key={d}>{DAYS[weekday(d)]}<br />{d.slice(8)}</th>)}</tr></thead>
            <tbody>{team.map(p => <tr key={p.id}><td>{p.name}</td>{days.map(d => {
              const a = s.attendance.find(x => x.personId === p.id && x.day === d);
              const rest = p.restDay === weekday(d);
              const late = a && (new Date(a.inAt).getUTCHours() * 60 + new Date(a.inAt).getUTCMinutes()) > s.business.settings.openHour * 60 + 30;
              return <td key={d}><span class={'att-d ' + (a ? (late ? 'late' : 'ok') : rest ? 'rest' : d === t ? 'wait' : 'abs')} title={a ? `Arrivée ${time(a.inAt)}` : rest ? 'Repos' : 'Absent'} /></td>;
            })}</tr>)}</tbody>
          </table>
          <div class="legend dark"><span><i class="att-d ok" />À l'heure</span><span><i class="att-d late" />En retard</span><span><i class="att-d abs" />Absent</span><span><i class="att-d rest" />Repos</span></div>
        </div>
      </Section>
      <button class="btn big" onClick={() => setEdit({ id: '', name: '', job: 'Vendeur', phone: '', role: 'staff', salary: 0, payMethod: 'wave', restDay: 1, active: true })}><Icon n="plus" size={18} /> Ajouter une personne</button>
      {photo && <Sheet title="Photo de pointage" onClose={() => setPhoto(null)}><img class="receipt-img" src={photo} alt="" /></Sheet>}
      {edit && <PersonSheet p={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function Reminders() {
  const s = useStore();
  const [text, setText] = useState('');
  const [to, setTo] = useState(s.people.find(p => p.role === 'manager')?.id ?? 'all');
  const [due, setDue] = useState(today());
  const team = s.people.filter(p => p.active && p.role !== 'owner');
  const quick = ['Envoyer la photo du compteur CIE', 'Faire l\'inventaire des boissons ce soir', 'Payer la facture Solibra', 'Nettoyer la cuisine à fond'];
  return (
    <>
      <div class="card stack">
        <Field label="Nouveau rappel"><textarea class="inp" rows={2} value={text} onInput={e => setText(e.currentTarget.value)} placeholder="ex. Commander 3 casiers de Flag" /></Field>
        <div class="chips">{quick.map(q => <button key={q} class="chip" onClick={() => setText(q)}>{q}</button>)}</div>
        <div class="grid2">
          <Field label="Pour"><select class="inp" value={to} onChange={e => setTo(e.currentTarget.value)}><option value="all">Toute l'équipe</option>{team.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="À faire le"><input class="inp" type="date" value={due} onInput={e => setDue(e.currentTarget.value)} /></Field>
        </div>
        <button class="btn pri big" disabled={!text.trim()} onClick={() => { sendReminder(text.trim(), to, due); setText(''); toast('Rappel envoyé'); }}>Envoyer le rappel</button>
        <p class="hint">Le rappel apparaît sur le téléphone de la gérante. Vous voyez quand il est lu et quand il est fait.</p>
      </div>
      <Section title="Envoyés">
        <div class="card list">{s.reminders.length ? s.reminders.map(r => (
          <div class="row" key={r.id}>
            <div class="main"><div class="ttl wrap">{r.text}</div><div class="sub">{r.to === 'all' ? 'Toute l\'équipe' : person(r.to)?.name} · {dateShort(r.at)} {time(r.at)}</div></div>
            {r.doneAt ? <Pill k="ok">Fait</Pill> : r.ackAt ? <Pill k="warn">Lu</Pill> : <Pill>Envoyé</Pill>}
          </div>)) : <Empty>Aucun rappel.</Empty>}</div>
      </Section>
    </>
  );
}

function Payroll() {
  const s = useStore();
  const [month, setMonth] = useState(monthKey(Date.now()));
  const run = computePayRun(month);
  const [pay, setPay] = useState<PayLine | null>(null);
  const [adv, setAdv] = useState(false);
  const total = run.lines.reduce((a, l) => a + l.net, 0);
  const paid = run.lines.filter(l => l.paidAt).reduce((a, l) => a + l.net, 0);
  const prevMonth = (m: string, d: number) => { const [y, mm] = m.split('-').map(Number); const x = new Date(Date.UTC(y, mm - 1 + d, 15)); return x.toISOString().slice(0, 7); };
  return (
    <>
      <div class="daynav">
        <button class="icon-btn" onClick={() => setMonth(prevMonth(month, -1))} aria-label="Mois précédent"><Icon n="left" /></button>
        <b>{monthLabel(month)}</b>
        <button class="icon-btn" disabled={month >= monthKey(Date.now())} onClick={() => setMonth(prevMonth(month, 1))} aria-label="Mois suivant"><Icon n="right" /></button>
      </div>
      <div class="kpis"><div><span>Masse salariale</span><b class="num">{fmt(total)}</b></div><div><span>Déjà payé</span><b class="num">{fmt(paid)}</b></div><div><span>Reste</span><b class="num">{fmt(total - paid)}</b></div></div>
      <p class="hint">Touchez une personne pour définir son salaire, ajuster une prime ou payer. Les absences viennent du pointage avec photo (une journée = salaire ÷ 26).</p>
      <div class="card list">
        {run.lines.map(l => {
          const p = person(l.personId)!;
          return (
            <button class="row btnrow" key={l.personId} onClick={() => setPay(l)}>
              <span class="av sm">{p.name[0]}</span>
              <div class="main"><div class="ttl">{p.name} <span class="sub">· {p.job}</span></div>
                <div class="sub">{fmt(l.base)} F{l.absentDays ? ` · ${l.absentDays} j. absent (−${fmt(l.deduction)})` : ''}{l.advances ? ` · avance −${fmt(l.advances)}` : ''}{l.bonus ? ` · prime +${fmt(l.bonus)}` : ''}</div></div>
              <div class="amt"><Money v={l.net} />{l.paidAt ? <Pill k="ok">Payé {dateShort(l.paidAt)}</Pill> : !l.base ? <Pill k="bad">Salaire à définir</Pill> : <Pill k="warn">À payer</Pill>}</div>
            </button>
          );
        })}
      </div>
      <button class="btn big" onClick={() => setAdv(true)}><Icon n="wallet" size={18} /> Enregistrer une avance sur salaire</button>
      {pay && <PaySheet month={month} line={pay} onClose={() => setPay(null)} />}
      {adv && <AdvanceSheet onClose={() => setAdv(false)} team={s.people.filter(p => p.active && p.role !== 'owner')} />}
    </>
  );
}

function PaySheet({ month, line, onClose }: { month: string; line: PayLine; onClose: () => void }) {
  const p = person(line.personId)!;
  const [l, setL] = useState(line);
  const [m, setM] = useState<PayMethod>(p.payMethod);
  const upd = (patch: Partial<PayLine>) => { const n = { ...l, ...patch }; if (patch.base !== undefined) n.deduction = Math.round((n.base / 26) * n.absentDays / 100) * 100; n.net = Math.max(0, n.base - n.deduction - n.advances + n.bonus); setL(n); };
  if (line.paidAt) return (
    <Sheet title={`Salaire de ${p.name}`} onClose={onClose}>
      <div class="done-ic"><Icon n="check" size={28} /></div>
      <p class="center"><b class="num">{F(line.net)}</b> payés le {dateShort(line.paidAt)} par {METHODS[line.method ?? 'wave'].name}</p>
      <p class="center muted">Référence : {line.ref}</p>
    </Sheet>
  );
  return (
    <Sheet title={`Salaire de ${p.name}`} onClose={onClose} foot={
      <div class="stack">
        {l.base !== p.salary && <button class="btn big" onClick={() => { updatePerson(p.id, { salary: l.base }); toast(`Salaire de ${p.name} enregistré`); onClose(); }}>Enregistrer le salaire seulement</button>}
        <button class="btn pri big" disabled={!l.net} onClick={() => { if (l.base !== p.salary) updatePerson(p.id, { salary: l.base }); payLine(month, l, m); toast(`${F(l.net)} envoyés à ${p.name}`); onClose(); }}>Payer {F(l.net)} par {METHODS[m].name}</button>
      </div>}>
      <Field label="Salaire mensuel de base" hint="Enregistré sur la fiche de la personne pour les mois suivants."><NumInput value={l.base} onInput={v => upd({ base: Number(v) || 0 })} /></Field>
      <div class="kv"><span>Absences ({l.absentDays} j.)</span><span class="num">−{fmt(l.deduction)} F</span></div>
      <div class="kv"><span>Avances déjà versées</span><span class="num">−{fmt(l.advances)} F</span></div>
      <Field label="Retenue d'absence (modifiable)"><NumInput value={l.deduction} onInput={v => upd({ deduction: Number(v) || 0 })} /></Field>
      <Field label="Prime"><NumInput value={l.bonus} onInput={v => upd({ bonus: Number(v) || 0 })} /></Field>
      <div class="kv tot"><span>Net à payer</span><Money v={l.net} /></div>
      <Field label="Payer par"><div class="meths">{METHOD_KEYS.filter(k => k !== 'cash').map(k => <button key={k} aria-pressed={m === k} onClick={() => setM(k)}><MethodBadge m={k} />{METHODS[k].name.split(' ')[0]}</button>)}</div></Field>
      <p class="hint">Vers le {phonePretty(p.phone)}. Le salaire arrive directement chez {p.name}, sans passer par la caisse. (Démo : paiement simulé.)</p>
    </Sheet>
  );
}

function AdvanceSheet({ onClose, team }: { onClose: () => void; team: Person[] }) {
  const [pid, setPid] = useState(team[0]?.id);
  const [v, setV] = useState<number | ''>('');
  const [note, setNote] = useState('');
  return (
    <Sheet title="Avance sur salaire" onClose={onClose} foot={<button class="btn pri big" disabled={!v} onClick={() => { addAdvance(pid, Number(v), note); toast('Avance enregistrée, elle sera retenue sur la paie'); onClose(); }}>Enregistrer</button>}>
      <Field label="Pour"><select class="inp" value={pid} onChange={e => setPid(e.currentTarget.value)}>{team.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Montant"><NumInput value={v} onInput={setV} big /></Field>
      <Field label="Note"><input class="inp" value={note} onInput={e => setNote(e.currentTarget.value)} placeholder="ex. Frais de santé" /></Field>
    </Sheet>
  );
}

// ---------------- Caisse ----------------
export function CashPage({ focus }: { focus?: string }) {
  const s = useStore();
  const t = today();
  const days = Array.from({ length: 21 }, (_, i) => shiftDay(t, -i));
  const [sel, setSel] = useState<string | null>(focus ?? null);
  const week = days.slice(1, 8).map(d => closeOf(d)).filter(Boolean);
  const weekGap = week.reduce((a, c) => a + c!.gap, 0);
  const c = sel ? closeOf(sel) : undefined;
  return (
    <>
      <div class="kpis"><div><span>Écart sur 7 jours</span><b class={'num ' + (weekGap < 0 ? 'neg' : '')}>{signedF(weekGap)}</b></div><div><span>Clôtures faites</span><b class="num">{week.length} / 7</b></div><div><span>Seuil d'alerte</span><b class="num">{fmt(s.business.settings.cashGapAlert)}</b></div></div>
      <p class="hint">La gérante compte la caisse sans voir le montant attendu. Salomé calcule : fond de caisse + ventes en espèces − dépenses.</p>
      <div class="card list">
        {days.map(d => {
          const c = closeOf(d);
          return (
            <button class="row btnrow" key={d} onClick={() => c && setSel(d)} disabled={!c}>
              <div class="main"><div class="ttl">{dayLabel(d)}</div><div class="sub">{c ? `${F(c.counted)} comptés · ${F(c.expected)} attendus` : d === t ? 'Pas encore clôturée' : 'Pas de clôture'}</div></div>
              {c ? <span class={'amt num ' + (c.gap < 0 ? 'neg' : '')}>{c.gap === 0 ? 'Juste' : signedF(c.gap)}</span> : <Pill k={d === t ? 'mute' : 'warn'}>{d === t ? 'En cours' : 'Manquante'}</Pill>}
            </button>
          );
        })}
      </div>
      {c && (
        <Sheet title={`Clôture · ${dayLabel(c.day)}`} onClose={() => setSel(null)}>
          <div class="kv"><span>Comptée à</span><b>{time(c.at)} par {person(c.byId)?.name}</b></div>
          <div class="kv"><span>Attendu (calculé)</span><Money v={c.expected} /></div>
          <div class="kv"><span>Compté</span><Money v={c.counted} /></div>
          <div class={'kv tot ' + (c.gap < 0 ? 'neg' : '')}><span>Écart</span><span class="num">{signedF(c.gap)}</span></div>
          {c.detail && <p class="muted">Détail : {Object.entries(c.detail).sort((a, b) => Number(b[0]) - Number(a[0])).map(([d, n]) => `${n} × ${fmt(Number(d))}`).join(' · ')}</p>}
          {c.note && <p>Remarque : « {c.note} »</p>}
          {c.photo && <img class="receipt-img" src={c.photo} alt="Photo du tiroir" />}
        </Sheet>
      )}
    </>
  );
}

// ---------------- Stock ----------------
export function StockPage() {
  const s = useStore();
  const [edit, setEdit] = useState<Product | null>(null);
  const tracked = s.products.filter(p => p.trackStock && !p.archived);
  const archived = s.products.filter(p => p.archived);
  const value = tracked.reduce((a, p) => a + Math.max(0, p.stock) * p.cost, 0);
  const moves = s.stockMoves.slice().sort((a, b) => b.at - a.at).slice(0, 12);
  return (
    <>
      <div class="kpis"><div><span>Valeur du stock</span><b class="num">{fmt(value)}</b></div><div><span>Articles suivis</span><b class="num">{tracked.length}</b></div><div><span>Bientôt épuisés</span><b class="num">{tracked.filter(p => p.stock <= p.lowStock).length}</b></div></div>
      <Section title="Articles" aside={<button class="link" onClick={() => setEdit({ id: uid(), name: '', category: 'Boissons', price: 0, cost: 0, trackStock: true, stock: 0, lowStock: 6, unit: 'unité' })}>+ Ajouter</button>}>
        <div class="card list">
          {s.products.filter(p => !p.archived).map(p => (
            <button class="row btnrow" key={p.id} onClick={() => setEdit(p)}>
              <div class="main"><div class="ttl">{p.name}</div><div class="sub">{p.category} · vente {fmt(p.price)} F{isWeighed(p.unit) ? ` / ${p.unit}` : ''} · achat {fmt(p.cost)} F</div></div>
              {p.trackStock ? <span class={'qty num' + (p.stock <= p.lowStock ? ' low' : '')}>{fmtQty(p.stock)}{isWeighed(p.unit) ? <small> {p.unit}</small> : null}</span> : <span class="sub">non suivi</span>}
            </button>
          ))}
        </div>
      </Section>
      {archived.length > 0 && (
        <Section title="Retirés de la vente">
          <div class="card list">
            {archived.map(p => (
              <div class="row" key={p.id}>
                <div class="main"><div class="ttl">{p.name}</div><div class="sub">{p.category} · {fmt(p.price)} F</div></div>
                <button class="btn sm" onClick={() => { archiveProduct(p.id, false); toast(`${p.name} est de nouveau en vente`); }}>Remettre en vente</button>
              </div>
            ))}
          </div>
        </Section>
      )}
      <Section title="Mouvements récents">
        <div class="card list">{moves.map(m => {
          const p = s.products.find(x => x.id === m.productId);
          return (
            <div class="row" key={m.id}>
              <div class="main"><div class="ttl">{m.kind === 'delivery' ? 'Livraison' : m.kind === 'loss' ? 'Casse / perte' : 'Inventaire'} · {p?.name}</div><div class="sub">{dateShort(m.at)} {time(m.at)} · {m.note}{m.kind === 'inventory' ? ` · ${m.counted} comptés / ${m.expected} attendus` : ''}</div></div>
              <span class={'amt num ' + (m.qty < 0 ? 'neg' : '')}>{m.qty > 0 ? '+' : ''}{fmtQty(m.qty)}</span>
            </div>);
        })}</div>
      </Section>
      {edit && <ProductSheet p={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
function ProductSheet({ p, onClose }: { p: Product; onClose: () => void }) {
  const [x, setX] = useState(p);
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <Sheet title={p.name || 'Nouvel article'} onClose={onClose} foot={<button class="btn pri big" disabled={!x.name || !x.price} onClick={() => { saveProduct(x); toast('Article enregistré'); onClose(); }}>Enregistrer</button>}>
      <Field label="Nom"><input class="inp" value={x.name} onInput={e => setX({ ...x, name: e.currentTarget.value })} /></Field>
      <Field label="Catégorie"><input class="inp" value={x.category} onInput={e => setX({ ...x, category: e.currentTarget.value })} /></Field>
      <div class="grid2">
        <Field label="Prix de vente"><NumInput value={x.price} onInput={v => setX({ ...x, price: Number(v) || 0 })} /></Field>
        <Field label="Prix d'achat"><NumInput value={x.cost} onInput={v => setX({ ...x, cost: Number(v) || 0 })} /></Field>
      </div>
      <Field label="Vendu"><div class="seg">
        <button aria-pressed={!isWeighed(x.unit)} onClick={() => setX({ ...x, unit: isWeighed(x.unit) ? 'pièce' : x.unit })}>À la pièce</button>
        <button aria-pressed={isWeighed(x.unit)} onClick={() => setX({ ...x, unit: 'kg' })}>Au kilo</button>
      </div></Field>
      <label class="check"><input type="checkbox" checked={x.trackStock} onChange={e => setX({ ...x, trackStock: e.currentTarget.checked })} /> Suivre le stock de cet article</label>
      {x.trackStock && <div class="grid2">
        <Field label="Alerte sous"><NumInput value={x.lowStock} onInput={v => setX({ ...x, lowStock: Number(v) || 0 })} /></Field>
        <Field label="Unité"><input class="inp" value={x.unit} onInput={e => setX({ ...x, unit: e.currentTarget.value })} /></Field>
      </div>}
      <p class="hint">Seul le propriétaire peut changer les prix. Chaque changement est noté dans le journal.</p>
      {p.name && (!confirmDel
        ? <button class="btn danger big" onClick={() => setConfirmDel(true)}>Retirer cet article de la vente</button>
        : <div class="banner bad">
            <b>Retirer « {p.name} » ?</b>
            L'article disparaît de la caisse et du stock. Les ventes passées restent intactes, et vous pourrez le remettre en vente plus tard.
            <div class="grid2"><button class="btn" onClick={() => setConfirmDel(false)}>Annuler</button><button class="btn danger" onClick={() => { archiveProduct(p.id, true); toast(`${p.name} retiré de la vente`); onClose(); }}>Oui, retirer</button></div>
          </div>)}
    </Sheet>
  );
}

// ---------------- Factures ----------------
export function InvoicesPage() {
  const s = useStore();
  const [k, setK] = useState<Invoice['kind']>('client');
  const [edit, setEdit] = useState<Invoice | null>(null);
  const list = s.invoices.filter(i => i.kind === k).sort((a, b) => b.issuedAt - a.issuedAt);
  const due = list.filter(i => !i.paidAt).reduce((a, i) => a + i.total, 0);
  const now = Date.now();
  const blank = (): Invoice => ({ id: uid(), number: nextInvoiceNumber(k), kind: k, party: '', lines: [{ label: '', qty: 1, price: 0 }], total: 0, issuedAt: now, dueAt: now + 15 * 864e5 });
  return (
    <>
      <div class="seg"><button aria-pressed={k === 'client'} onClick={() => setK('client')}>Clients (à encaisser)</button><button aria-pressed={k === 'supplier'} onClick={() => setK('supplier')}>Fournisseurs (à payer)</button></div>
      <div class="kpis"><div><span>{k === 'client' ? 'On vous doit' : 'Vous devez'}</span><b class="num">{fmt(due)}</b></div><div><span>En retard</span><b class="num">{list.filter(i => !i.paidAt && i.dueAt < now).length}</b></div></div>
      <button class="btn pri big" onClick={() => setEdit(blank())}><Icon n="plus" size={18} /> {k === 'client' ? 'Nouvelle facture client' : 'Enregistrer une facture fournisseur'}</button>
      <div class="card list">{list.length ? list.map(i => (
        <button class="row btnrow" key={i.id} onClick={() => setEdit(i)}>
          <div class="main"><div class="ttl">{i.party}</div><div class="sub">{i.number} · échéance {dateShort(i.dueAt)}</div></div>
          <div class="amt"><Money v={i.total} />{i.paidAt ? <Pill k="ok">Payée</Pill> : i.dueAt < now ? <Pill k="bad">En retard</Pill> : <Pill k="warn">En attente</Pill>}</div>
        </button>)) : <Empty>Aucune facture.</Empty>}</div>
      {edit && <InvoiceSheet inv={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
function InvoiceSheet({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const s = useStore();
  const [x, setX] = useState(inv);
  const total = x.lines.reduce((a, l) => a + lineTotal(l), 0);
  const setLine = (i: number, patch: Partial<Invoice['lines'][number]>) => setX({ ...x, lines: x.lines.map((l, k) => k === i ? { ...l, ...patch } : l) });
  const text = `${s.business.name}\nFacture ${x.number} du ${dateShort(x.issuedAt)}\nPour : ${x.party}\n${x.lines.map(l => `${fmtQty(l.qty)} × ${l.label} : ${fmt(lineTotal(l))} F`).join('\n')}\nTOTAL : ${fmt(total)} F\nÀ régler avant le ${dateShort(x.dueAt)} par Wave, Orange Money ou espèces.`;
  const save = (patch: Partial<Invoice> = {}) => { saveInvoice({ ...x, ...patch, total }); toast('Facture enregistrée'); onClose(); };
  return (
    <Sheet title={x.kind === 'client' ? `Facture ${x.number}` : `Facture fournisseur`} onClose={onClose} foot={
      <div class="grid2">
        {!x.paidAt ? <button class="btn" onClick={() => save({ paidAt: Date.now(), method: 'wave' })}>Marquer payée</button> : <span />}
        <button class="btn pri" disabled={!x.party || !total} onClick={() => save()}>Enregistrer</button>
      </div>}>
      <Field label={x.kind === 'client' ? 'Client' : 'Fournisseur'}><input class="inp" value={x.party} onInput={e => setX({ ...x, party: e.currentTarget.value })} /></Field>
      <Field label="Téléphone"><input class="inp" type="tel" value={x.phone ?? ''} onInput={e => setX({ ...x, phone: e.currentTarget.value })} /></Field>
      {x.kind === 'supplier' && <Field label="Numéro de la facture"><input class="inp" value={x.number} onInput={e => setX({ ...x, number: e.currentTarget.value })} /></Field>}
      <Section title="Lignes">
        <div class="stack">{x.lines.map((l, i) => (
          <div class="invline" key={i}>
            <input class="inp" placeholder="Désignation" value={l.label} onInput={e => setLine(i, { label: e.currentTarget.value })} />
            <input class="inp num" inputMode="decimal" aria-label="Quantité" defaultValue={String(l.qty).replace('.', ',')} onInput={e => { const v = parseDec(e.currentTarget.value); setLine(i, { qty: Number.isFinite(v) ? v : 0 }); }} />
            <NumInput value={l.price} onInput={v => setLine(i, { price: Number(v) || 0 })} />
          </div>))}
          <button class="link" onClick={() => setX({ ...x, lines: [...x.lines, { label: '', qty: 1, price: 0 }] })}>+ Ajouter une ligne</button>
        </div>
      </Section>
      <Field label="Échéance"><input class="inp" type="date" value={new Date(x.dueAt).toISOString().slice(0, 10)} onInput={e => setX({ ...x, dueAt: Date.parse(e.currentTarget.value + 'T12:00:00Z') || x.dueAt })} /></Field>
      <div class="kv tot"><span>Total</span><Money v={total} /></div>
      {x.paidAt && <div class="banner ok">Payée le {dateShort(x.paidAt)}</div>}
      {x.kind === 'client' && x.phone && total > 0 && <a class="btn big" href={waLink(x.phone, text)} target="_blank" rel="noopener"><Icon n="chat" size={18} /> Envoyer la facture par WhatsApp</a>}
    </Sheet>
  );
}

// ---------------- Journal ----------------
export function LogPage() {
  const s = useStore();
  return (
    <>
      <p class="hint">Chaque action est enregistrée avec l'heure et la personne. Rien ne peut être effacé, même par la gérante.</p>
      <div class="card list">{s.log.length ? s.log.slice(0, 120).map(l => (
        <div class="row" key={l.id}><div class="main"><div class="ttl">{l.action}{l.detail ? ` · ${l.detail}` : ''}</div><div class="sub">{dateShort(l.at)} {time(l.at)} · {person(l.byId)?.name ?? '—'}</div></div></div>
      )) : <Empty>Le journal se remplit au fur et à mesure des actions.</Empty>}</div>
    </>
  );
}

// ---------------- Réglages ----------------
export function SettingsPage() {
  const s = useStore();
  const b = s.business;
  const [edit, setEdit] = useState<Person | null>(null);
  const lastMgrGeo = s.attendance.filter(a => a.geo).sort((x, y) => y.inAt - x.inAt)[0]?.geo;
  const setSet = (k: keyof typeof b.settings, v: number) => updateBusiness({ settings: { ...b.settings, [k]: v } });
  return (
    <>
      <Section title="Commerce">
        <div class="card stack">
          <Field label="Nom"><input class="inp" value={b.name} onChange={e => updateBusiness({ name: e.currentTarget.value })} /></Field>
          <div class="grid2">
            <Field label="Type"><input class="inp" value={b.kind} onChange={e => updateBusiness({ kind: e.currentTarget.value })} /></Field>
            <Field label="Quartier"><input class="inp" value={b.district} onChange={e => updateBusiness({ district: e.currentTarget.value })} /></Field>
          </div>
          <Field label="Fond de caisse laissé chaque soir"><NumInput value={b.openingFloat} onInput={v => updateBusiness({ openingFloat: Number(v) || 0 })} /></Field>
          <Field label="Position du commerce" hint="Sert à vérifier que les pointages et dépenses sont faits sur place.">
            <div class="row"><div class="main sub">{b.zone ? `${b.zone.lat.toFixed(5)}, ${b.zone.lng.toFixed(5)} · rayon ${b.zone.radiusM} m` : 'Non définie'}</div>
              {lastMgrGeo && <button class="btn sm" onClick={() => { updateBusiness({ zone: { lat: lastMgrGeo.lat, lng: lastMgrGeo.lng, radiusM: b.zone?.radiusM ?? 150 } }); toast('Position mise à jour'); }}>Prendre le dernier pointage</button>}</div>
          </Field>
        </div>
      </Section>
      <Section title="Seuils d'alerte">
        <div class="card stack">
          <Field label="Écart de caisse qui déclenche une alerte"><NumInput value={b.settings.cashGapAlert} onInput={v => setSet('cashGapAlert', Number(v) || 0)} /></Field>
          <Field label="Dépense à valider au-delà de"><NumInput value={b.settings.expenseApprovalAbove} onInput={v => setSet('expenseApprovalAbove', Number(v) || 0)} /></Field>
          <div class="grid2">
            <Field label="Ouverture (heure)"><NumInput value={b.settings.openHour} onInput={v => setSet('openHour', Math.min(23, Number(v) || 0))} /></Field>
            <Field label="Fermeture (heure)"><NumInput value={b.settings.closeHour} onInput={v => setSet('closeHour', Math.min(23, Number(v) || 0))} /></Field>
          </div>
        </div>
      </Section>
      <Section title="Équipe" aside={<button class="link" onClick={() => setEdit({ id: '', name: '', job: 'Serveur', phone: '', role: 'staff', salary: 50000, payMethod: 'wave', restDay: 1, active: true })}>+ Ajouter</button>}>
        <div class="card list">{s.people.filter(p => p.role !== 'owner').map(p => (
          <button class="row btnrow" key={p.id} onClick={() => setEdit(p)}>
            <span class="av sm">{p.name[0]}</span>
            <div class="main"><div class="ttl">{p.name}{!p.active ? ' (inactif)' : ''}</div><div class="sub">{p.job} · {fmt(p.salary)} F/mois · repos {DAYS[p.restDay ?? 0]}</div></div>
            <Icon n="right" size={16} />
          </button>))}</div>
      </Section>
      {getMode() === 'cloud' ? (
        <Section title="Code d'invitation">
          <div class="card stack">
            <p class="muted">Donnez ce code à votre gérant·e. Sur son téléphone, elle ouvre Salomé, choisit « Je suis gérant·e » et le saisit.</p>
            <p class="invite num">{s.cloud?.inviteCode || '—'}</p>
            <button class="btn" onClick={async () => {
              const { data, error } = await sb.rpc('new_invite_code', { b: s.business.id });
              if (error) { toast('Impossible : vérifiez la connexion'); return; }
              const st = get(); if (st.cloud) { st.cloud.inviteCode = data as string; updateBusiness({}); }
              toast("Nouveau code créé. L'ancien ne marche plus.");
            }}>Créer un nouveau code</button>
            <button class="btn" onClick={async () => { await signOutAll(); leaveMode(); }}>Se déconnecter de ce téléphone</button>
          </div>
        </Section>
      ) : (
        <Section title="Démo">
          <div class="card stack">
            <p class="muted">La démo garde les données sur ce téléphone. Pour suivre votre vrai commerce, quittez la démo et créez votre compte.</p>
            <button class="btn" onClick={() => { resetDemo(); toast('Démo réinitialisée'); }}>Remettre les données de démo</button>
            <button class="btn" onClick={logout}>Changer de profil</button>
            <button class="btn" onClick={leaveMode}>Quitter la démo</button>
          </div>
        </Section>
      )}
      {edit && <PersonSheet p={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
function PersonSheet({ p, onClose }: { p: Person; onClose: () => void }) {
  const [x, setX] = useState(p);
  return (
    <Sheet title={p.id ? p.name : 'Nouvelle personne'} onClose={onClose} foot={<button class="btn pri big" disabled={!x.name} onClick={() => { if (p.id) updatePerson(p.id, x); else addPerson(x); toast('Enregistré'); onClose(); }}>Enregistrer</button>}>
      <div class="grid2">
        <Field label="Prénom"><input class="inp" value={x.name} onInput={e => setX({ ...x, name: e.currentTarget.value })} /></Field>
        <Field label="Poste"><input class="inp" value={x.job} onInput={e => setX({ ...x, job: e.currentTarget.value })} /></Field>
      </div>
      <Field label="Téléphone (Mobile Money)"><input class="inp" type="tel" value={x.phone} onInput={e => setX({ ...x, phone: e.currentTarget.value })} /></Field>
      <div class="grid2">
        <Field label="Salaire mensuel"><NumInput value={x.salary} onInput={v => setX({ ...x, salary: Number(v) || 0 })} /></Field>
        <Field label="Jour de repos"><select class="inp" value={x.restDay} onChange={e => setX({ ...x, restDay: Number(e.currentTarget.value) })}>{DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></Field>
      </div>
      <Field label="Payé par"><select class="inp" value={x.payMethod} onChange={e => setX({ ...x, payMethod: e.currentTarget.value as PayMethod })}>{METHOD_KEYS.map(k => <option key={k} value={k}>{METHODS[k].name}</option>)}</select></Field>
      <label class="check"><input type="checkbox" checked={x.role === 'manager'} onChange={e => setX({ ...x, role: e.currentTarget.checked ? 'manager' : 'staff', pin: x.pin ?? '' })} /> Peut se connecter à l'appli (gérant·e)</label>
      {x.role === 'manager' && <Field label="Code à 4 chiffres"><input class="inp num" inputMode="numeric" maxLength={4} value={x.pin ?? ''} onInput={e => setX({ ...x, pin: e.currentTarget.value.replace(/\D/g, '').slice(0, 4) })} /></Field>}
      <label class="check"><input type="checkbox" checked={x.active} onChange={e => setX({ ...x, active: e.currentTarget.checked })} /> Fait partie de l'équipe</label>
    </Sheet>
  );
}
