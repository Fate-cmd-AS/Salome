import { render } from 'preact';
import { useState } from 'preact/hooks';
import './styles.css';
import { init, useStore, login, getMode, leaveMode } from './store';
import { Welcome } from './Welcome';
import { startSync, signOutAll } from './sync';
import { OwnerApp } from './owner/OwnerApp';
import { ManagerApp } from './manager/ManagerApp';
import { Toaster, Icon, Deco } from './ui';
import type { Person } from './types';

function Login() {
  const s = useStore();
  const [who, setWho] = useState<Person | null>(null);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState(false);
  const cloud = getMode() === 'cloud';
  const users = s.people.filter(p => (p.role === 'owner' || p.role === 'manager') && (!cloud || p.id === s.cloud?.userId));
  const press = (d: string) => {
    if (!who) return;
    const next = (pin + d).slice(0, 4);
    setPin(next); setErr(false);
    if (next.length === 4) {
      if (next === who.pin) login(who.id, who.role as 'owner' | 'manager');
      else { setErr(true); setTimeout(() => setPin(''), 400); }
    }
  };
  return (
    <div class="login">
      <Deco sm={!!who} />
      <div class="brand">Salomé</div>
      {!who && <h1>Qui utilise ce téléphone ?</h1>}
      <p class="lead">{s.business.name} · {s.business.district}, {s.business.city}</p>
      {!who ? (
        <div class="who">
          {users.map(u => (
            <button key={u.id} class="who-b" onClick={() => { if (u.role === 'owner' && cloud) login(u.id, 'owner'); else { setWho(u); setPin(''); } }}>
              <span class="av">{u.name[0]}</span>
              <span><b>{u.name}</b><small>{u.role === 'owner' ? 'Propriétaire · tableau de bord' : 'Gérant(e) sur place · caisse'}</small></span>
              <Icon n="right" />
            </button>
          ))}
          {!cloud && <p class="hint center">Démo : code propriétaire <b>1111</b>, code gérante <b>2222</b>.</p>}
          {cloud && !users.length && <p class="hint center">Chargement du commerce…</p>}
          <button class="link" onClick={async () => { if (cloud) await signOutAll(); leaveMode(); }}>{cloud ? 'Se déconnecter de ce téléphone' : 'Quitter la démo'}</button>
        </div>
      ) : (
        <div class="pinbox">
          <button class="link" onClick={() => setWho(null)}><Icon n="left" size={16} /> Changer de personne</button>
          <p>Bonjour <b>{who.name}</b>, entrez votre code.</p>
          <div class={'dots' + (err ? ' err' : '')} aria-live="polite">{[0, 1, 2, 3].map(i => <i key={i} class={pin.length > i ? 'on' : ''} />)}</div>
          {err && <p class="err-t">Code incorrect</p>}
          <div class="pinpad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => k === '' ? <span key="e" /> :
              <button key={k} onClick={() => k === '⌫' ? setPin(pin.slice(0, -1)) : press(k)} aria-label={k === '⌫' ? 'Effacer' : k}>{k}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const s = useStore();
  return (
    <>
      {!getMode() ? <Welcome /> : !s.session ? <Login /> : s.session.role === 'owner' ? <OwnerApp /> : <ManagerApp />}
      <Toaster />
    </>
  );
}

init().then(() => { render(<App />, document.getElementById('app')!); if (getMode() === 'cloud') void startSync(); });

if (!__SINGLE__ && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* le site marche aussi sans */ });
}
