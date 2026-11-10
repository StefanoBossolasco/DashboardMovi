import { useState } from 'react';
import { addDoc, collection, deleteDoc, doc, query, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAppConfig } from '../App';
import { describeError, useCol } from '../hooks';
import { parseAmount, todayISO } from '../lib/format';
import type { AppUser, EventDoc } from '../lib/types';
import { ErrorBox, Field, Modal } from './ui';

export default function EventForm({ initial, onClose, onDeleted }: { initial?: EventDoc; onClose: () => void; onDeleted?: () => void }) {
  const { subgroups } = useAppConfig();
  const users = useCol<AppUser>(() => query(collection(db, 'users')), []);
  const [name, setName] = useState(initial?.name ?? '');
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [fee, setFee] = useState(initial ? String(initial.fee).replace('.', ',') : '');
  const [subgroup, setSubgroup] = useState(initial?.subgroup ?? subgroups[0]?.name ?? 'Altro');
  const [collaborators, setCollaborators] = useState<string[]>(initial?.collaborators ?? []);
  const [note, setNote] = useState(initial?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const collabUsers = users.data.filter((u) => u.role === 'collaboratore');

  const save = async () => {
    if (!name.trim()) return setError("Dai un nome all'evento.");
    setBusy(true);
    const data = { name: name.trim(), date, fee: parseAmount(fee), subgroup, collaborators, note: note.trim() };
    try {
      if (initial) await updateDoc(doc(db, 'events', initial.id), data);
      else await addDoc(collection(db, 'events'), { ...data, createdAt: Date.now() });
      onClose();
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!initial) return;
    if (!window.confirm(`Eliminare l'evento "${initial.name}"?\nI movimenti di prima nota collegati restano; l'elenco partecipanti non sarà più visibile.`)) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'events', initial.id));
      onDeleted?.();
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={initial ? 'Impostazioni evento' : 'Nuovo evento'}
      onClose={onClose}
      footer={
        <>
          {initial && (
            <button className="btn danger ghost" onClick={remove} disabled={busy}>
              Elimina
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            Salva
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Nome" full>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Cena al buio 2027" autoFocus={!initial} />
        </Field>
        <Field label="Data">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Quota a persona (€)">
          <input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0,00" />
        </Field>
        <Field label="Sottogruppo di prima nota" full hint="Spese e incassi dell'evento finiscono in questo sottogruppo.">
          <select value={subgroup} onChange={(e) => setSubgroup(e.target.value)}>
            {!subgroups.some((s) => s.name === subgroup) && <option>{subgroup}</option>}
            {subgroups.map((s) => (
              <option key={s.name}>{s.name}</option>
            ))}
          </select>
        </Field>
        <div className="field full">
          <span className="field-label">Collaboratori abilitati</span>
          {collabUsers.length === 0 ? (
            <span className="field-hint">Nessun collaboratore: aggiungili da Impostazioni → Utenti.</span>
          ) : (
            <div className="checks">
              {collabUsers.map((u) => (
                <label className="check" key={u.email}>
                  <input
                    type="checkbox"
                    checked={collaborators.includes(u.email)}
                    onChange={(e) =>
                      setCollaborators((c) => (e.target.checked ? [...c, u.email] : c.filter((x) => x !== u.email)))
                    }
                  />
                  {u.name} <span className="muted">({u.email})</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <Field label="Note" full>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <ErrorBox message={error} />
    </Modal>
  );
}
