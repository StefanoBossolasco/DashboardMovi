import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, writeBatch } from 'firebase/firestore';
import type { WorkBook } from 'xlsx';
import { db } from '../firebase';
import { useAppConfig } from '../App';
import { describeError } from '../hooks';
import { eur, todayISO } from '../lib/format';
import { parseParticipants, readWorkbook, type ImportedParticipant } from '../lib/importers';
import { ErrorBox, Field, Modal } from './ui';

type Parsed = { title: string; fee: number; items: ImportedParticipant[] };

/** Crea un evento con i suoi partecipanti a partire dal foglio iscrizioni in Excel */
export default function EventImport({ onClose }: { onClose: () => void }) {
  const { subgroups } = useAppConfig();
  const nav = useNavigate();
  const [wb, setWb] = useState<WorkBook | null>(null);
  const [sheet, setSheet] = useState('');
  const [data, setData] = useState<Parsed | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayISO());
  const [subgroup, setSubgroup] = useState(subgroups[0]?.name ?? 'Altro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const parse = (book: WorkBook, s: string) => {
    setError('');
    setSheet(s);
    try {
      const p = parseParticipants(book, s);
      setData(p);
      setName(p.title);
      const t = p.title.toLowerCase();
      const guess = subgroups.find((g) => t.includes(g.name.toLowerCase()));
      if (guess) setSubgroup(guess.name);
    } catch (e) {
      setData(null);
      setError((e as Error).message);
    }
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    try {
      const book = await readWorkbook(f);
      setWb(book);
      parse(book, book.SheetNames[0]);
    } catch {
      setError('Non riesco a leggere il file: deve essere un Excel (.xlsx o .xls).');
    }
  };

  const paid = data?.items.filter((p) => p.paid) ?? [];
  const sum = (list: ImportedParticipant[]) => list.reduce((s, p) => s + p.due, 0);

  const run = async () => {
    if (!data?.items.length) return;
    if (!name.trim()) return setError("Dai un nome all'evento.");
    setBusy(true);
    setError('');
    try {
      const ref = doc(collection(db, 'events'));
      const now = Date.now();
      const all = data.items;
      // Prima scrittura: evento + primi partecipanti; poi il resto a blocchi
      for (let i = 0; i < all.length || i === 0; i += 400) {
        const batch = writeBatch(db);
        if (i === 0)
          batch.set(ref, { name: name.trim(), date, fee: data.fee, subgroup, collaborators: [], note: '', createdAt: now });
        all.slice(i, i + 400).forEach((p, j) =>
          batch.set(doc(collection(db, 'events', ref.id, 'participants')), {
            name: p.name,
            contact: p.contact,
            due: p.due,
            paid: p.paid,
            method: p.method,
            paidAt: '',
            note: p.note,
            createdAt: now + i + j,
          }),
        );
        await batch.commit();
      }
      nav(`/eventi/${ref.id}`);
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Importa evento da Excel"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button className="btn primary" onClick={run} disabled={busy || !data?.items.length}>
            {busy ? 'Importazione…' : data ? `Crea evento con ${data.items.length} partecipanti` : 'Crea evento'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="File iscrizioni" full hint="Foglio con colonne Numero, Nome, Adulto/bambino (si/no, costo, pagato), Satispay/Contanti.">
          <input type="file" accept=".xlsx,.xls" onChange={(e) => onFile(e.target.files?.[0])} />
        </Field>
        {wb && wb.SheetNames.length > 1 && (
          <Field label="Foglio" full>
            <select value={sheet} onChange={(e) => parse(wb, e.target.value)}>
              {wb.SheetNames.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
        )}
        {data && (
          <>
            <div className="field full import-preview">
              <span>
                <strong>{data.items.length}</strong> partecipanti ({data.items.filter((p) => p.child).length} bambini) · totale
                atteso <strong>{eur(sum(data.items))}</strong>
              </span>
              <span>
                Hanno pagato in <strong>{paid.length}</strong>: {eur(sum(paid))}
                {['Satispay', 'Contanti', 'Carta'].map((m) => {
                  const g = paid.filter((p) => p.method === m);
                  return g.length ? ` · ${m} ${eur(sum(g))}` : '';
                })}
              </span>
              {data.items.some((p) => p.due === 0) && (
                <span className="muted small">
                  {data.items.filter((p) => p.due === 0).length} senza quota (né adulto né bambino nel foglio): da verificare dopo
                  l'import.
                </span>
              )}
            </div>
            <Field label="Nome evento" full>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Data dell'evento">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Sottogruppo di prima nota">
              <select value={subgroup} onChange={(e) => setSubgroup(e.target.value)}>
                {subgroups.map((s) => (
                  <option key={s.name}>{s.name}</option>
                ))}
              </select>
            </Field>
          </>
        )}
      </div>
      <ErrorBox message={error} />
    </Modal>
  );
}
