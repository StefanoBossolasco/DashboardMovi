import { useState } from 'react';
import { addDoc, collection, deleteDoc, deleteField, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth';
import { describeError } from '../hooks';
import { parseAmount, todayISO } from '../lib/format';
import { VOCI, effectiveVoce, voceLabel } from '../lib/modd';
import { METHODS, type Movement, type MovementType, type Subgroup } from '../lib/types';
import { ErrorBox, Field, Modal } from './ui';

interface Props {
  title?: string;
  /** Movimento esistente (modifica) oppure valori iniziali (nuovo) */
  initial?: Partial<Movement>;
  /** Elenco sottogruppi: se assente il modulo e' in versione ridotta (collaboratori) */
  subgroups?: Subgroup[];
  /** Campi imposti e non modificabili (es. evento, tipo) */
  fixed?: Partial<Pick<Movement, 'eventId' | 'subgroup' | 'type'>>;
  /** Collegamenti da aggiungere alla creazione (riconciliazione) */
  extra?: Partial<Pick<Movement, 'bankTxId' | 'invoiceId'>>;
  onClose: () => void;
}

export default function MovementForm({ title, initial, subgroups, fixed, extra, onClose }: Props) {
  const { user, email } = useAuth();
  const id = initial?.id;
  const simple = !subgroups;
  const [type, setType] = useState<MovementType>(fixed?.type ?? initial?.type ?? 'uscita');
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount).replace('.', ',') : '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [subgroup, setSubgroup] = useState(
    (id ? initial?.subgroup : undefined) ?? fixed?.subgroup ?? initial?.subgroup ?? subgroups?.[0]?.name ?? 'Altro',
  );
  const [method, setMethod] = useState(initial?.method ?? 'Contanti');
  const [paidBy, setPaidBy] = useState(initial?.paidBy ?? '');
  const [hasInvoice, setHasInvoice] = useState(initial?.hasInvoice ?? false);
  const [advance, setAdvance] = useState(initial?.advance ?? false);
  const [reimbursed, setReimbursed] = useState(initial?.reimbursed ?? false);
  const [note, setNote] = useState(initial?.note ?? '');
  const [modD, setModD] = useState(initial?.modD ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const side = type === 'uscita' ? 'U' : 'E';
  const defaultVoce = subgroups ? effectiveVoce({ type, subgroup, modD: undefined }, subgroups) : '';

  const save = async () => {
    const value = parseAmount(amount);
    if (!description.trim()) return setError('Scrivi una descrizione.');
    if (value <= 0) return setError('Inserisci un importo maggiore di zero.');
    if (!date) return setError('Indica la data.');
    setBusy(true);
    setError('');
    const base = {
      date,
      type,
      amount: value,
      description: description.trim(),
      subgroup,
      method,
      hasInvoice,
      paidBy: paidBy.trim(),
      advance,
      reimbursed: advance && reimbursed,
      note: note.trim(),
    };
    try {
      if (id) {
        await updateDoc(doc(db, 'movements', id), {
          ...base,
          ...(simple ? {} : { modD: modD && modD.startsWith(side) ? modD : deleteField() }),
        });
      } else {
        await addDoc(collection(db, 'movements'), {
          ...base,
          ...(modD && modD.startsWith(side) ? { modD } : {}),
          ...(fixed?.eventId ? { eventId: fixed.eventId } : {}),
          ...extra,
          compiledBy: user?.name || email,
          createdBy: email,
          createdAt: Date.now(),
        });
      }
      onClose();
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!id || !window.confirm('Eliminare definitivamente questo movimento?')) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'movements', id));
      onClose();
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title ?? (id ? 'Modifica movimento' : 'Nuovo movimento')}
      onClose={onClose}
      footer={
        <>
          {id && (
            <button className="btn danger ghost" onClick={remove} disabled={busy}>
              Elimina
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? 'Salvataggio…' : 'Salva'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        {!fixed?.type && (
          <div className="field full">
            <span className="field-label">Tipo</span>
            <div className="segmented">
              {(['uscita', 'entrata'] as const).map((t) => (
                <button key={t} type="button" className={type === t ? `on ${t}` : ''} onClick={() => setType(t)}>
                  {t === 'uscita' ? 'Uscita' : 'Entrata'}
                </button>
              ))}
            </div>
          </div>
        )}
        <Field label="Importo (€)">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" autoFocus={!id} />
        </Field>
        <Field label="Data">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Descrizione" full>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Es. Spesa per cena" />
        </Field>
        {!simple && !fixed?.subgroup && (
          <Field label="Sottogruppo">
            <select value={subgroup} onChange={(e) => setSubgroup(e.target.value)}>
              {!subgroups!.some((s) => s.name === subgroup) && <option>{subgroup}</option>}
              {subgroups!.map((s) => (
                <option key={s.name}>{s.name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Metodo di pagamento">
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {!METHODS.includes(method) && <option value={method}>{method || '—'}</option>}
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label={type === 'uscita' ? 'Pagato da' : 'Ricevuto da'}>
          <input value={paidBy} onChange={(e) => setPaidBy(e.target.value)} placeholder="Nome" />
        </Field>
        {!simple && (
          <Field label="Voce del rendiconto (Mod. D)" full hint={modD ? undefined : `Predefinita del sottogruppo: ${voceLabel(defaultVoce)}`}>
            <select value={modD.startsWith(side) ? modD : ''} onChange={(e) => setModD(e.target.value)}>
              <option value="">Predefinita del sottogruppo</option>
              {VOCI.filter((v) => v.side === side).map((v) => (
                <option key={v.code} value={v.code}>
                  {voceLabel(v.code)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="field full checks">
          {type === 'uscita' && (
            <label className="check">
              <input type="checkbox" checked={advance} onChange={(e) => setAdvance(e.target.checked)} />
              Anticipata da un privato (da rimborsare)
            </label>
          )}
          {type === 'uscita' && advance && !simple && (
            <label className="check">
              <input type="checkbox" checked={reimbursed} onChange={(e) => setReimbursed(e.target.checked)} />
              Già rimborsata
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={hasInvoice} onChange={(e) => setHasInvoice(e.target.checked)} />
            C'è fattura
          </label>
        </div>
        <Field label="Note" full>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <ErrorBox message={error} />
    </Modal>
  );
}
