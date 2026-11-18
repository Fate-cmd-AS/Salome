// Premier écran : créer son commerce (propriétaire), le rejoindre avec un code (gérant·e), ou essayer la démo.
import { useState } from 'preact/hooks';
import { startDemo, startCloud, upsertPerson, login, get } from './store';
import { sb, seedUpload, startSync } from './sync';
import { makeEmpty } from './seed';
import { Icon, Field } from './ui';

type View = 'home' | 'owner' | 'join';

const errFr = (m: string) => {
  if (/Invalid login/i.test(m)) return 'Email ou mot de passe incorrect.';
  if (/already registered/i.test(m)) return 'Un compte existe déjà avec cet email, mais le mot de passe ne correspond pas. Choisissez « Se connecter » avec le bon mot de passe.';
  if (/permission denied/i.test(m)) return "Le serveur refuse l'accès : il manque le correctif SQL « fix-01-droits.sql » dans Supabase.";
  if (/Anonymous sign-ins are disabled/i.test(m)) return "Les connexions par code ne sont pas encore activées sur le serveur (réglage Supabase « Allow anonymous sign-ins »).";
  if (/Code inconnu/i.test(m)) return 'Ce code ne correspond à aucun commerce. Vérifiez-le auprès du propriétaire.';
  if (/Password should be/i.test(m)) return 'Le mot de passe doit faire au moins 6 caractères.';
  if (/Email not confirmed/i.test(m)) return "Confirmez d'abord votre email (lien reçu par email), puis reconnectez-vous.";
  if (/fetch|network/i.test(m)) return 'Pas de connexion internet. Réessayez quand le réseau revient.';
  return m;
};

export function Welcome() {
  const [v, setV] = useState<View>('home');
  return (
    <div class="login">
      <div class="brand"><span class="logo">S</span>Salomé</div>
      {v === 'home' && (
        <>
          <h1>Votre commerce, vu de loin, en toute confiance.</h1>
          <p class="muted">Ventes en direct, caisse vérifiée, dépenses justifiées, équipe suivie.</p>
          <div class="who">
            <button class="who-b" onClick={() => setV('owner')}><span class="av"><Icon n="shield" size={18} /></span><span><b>Je suis propriétaire</b><small>Créer mon commerce ou me connecter</small></span><Icon n="right" /></button>
            <button class="who-b" onClick={() => setV('join')}><span class="av"><Icon n="cart" size={18} /></span><span><b>Je suis gérant·e</b><small>Rejoindre le commerce avec le code reçu</small></span><Icon n="right" /></button>
            <button class="link" onClick={startDemo}>Essayer avec des données de démo</button>
          </div>
        </>
      )}
      {v === 'owner' && <Owner back={() => setV('home')} />}
      {v === 'join' && <Join back={() => setV('home')} />}
    </div>
  );
}

function Owner({ back }: { back: () => void }) {
  const [tab, setTab] = useState<'new' | 'login'>('new');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [name, setName] = useState('');
  const [biz, setBiz] = useState('');
  const [kind, setKind] = useState('Maquis');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('Abidjan');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  async function openExisting(userId: string) {
    const { data: mem, error } = await sb.from('members').select('business_id, role, name').eq('user_id', userId).limit(1);
    if (error) throw error;
    if (!mem?.length) return false;
    const m = mem[0];
    const { data: b } = await sb.from('businesses').select('name, invite_code').eq('id', m.business_id).single();
    startCloud(makeEmpty({ name: b?.name ?? '', kind: '', district: '', city: '', ownerName: m.name, userId, businessId: m.business_id, inviteCode: b?.invite_code ?? '', role: m.role }));
    await startSync();
    return true;
  }

  async function submit() {
    setBusy(true); setErr(''); setInfo('');
    try {
      let userId: string | undefined;
      if (tab === 'new') {
        // déjà connecté (ou compte déjà créé lors d'un premier essai) : on réutilise le compte
        const { data: cur } = await sb.auth.getSession();
        if (cur.session && cur.session.user.email === email.trim().toLowerCase()) userId = cur.session.user.id;
        else {
          const { data, error } = await sb.auth.signUp({ email: email.trim(), password: pwd, options: { data: { name } } });
          if (error && /already registered/i.test(error.message)) {
            const r = await sb.auth.signInWithPassword({ email: email.trim(), password: pwd });
            if (r.error) throw error;
            userId = r.data.user.id;
          } else {
            if (error) throw error;
            if (!data.session) { setInfo("Compte créé. Ouvrez l'email de confirmation que vous venez de recevoir, puis revenez ici et choisissez « Se connecter »."); setTab('login'); setBusy(false); return; }
            userId = data.user!.id;
          }
        }
        if (await openExisting(userId)) return;
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pwd });
        if (error) throw error;
        userId = data.user.id;
        if (await openExisting(userId)) return;
        if (!biz) { setInfo('Connecté. Il reste à créer votre commerce : remplissez le nom ci-dessous.'); setTab('new'); setBusy(false); return; }
      }
      const { data: r, error } = await sb.rpc('create_business', { p_name: biz.trim(), p_owner_name: name.trim() || 'Propriétaire' });
      if (error) throw error;
      const res = r as { business_id: string; invite_code: string };
      const s = makeEmpty({ name: biz.trim(), kind, district: district.trim(), city: city.trim(), ownerName: name.trim() || 'Propriétaire', userId: userId!, businessId: res.business_id, inviteCode: res.invite_code, role: 'owner', fresh: true });
      startCloud(s);
      seedUpload(get());
    } catch (e: any) { setErr(errFr(e?.message ?? String(e))); }
    setBusy(false);
  }

  const ready = email.includes('@') && pwd.length >= 6 && (tab === 'login' || (biz.trim() && name.trim()));
  return (
    <div class="stack">
      <button class="link" onClick={back}><Icon n="left" size={16} /> Retour</button>
      <div class="seg"><button aria-pressed={tab === 'new'} onClick={() => setTab('new')}>Créer mon commerce</button><button aria-pressed={tab === 'login'} onClick={() => setTab('login')}>Se connecter</button></div>
      {tab === 'new' && (
        <>
          <Field label="Votre prénom"><input id="o-name" class="inp" value={name} onInput={e => setName(e.currentTarget.value)} placeholder="ex. Moussa" /></Field>
          <Field label="Nom du commerce"><input id="o-biz" class="inp" value={biz} onInput={e => setBiz(e.currentTarget.value)} placeholder="ex. Maquis Le Baobab" /></Field>
          <div class="grid2">
            <Field label="Type"><select id="o-kind" class="inp" value={kind} onChange={e => setKind(e.currentTarget.value)}>{['Maquis', 'Restaurant', 'Boutique', 'Salon', 'Autre'].map(k => <option key={k}>{k}</option>)}</select></Field>
            <Field label="Ville"><input id="o-city" class="inp" value={city} onInput={e => setCity(e.currentTarget.value)} /></Field>
          </div>
          <Field label="Quartier"><input id="o-district" class="inp" value={district} onInput={e => setDistrict(e.currentTarget.value)} placeholder="ex. Marcory" /></Field>
        </>
      )}
      <Field label="Email"><input id="o-email" class="inp" type="email" autoComplete="email" value={email} onInput={e => setEmail(e.currentTarget.value)} /></Field>
      <Field label="Mot de passe" hint={tab === 'new' ? '6 caractères minimum' : undefined}><input id="o-pwd" class="inp" type="password" autoComplete={tab === 'new' ? 'new-password' : 'current-password'} value={pwd} onInput={e => setPwd(e.currentTarget.value)} /></Field>
      {info && <div class="banner ok">{info}</div>}
      {err && <div class="banner bad">{err}</div>}
      <button class="btn pri big" disabled={!ready || busy} onClick={submit}>{busy ? 'Un instant…' : tab === 'new' ? 'Créer mon commerce' : 'Se connecter'}</button>
    </div>
  );
}

