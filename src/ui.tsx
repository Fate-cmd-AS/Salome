import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { METHODS, fmt } from './format';
import type { PayMethod } from './types';
import { compressPhoto, useOnline, get } from './store';

const ICONS: Record<string, string> = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.3 3-5 6-5s5.4 1.7 6 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.5.2 4.3 1.8 4.8 4.8"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  doc: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  box: '<path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  cart: '<path d="M3 4h2l2.4 11h10.4L20 7H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  logout: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wallet: '<path d="M4 7h15a1 1 0 0 1 1 1v11H5a1 1 0 0 1-1-1z"/><path d="M4 7l11-3v3M16 13h2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
};

export function Icon({ n, size = 22 }: { n: string; size?: number }) {
  return <svg class="ic" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[n] ?? '' }} />;
}

/** Formes rondes décoratives du haut des écrans d'accueil, avec le logo. */
export const Deco = ({ sm }: { sm?: boolean }) => (
  <div class={'deco' + (sm ? ' sm' : '')} aria-hidden="true"><i class="d1" /><i class="d2" /><span class="logo">S</span></div>
);

export const Money = ({ v, cls = '' }: { v: number; cls?: string }) => <span class={'num ' + cls}>{fmt(v)}&nbsp;F</span>;

export function MethodBadge({ m }: { m: PayMethod }) {
  return <span class="mico" style={{ background: METHODS[m].color }} title={METHODS[m].name}>{METHODS[m].short}</span>;
}

export const Pill = ({ k = 'mute', children }: { k?: 'ok' | 'warn' | 'bad' | 'mute'; children: ComponentChildren }) => <span class={'pill ' + k}>{children}</span>;

export function Sheet({ title, onClose, children, foot }: { title: string; onClose: () => void; children: ComponentChildren; foot?: ComponentChildren }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); document.body.classList.add('noscroll');
    return () => { window.removeEventListener('keydown', k); document.body.classList.remove('noscroll'); };
  }, []);
  return (
    <div class="sheet-wrap" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-h"><b>{title}</b><button class="icon-btn" onClick={onClose} aria-label="Fermer"><Icon n="x" /></button></div>
        <div class="sheet-b">{children}</div>
        {foot && <div class="sheet-f">{foot}</div>}
      </div>
    </div>
  );
}

// ---------- notifications éphémères ----------
let toastFn: ((t: string) => void) | null = null;
export const toast = (t: string) => toastFn?.(t);
export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { let h: number; toastFn = t => { setMsg(t); clearTimeout(h); h = window.setTimeout(() => setMsg(null), 2600); }; }, []);
  return msg ? <div class="toast" role="status">{msg}</div> : null;
}

export function NetChip() {
  const on = useOnline();
  const pending = get().outbox;
  return <span class={'net ' + (on ? '' : 'off')}><i />{on ? 'En ligne' : `Hors ligne${pending ? ` · ${pending} en attente` : ''}`}</span>;
}

export function TopBar({ title, sub, right }: { title: string; sub?: string; right?: ComponentChildren }) {
  return (
    <header class="top">
      <div class="top-l"><div class="t">{title}</div>{sub && <div class="s">{sub}</div>}</div>
      <div class="top-r">{right}</div>
    </header>
  );
}

export function BottomNav<T extends string>({ tabs, cur, onTab }: { tabs: [T, string, string, number?][]; cur: T; onTab: (t: T) => void }) {
  return (
    <nav class="nav" style={{ gridTemplateColumns: `repeat(${tabs.length},1fr)` }}>
      {tabs.map(([k, label, icon, badge]) => (
        <button key={k} aria-current={cur === k} onClick={() => onTab(k)}>
          <Icon n={icon} />{label}{badge ? <span class="badge">{badge > 99 ? '99+' : badge}</span> : null}
        </button>
      ))}
    </nav>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ComponentChildren; children: ComponentChildren }) {
  return <section class="sec"><div class="sec-t"><h3>{title}</h3>{aside && <span>{aside}</span>}</div>{children}</section>;
}

export function Empty({ children }: { children: ComponentChildren }) { return <div class="empty">{children}</div>; }

export function Field({ label, children, hint }: { label: string; children: ComponentChildren; hint?: string }) {
  return <label class="field"><span class="lab">{label}</span>{children}{hint && <span class="hint">{hint}</span>}</label>;
}

export function NumInput(props: { value: number | ''; onInput: (v: number | '') => void; placeholder?: string; autoFocus?: boolean; big?: boolean }) {
  return <input class={'inp num' + (props.big ? ' big' : '')} inputMode="numeric" pattern="[0-9]*" placeholder={props.placeholder ?? '0'} autoFocus={props.autoFocus}
    value={props.value === '' ? '' : fmt(props.value)}
    onInput={e => { const d = (e.currentTarget.value || '').replace(/\D/g, ''); props.onInput(d ? Number(d) : ''); }} />;
}

/** Saisie d'une quantité décimale (ex. 1,5 kg). */
export function DecInput({ value, onInput, placeholder, big, autoFocus, id }: { value: number | ''; onInput: (v: number | '') => void; placeholder?: string; big?: boolean; autoFocus?: boolean; id?: string }) {
  const [raw, setRaw] = useState(value === '' ? '' : String(value).replace('.', ','));
  return <input id={id} class={'inp num' + (big ? ' big' : '')} inputMode="decimal" placeholder={placeholder ?? '0'} autoFocus={autoFocus} value={raw}
    onInput={e => { const t = e.currentTarget.value.replace(/[^0-9.,]/g, ''); setRaw(t); const v = parseFloat(t.replace(',', '.')); onInput(Number.isFinite(v) ? v : ''); }} />;
}

export function PhotoInput({ value, onChange, label = 'Prendre une photo', capture = 'environment' }: { value?: string; onChange: (v?: string) => void; label?: string; capture?: 'environment' | 'user' }) {
  const [busy, setBusy] = useState(false);
  return (
    <div class="photo-in">
      {value ? <img src={value} alt="Photo jointe" /> : <div class="photo-ph"><Icon n="camera" /></div>}
      <label class="btn">
        {busy ? 'Traitement…' : value ? 'Reprendre' : label}
        <input type="file" accept="image/*" capture={capture} hidden onChange={async (e: JSX.TargetedEvent<HTMLInputElement>) => {
          const f = e.currentTarget.files?.[0]; if (!f) return;
          setBusy(true);
          try { onChange(await compressPhoto(f)); } catch { toast("Impossible de lire la photo"); }
          setBusy(false);
        }} />
      </label>
      {value && <button class="btn ghost" onClick={() => onChange(undefined)}>Retirer</button>}
    </div>
  );
}

/** Histogramme simple (recette par jour). */
export function Bars({ data, highlight }: { data: { label: string; v: number; sub?: string }[]; highlight?: number }) {
  const max = Math.max(1, ...data.map(d => d.v));
  return (
    <div class="bars" role="img" aria-label="Recette par jour">
      {data.map((d, i) => (
        <div class={'bar' + (i === highlight ? ' on' : '')} key={i} title={`${d.label} : ${fmt(d.v)} F`}>
          <i style={{ height: `${Math.max(2, (d.v / max) * 100)}%` }} />
          <span>{d.sub ?? d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Split({ parts }: { parts: { v: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.v, 0) || 1;
  return <div class="split">{parts.filter(p => p.v > 0).map((p, i) => <i key={i} style={{ flex: p.v / total, background: p.color }} />)}</div>;
}
