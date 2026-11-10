import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, limit, query, setDoc, where, writeBatch } from 'firebase/firestore';
import type { WorkBook } from 'xlsx';
import { db } from '../firebase';
import { useAuth } from '../auth';
import { useAppConfig } from '../App';
import { describeError, useCol } from '../hooks';
import { slug } from '../lib/format';
import { parseMovements, parseSpaces, readWorkbook, spaceIdForHeader, type ImportedBooking, type ImportedMovement } from '../lib/importers';
import { VOCI, voceLabel } from '../lib/modd';
import type { AppUser, Role, Space, Subgroup } from '../lib/types';
import { ErrorBox, PageHead } from '../components/ui';

const PALETTE = ['#15803d', '#ea580c', '#0891b2', '#b91c1c', '#7c3aed', '#c026d3', '#ca8a04', '#1d4ed8', '#57534e', '#64748b'];

export default function Impostazioni() {
  return (
    <>
      <PageHead title="Impostazioni" sub="Utenti, spazi, sottogruppi e import dello storico." />
      <Users />
      <Spaces />
      <Subgroups />
      <ImportStorico />
    </>
  );
}

function Users() {
  const { email: me } = useAuth();
  const { data, error } = useCol<AppUser>(() => query(collection(db, 'users')), []);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('collaboratore');
  const [err, setErr] = useState('');

  const add = async () => {
    const mail = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return setErr('Inserisci un indirizzo email valido (quello dell\'account Google).');
    setErr('');
    try {
      await setDoc(doc(db, 'users', mail), { email: mail, name: name.trim() || mail, role });
      setEmail('');
      setName('');
    } catch (e) {
      setErr(describeError(e));
    }
  };
  const change = (u: AppUser, r: Role) => setDoc(doc(db, 'users', u.email), { ...u, role: r }).catch((e) => setErr(describeError(e)));
  const remove = (u: AppUser) =>
    window.confirm(`Togliere l'accesso a ${u.name}?`) && deleteDoc(doc(db, 'users', u.email)).catch((e) => setErr(describeError(e)));

  return (
    <section className="card pad">
      <h2>Utenti</h2>
      <p className="muted small">
        Gli amministratori vedono e modificano tutto. I collaboratori vedono solo gli eventi su cui sono abilitati: lì
        gestiscono i partecipanti e aggiungono spese.
      </p>
      <div className="table-scroll">
        <table className="table">
          <tbody>
            {[...data].sort((a, b) => a.name.localeCompare(b.name)).map((u) => (
              <tr key={u.email}>
                <td>
                  <strong>{u.name}</strong>
                  <div className="muted small">{u.email}</div>
                </td>
                <td>
                  <select value={u.role} onChange={(e) => change(u, e.target.value as Role)} disabled={u.email === me} aria-label={`Ruolo di ${u.name}`}>
                    <option value="admin">Amministratore</option>
                    <option value="collaboratore">Collaboratore</option>
                  </select>
                </td>
                <td className="num">
                  {u.email !== me && (
                    <button className="btn small ghost danger" onClick={() => remove(u)}>
                      Togli
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="inline-form">
        <input type="email" placeholder="email@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
        <input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome" />
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Ruolo">
          <option value="collaboratore">Collaboratore</option>
          <option value="admin">Amministratore</option>
        </select>
        <button className="btn primary" onClick={add}>
          Aggiungi
        </button>
      </div>
      <ErrorBox message={err || error} />
    </section>
  );
}

function useSaver() {
  const [state, setState] = useState<'' | 'saving' | 'saved'>('');
  const [err, setErr] = useState('');
  const save = async (data: object) => {
    setState('saving');
    setErr('');
    try {
      await setDoc(doc(db, 'settings', 'config'), data, { merge: true });
      setState('saved');
      setTimeout(() => setState(''), 2000);
    } catch (e) {
      setErr(describeError(e));
      setState('');
    }
  };
  return { state, err, save };
}

function Spaces() {
  const { spaces } = useAppConfig();
  const [draft, setDraft] = useState<Space[]>(spaces);
  const [dirty, setDirty] = useState(false);
  const { state, err, save } = useSaver();
  useEffect(() => {
    if (!dirty) setDraft(spaces);
  }, [spaces, dirty]);
  const edit = (i: number, patch: Partial<Space>) => {
    setDirty(true);
    setDraft((d) => d.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  };
  return (
    <section className="card pad">
      <h2>Spazi</h2>
      <div className="rows">
        {draft.map((s, i) => (
          <div className="row" key={s.id}>
            <input type="color" value={s.color} onChange={(e) => edit(i, { color: e.target.value })} aria-label={`Colore di ${s.name}`} />
            <input value={s.name} onChange={(e) => edit(i, { name: e.target.value })} aria-label="Nome spazio" />
            <button
              className="btn small ghost danger"
              onClick={() => {
                if (!window.confirm(`Togliere "${s.name}"? Le prenotazioni già inserite restano ma senza nome dello spazio.`)) return;
                setDirty(true);
                setDraft((d) => d.filter((_, j) => j !== i));
              }}
            >
              Togli
            </button>
          </div>
        ))}
      </div>
      <div className="inline-form">
        <button
          className="btn"
          onClick={() => {
            setDirty(true);
            setDraft((d) => [...d, { id: `spazio-${Date.now().toString(36)}`, name: 'Nuovo spazio', color: PALETTE[d.length % PALETTE.length] }]);
          }}
        >
          + Spazio
        </button>
        <button
          className="btn primary"
          disabled={!dirty || state === 'saving'}
          onClick={async () => {
            await save({ spaces: draft.filter((s) => s.name.trim()) });
            setDirty(false);
          }}
        >
          {state === 'saved' ? 'Salvato ✓' : 'Salva spazi'}
        </button>
      </div>
      <ErrorBox message={err} />
    </section>
  );
}

function Subgroups() {
  const { subgroups } = useAppConfig();
  const [draft, setDraft] = useState<Subgroup[]>(subgroups);
  const [dirty, setDirty] = useState(false);
  const [name, setName] = useState('');
  const { state, err, save } = useSaver();
  useEffect(() => {
    if (!dirty) setDraft(subgroups);
  }, [subgroups, dirty]);
  const edit = (i: number, patch: Partial<Subgroup>) => {
    setDirty(true);
    setDraft((d) => d.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  };
  const voci = (side: 'U' | 'E') =>
    VOCI.filter((v) => v.side === side).map((v) => (
      <option key={v.code} value={v.code}>
        {voceLabel(v.code)}
      </option>
    ));
  return (
    <section className="card pad">
      <h2>Sottogruppi e voci del rendiconto</h2>
      <p className="muted small">
        Per ogni sottogruppo scegli in quale voce del Mod. D finiscono di norma uscite ed entrate. Sul singolo movimento
        si può sempre scegliere una voce diversa.
      </p>
      <div className="rows">
        {draft.map((s, i) => (
          <div className="row sg" key={s.name}>
            <strong>{s.name}</strong>
            <label>
              <span className="muted small">Uscite</span>
              <select value={s.modDU} onChange={(e) => edit(i, { modDU: e.target.value })}>
                {voci('U')}
              </select>
            </label>
            <label>
              <span className="muted small">Entrate</span>
              <select value={s.modDE} onChange={(e) => edit(i, { modDE: e.target.value })}>
                {voci('E')}
              </select>
            </label>
            <button
              className="btn small ghost danger"
              onClick={() => {
                if (!window.confirm(`Togliere il sottogruppo "${s.name}"? I movimenti già inseriti lo mantengono.`)) return;
                setDirty(true);
                setDraft((d) => d.filter((_, j) => j !== i));
              }}
            >
              Togli
            </button>
          </div>
        ))}
      </div>
      <div className="inline-form">
        <input placeholder="Nuovo sottogruppo" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nuovo sottogruppo" />
        <button
          className="btn"
          disabled={!name.trim() || draft.some((s) => s.name.toLowerCase() === name.trim().toLowerCase())}
          onClick={() => {
            setDirty(true);
            setDraft((d) => [...d, { name: name.trim(), modDU: 'U-A1', modDE: 'E-A3' }]);
            setName('');
          }}
        >
          + Aggiungi
        </button>
        <button
          className="btn primary"
          disabled={!dirty || state === 'saving'}
          onClick={async () => {
            await save({ subgroups: draft });
            setDirty(false);
          }}
        >
          {state === 'saved' ? 'Salvato ✓' : 'Salva sottogruppi'}
        </button>
      </div>
      <ErrorBox message={err} />
    </section>
  );
}

async function commitChunks<T>(items: T[], apply: (batch: ReturnType<typeof writeBatch>, item: T, i: number) => void) {
  for (let i = 0; i < items.length; i += 400) {
    const batch = writeBatch(db);
    items.slice(i, i + 400).forEach((it, j) => apply(batch, it, i + j));
    await batch.commit();
  }
}

function ImportStorico() {
  const { email } = useAuth();
  const config = useAppConfig();
  const [movWb, setMovWb] = useState<WorkBook | null>(null);
  const [movSheet, setMovSheet] = useState('');
  const [movs, setMovs] = useState<{ items: ImportedMovement[]; warnings: string[] } | null>(null);
  const [spWb, setSpWb] = useState<WorkBook | null>(null);
  const [spSheet, setSpSheet] = useState('');
  const [books, setBooks] = useState<ImportedBooking[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const attempt = (fn: () => void) => {
    setErr('');
    setMsg('');
    try {
      fn();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const loadMov = async (f?: File) => {
    if (!f) return;
    const wb = await readWorkbook(f);
    const sheet = wb.SheetNames.includes('Movimenti') ? 'Movimenti' : wb.SheetNames[0];
    setMovWb(wb);
    setMovSheet(sheet);
    attempt(() => setMovs(parseMovements(wb, sheet)));
  };
  const loadSp = async (f?: File) => {
    if (!f) return;
    const wb = await readWorkbook(f);
    const year = String(new Date().getFullYear());
    const sheet = wb.SheetNames.includes(year) ? year : wb.SheetNames[0];
    setSpWb(wb);
    setSpSheet(sheet);
    attempt(() => setBooks(parseSpaces(wb, sheet)));
  };

  const importMovs = async () => {
    if (!movs) return;
    setBusy(true);
    setErr('');
    try {
      const existing = await getDocs(query(collection(db, 'movements'), where('imported', '==', true), limit(1)));
      if (!existing.empty && !window.confirm('Hai già importato dei movimenti in passato: importando di nuovo lo stesso file creeresti dei doppioni.\n\nContinuare comunque?')) {
        setBusy(false);
        return;
      }
      const known = new Set(config.subgroups.map((s) => s.name));
      const missing = [...new Set(movs.items.map((m) => m.subgroup))].filter((n) => !known.has(n));
      if (missing.length)
        await setDoc(
          doc(db, 'settings', 'config'),
          { subgroups: [...config.subgroups, ...missing.map((name) => ({ name, modDU: 'U-A1', modDE: 'E-A3' }))] },
          { merge: true },
        );
      const now = Date.now();
      await commitChunks(movs.items, (batch, m, i) =>
        batch.set(doc(collection(db, 'movements')), { ...m, createdBy: email, createdAt: now + i, imported: true }),
      );
      setMsg(`Importati ${movs.items.length} movimenti.`);
      setMovs(null);
      setMovWb(null);
    } catch (e) {
      setErr(describeError(e));
    }
    setBusy(false);
  };

  const importBooks = async () => {
    if (!books?.length) return;
    setBusy(true);
    setErr('');
    try {
      const dates = books.map((b) => b.date).sort();
      const existing = await getDocs(
        query(collection(db, 'bookings'), where('date', '>=', dates[0]), where('date', '<=', dates[dates.length - 1]), limit(1)),
      );
      if (!existing.empty && !window.confirm('Nel calendario ci sono già prenotazioni in questo periodo: importando potresti creare dei doppioni.\n\nContinuare comunque?')) {
        setBusy(false);
        return;
      }
      const spaces = [...config.spaces];
      const idFor: Record<string, string> = {};
      for (const header of new Set(books.map((b) => b.spaceName))) {
        const preset = spaceIdForHeader(header);
        if (preset && spaces.some((s) => s.id === preset)) {
          idFor[header] = preset;
          continue;
        }
        const id = slug(header) || `spazio-${spaces.length}`;
        if (!spaces.some((s) => s.id === id)) {
          const name = header.charAt(0) + header.slice(1).toLowerCase();
          spaces.push({ id, name, color: PALETTE[spaces.length % PALETTE.length] });
        }
        idFor[header] = id;
      }
      if (spaces.length !== config.spaces.length) await setDoc(doc(db, 'settings', 'config'), { spaces }, { merge: true });
      await commitChunks(books, (batch, b) =>
        batch.set(doc(collection(db, 'bookings')), {
          spaceId: idFor[b.spaceName],
          date: b.date,
          start: b.start,
          end: b.end,
          title: b.title,
          note: '',
          createdBy: email,
          imported: true,
        }),
      );
      setMsg(`Importate ${books.length} prenotazioni dal foglio ${spSheet}.`);
      setBooks(null);
      setSpWb(null);
    } catch (e) {
      setErr(describeError(e));
    }
    setBusy(false);
  };

  return (
    <section className="card pad">
      <h2>Importa lo storico da Excel</h2>
      <p className="muted small">Da fare una volta sola, per partire con i dati già dentro.</p>

      <h3>Prima nota (file “Entrate uscite”)</h3>
      <div className="inline-form">
        <input type="file" accept=".xlsx,.xls" onChange={(e) => loadMov(e.target.files?.[0])} aria-label="File prima nota" />
        {movWb && (
          <select
            value={movSheet}
            onChange={(e) => {
              setMovSheet(e.target.value);
              attempt(() => setMovs(parseMovements(movWb, e.target.value)));
            }}
            aria-label="Foglio"
          >
            {movWb.SheetNames.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        )}
      </div>
      {movs && (
        <div className="import-preview">
          <p>
            Trovati <strong>{movs.items.length}</strong> movimenti nel foglio “{movSheet}”.
          </p>
          {movs.warnings.length > 0 && (
            <ul className="warn-list">
              {movs.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <button className="btn primary" onClick={importMovs} disabled={busy || !movs.items.length}>
            {busy ? 'Importazione…' : `Importa ${movs.items.length} movimenti`}
          </button>
        </div>
      )}

      <h3>Calendario (file “Utilizzo spazi”)</h3>
      <div className="inline-form">
        <input type="file" accept=".xlsx,.xls" onChange={(e) => loadSp(e.target.files?.[0])} aria-label="File utilizzo spazi" />
        {spWb && (
          <select
            value={spSheet}
            onChange={(e) => {
              setSpSheet(e.target.value);
              attempt(() => setBooks(parseSpaces(spWb, e.target.value)));
            }}
            aria-label="Foglio"
          >
            {spWb.SheetNames.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        )}
      </div>
      {books && (
        <div className="import-preview">
          <p>
            Trovate <strong>{books.length}</strong> prenotazioni nel foglio “{spSheet}”
            {books.some((b) => !b.start) ? ` (${books.filter((b) => !b.start).length} senza orario)` : ''}.
          </p>
          <button className="btn primary" onClick={importBooks} disabled={busy || !books.length}>
            {busy ? 'Importazione…' : `Importa ${books.length} prenotazioni`}
          </button>
        </div>
      )}
      {msg && <div className="notice ok">{msg}</div>}
      <ErrorBox message={err} />
    </section>
  );
}