function Join({ back }: { back: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [job, setJob] = useState('Gérante');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit() {
    setBusy(true); setErr('');
    try {
      let { data: { session } } = await sb.auth.getSession();
      if (!session) {
        const { data, error } = await sb.auth.signInAnonymously({ options: { data: { name } } });
        if (error) throw error;
        session = data.session;
      }
      const userId = session!.user.id;
      const { data: bid, error } = await sb.rpc('join_business', { p_code: code.trim(), p_name: name.trim() });
      if (error) throw error;
      startCloud(makeEmpty({ name: '', kind: '', district: '', city: '', ownerName: '', userId, businessId: bid as string, inviteCode: '', role: 'manager' }));
      await startSync();
      const existing = get().people.find(p => p.id === userId);
      upsertPerson({ ...(existing ?? { salary: 0, payMethod: 'wave' as const, active: true }), id: userId, name: name.trim(), job, phone: phone.replace(/\D/g, ''), role: 'manager', pin });
      login(userId, 'manager');
    } catch (e: any) { setErr(errFr(e?.message ?? String(e))); }
    setBusy(false);
  }
  const ready = code.trim().length >= 6 && name.trim() && /^\d{4}$/.test(pin);
  return (
    <div class="stack">
      <button class="link" onClick={back}><Icon n="left" size={16} /> Retour</button>
      <h1 style={{ fontSize: '24px', marginTop: 0 }}>Rejoindre le commerce</h1>
      <p class="muted">Le propriétaire vous donne un code à 6 caractères (dans son appli : Plus, Réglages).</p>
      <Field label="Code du commerce"><input id="j-code" class="inp num big" autoCapitalize="characters" maxLength={6} value={code} onInput={e => setCode(e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="AB12CD" /></Field>
      <div class="grid2">
        <Field label="Votre prénom"><input id="j-name" class="inp" value={name} onInput={e => setName(e.currentTarget.value)} placeholder="ex. Awa" /></Field>
        <Field label="Poste"><input id="j-job" class="inp" value={job} onInput={e => setJob(e.currentTarget.value)} /></Field>
      </div>
      <Field label="Téléphone (pour recevoir le salaire)"><input id="j-phone" class="inp" type="tel" value={phone} onInput={e => setPhone(e.currentTarget.value)} placeholder="07 07 12 34 56" /></Field>
      <Field label="Choisissez un code secret à 4 chiffres" hint="Il protège l'appli sur ce téléphone."><input id="j-pin" class="inp num" type="password" inputMode="numeric" maxLength={4} value={pin} onInput={e => setPin(e.currentTarget.value.replace(/\D/g, '').slice(0, 4))} /></Field>
      {err && <div class="banner bad">{err}</div>}
      <button class="btn pri big" disabled={!ready || busy} onClick={submit}>{busy ? 'Un instant…' : 'Rejoindre'}</button>
    </div>
  );
}
