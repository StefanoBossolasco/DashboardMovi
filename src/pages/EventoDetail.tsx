import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../firebase';
import { useAuth } from '../auth';
import { useAppConfig } from '../App';
import { describeError, useCol } from '../hooks';
import { eur, fmtDate, parseAmount, todayISO } from '../lib/format';
import { PARTICIPANT_METHODS, type EventDoc, type Movement, type Participant } from '../lib/types';
import EventForm from '../components/EventForm';
import MovementForm from '../components/MovementForm';
import { Badge, Empty, ErrorBox, Field, Modal, Stat } from '../components/ui';
import { MovementRow } from './PrimaNota';

export default function EventoDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { isAdmin, email, user } = useAuth();
  const { subgroups } = useAppConfig();
  const [event, setEvent] = useState<EventDoc | null | undefined>(undefined);
  const [evError, setEvError] = useState('');
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'events', id),
        (s) => setEvent(s.exists() ? ({ ...s.data(), id: s.id } as EventDoc) : null),
        (e) => {
          setEvent(null);
          setEvError(describeError(e));
        },
      ),
    [id],
  );

  const parts = useCol<Participant>(() => (event ? query(collection(db, 'events', id, 'participants')) : null), [id, !!event]);
  const exps = useCol<Movement>(() => (event ? query(collection(db, 'movements'), where('eventId', '==', id)) : null), [id, !!event]);

  const [tab, setTab] = useState<'part' | 'spese'>('part');
  const [newName, setNewName] = useState('');
  const [search, setSearch] = useState('');
  const [editPart, setEditPart] = useState<Participant | null>(null);
  const [editMov, setEditMov] = useState<Partial<Movement> | null>(null);
  const [settings, setSettings] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const list = useMemo(
    () =>
      parts.data
        .filter((p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name, 'it')),
    [parts.data, search],
  );

  if (event === undefined) return <p className="muted">Caricamento…</p>;
  if (event === null)
    return (
      <Empty title="Evento non disponibile">
        {evError || "L'evento non esiste più oppure non sei abilitato."} <Link to="/eventi">Torna agli eventi</Link>
      </Empty>
    );

  const paid = parts.data.filter((p) => p.paid);
  const incassato = paid.reduce((s, p) => s + p.due, 0);
  const daIncassare = parts.data.filter((p) => !p.paid).reduce((s, p) => s + p.due, 0);
  const spese = exps.data.filter((m) => m.type === 'uscita').reduce((s, m) => s + m.amount, 0);
  const perMethod = PARTICIPANT_METHODS.map((m) => ({
    m,
    n: paid.filter((p) => p.method === m).length,
    tot: paid.filter((p) => p.method === m).reduce((s, p) => s + p.due, 0),
  }));
  const toRecord = paid.filter((p) => !p.movementId && p.due > 0);

  const guard = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(describeError(e));
    }
  };

  const addParticipants = () => {
    // Si possono incollare piu' nomi separati da virgola o a capo
    const names = newName
      .split(/[\n,;]+/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (!names.length) return;
    setNewName('');
    guard(async () => {
      const batch = writeBatch(db);
      names.forEach((name, i) =>
        batch.set(doc(collection(db, 'events', id, 'participants')), {
          name,
          contact: '',
          due: event.fee || 0,
          paid: false,
          method: '',
          paidAt: '',
          note: '',
          createdAt: Date.now() + i,
        }),
      );
      await batch.commit();
    });
  };

  const setPayment = (p: Participant, method: string) => {
    if (p.movementId) {
      setError(`L'incasso di ${p.name} è già registrato in prima nota: per cambiarlo apri la scheda del partecipante.`);
      return;
    }
    const same = p.paid && p.method === method;
    guard(() =>
      updateDoc(doc(db, 'events', id, 'participants', p.id), same ? { paid: false, method: '', paidAt: '' } : { paid: true, method, paidAt: todayISO() }),
    );
  };

  /** Crea in prima nota un'entrata per ogni metodo con gli incassi non ancora registrati */
  const recordIncome = async () => {
    const summary = PARTICIPANT_METHODS.map((m) => {
      const g = toRecord.filter((p) => p.method === m);
      return g.length ? `• ${m}: ${g.length} quote, ${eur(g.reduce((s, p) => s + p.due, 0))}` : '';
    })
      .filter(Boolean)
      .join('\n');
    if (!window.confirm(`Registrare in prima nota questi incassi?\n${summary}`)) return;
    setBusy(true);
    await guard(async () => {
      const batch = writeBatch(db);
      const groups = new Map<string, Participant[]>();
      toRecord.forEach((p) => groups.set(p.method || 'Altro', [...(groups.get(p.method || 'Altro') || []), p]));
      groups.forEach((g, method) => {
        const ref = doc(collection(db, 'movements'));
        batch.set(ref, {
          date: todayISO(),
          type: 'entrata',
          amount: Math.round(g.reduce((s, p) => s + p.due, 0) * 100) / 100,
          description: `Quote ${event.name} (${g.length} ${g.length === 1 ? 'partecipante' : 'partecipanti'})`,
          subgroup: event.subgroup,
          method,
          hasInvoice: false,
          paidBy: '',
          compiledBy: user?.name || email,
          advance: false,
          reimbursed: false,
          note: g.map((p) => p.name).join(', ').slice(0, 900),
          eventId: id,
          createdBy: email,
          createdAt: Date.now(),
        });
        g.forEach((p) => batch.update(doc(db, 'events', id, 'participants', p.id), { movementId: ref.id }));
      });
      await batch.commit();
    });
    setBusy(false);
  };

  const exportXlsx = () => {
    const aoa = [
      ['NOME', 'CONTATTO', 'QUOTA', 'PAGATO', 'METODO', 'DATA PAGAMENTO', 'NOTE'],
      ...list.map((p) => [p.name, p.contact, p.due, p.paid ? 'Sì' : 'No', p.method, p.paidAt ? fmtDate(p.paidAt) : '', p.note]),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Partecipanti');
    XLSX.writeFile(wb, `partecipanti-${event.name.replace(/[^\w]+/g, '-').toLowerCase()}.xlsx`);
  };

  const canEditMov = (m: Movement) => isAdmin || (m.createdBy === email && !m.bankTxId && !m.invoiceId);

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/eventi" className="back">
            ‹ Eventi
          </Link>
          <h1>{event.name}</h1>
          <p className="muted">
            {fmtDate(event.date)} · {event.subgroup}
            {event.fee ? ` · quota ${eur(event.fee)}` : ''}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={exportXlsx} disabled={!parts.data.length}>
            Esporta elenco
          </button>
          {isAdmin && (
            <button className="btn" onClick={() => setSettings(true)}>
              Impostazioni
            </button>
          )}
        </div>
      </div>

      <div className="stats">
        <Stat label="Iscritti" value={String(parts.data.length)} />
        <Stat label="Hanno pagato" value={`${paid.length} / ${parts.data.length}`} />
        <Stat label="Incassato" value={eur(incassato)} tone="pos" />
        <Stat label="Da incassare" value={eur(daIncassare)} />
        <Stat label="Spese" value={eur(spese)} tone="neg" />
      </div>
      <div className="method-chips">
        {perMethod.map((x) => (
          <span key={x.m} className="method-chip">
            {x.m} <strong>{eur(x.tot)}</strong> <span className="muted">({x.n})</span>
          </span>
        ))}
      </div>

      <div className="tabs">
        <button className={tab === 'part' ? 'on' : ''} onClick={() => setTab('part')}>
          Partecipanti
        </button>
        <button className={tab === 'spese' ? 'on' : ''} onClick={() => setTab('spese')}>
          Spese {exps.data.length > 0 && <span className="count">{exps.data.length}</span>}
        </button>
      </div>

      <ErrorBox message={error || parts.error || exps.error} />

      {tab === 'part' ? (
        <>
          <form
            className="toolbar add-row"
            onSubmit={(e) => {
              e.preventDefault();
              addParticipants();
            }}
          >
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome e cognome (più nomi separati da virgola)" aria-label="Nuovo partecipante" />
            <button className="btn primary" type="submit" disabled={!newName.trim()}>
              Aggiungi
            </button>
          </form>
          {parts.data.length > 8 && (
            <input className="search" type="search" placeholder="Cerca partecipante…" value={search} onChange={(e) => setSearch(e.target.value)} />
          )}
          {isAdmin && toRecord.length > 0 && (
            <div className="notice">
              {toRecord.length} {toRecord.length === 1 ? 'pagamento non è ancora' : 'pagamenti non sono ancora'} in prima nota.{' '}
              <button className="btn small" onClick={recordIncome} disabled={busy}>
                Registra incassi in prima nota
              </button>
            </div>
          )}
          {parts.loading ? (
            <p className="muted">Caricamento…</p>
          ) : list.length === 0 ? (
            <Empty title="Nessun partecipante">Aggiungi i nomi qui sopra, poi segna il pagamento toccando il metodo.</Empty>
          ) : (
            <div className="card list">
              {list.map((p) => (
                <div key={p.id} className={`part-row${p.paid ? ' paid' : ''}`}>
                  <button className="part-main" onClick={() => setEditPart(p)}>
                    <strong>{p.name}</strong>
                    <span className="muted">
                      {eur(p.due)}
                      {p.paid ? ` · pagato ${p.method}` : ' · da pagare'}
                      {p.movementId ? ' · in prima nota' : ''}
                      {p.note ? ` · ${p.note}` : ''}
                    </span>
                  </button>
                  <div className="pay-buttons" role="group" aria-label={`Pagamento di ${p.name}`}>
                    {PARTICIPANT_METHODS.map((m) => (
                      <button key={m} className={p.paid && p.method === m ? 'on' : ''} onClick={() => setPayment(p, m)} aria-pressed={p.paid && p.method === m}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="toolbar">
            <button className="btn primary" onClick={() => setEditMov({})}>
              + Spesa
            </button>
            {isAdmin && <span className="muted small">Le spese compaiono anche in Prima nota, sottogruppo “{event.subgroup}”.</span>}
          </div>
          {exps.loading ? (
            <p className="muted">Caricamento…</p>
          ) : exps.data.length === 0 ? (
            <Empty title="Nessuna spesa">Aggiungi scontrini e acquisti fatti per questo evento.</Empty>
          ) : (
            <div className="card list">
              {[...exps.data]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((m) => (
                  <MovementRow key={m.id} m={m} onClick={canEditMov(m) ? () => setEditMov(m) : undefined} />
                ))}
            </div>
          )}
        </>
      )}

      {editPart && <ParticipantForm eventId={id} p={editPart} isAdmin={isAdmin} onClose={() => setEditPart(null)} />}
      {editMov && (
        <MovementForm
          title={editMov.id ? 'Modifica movimento' : 'Nuova spesa'}
          initial={editMov}
          subgroups={isAdmin ? subgroups : undefined}
          fixed={isAdmin && editMov.id ? { eventId: id, subgroup: event.subgroup } : { eventId: id, subgroup: event.subgroup, type: 'uscita' }}
          onClose={() => setEditMov(null)}
        />
      )}
      {settings && <EventForm initial={event} onClose={() => setSettings(false)} onDeleted={() => nav('/eventi')} />}
    </>
  );
}

function ParticipantForm({ eventId, p, isAdmin, onClose }: { eventId: string; p: Participant; isAdmin: boolean; onClose: () => void }) {
  const [name, setName] = useState(p.name);
  const [contact, setContact] = useState(p.contact);
  const [due, setDue] = useState(String(p.due).replace('.', ','));
  const [paid, setPaid] = useState(p.paid);
  const [method, setMethod] = useState(p.method || PARTICIPANT_METHODS[0]);
  const [note, setNote] = useState(p.note);
  const [error, setError] = useState('');
  const locked = !!p.movementId && !isAdmin;
  const ref = doc(db, 'events', eventId, 'participants', p.id);

  const save = async () => {
    if (!name.trim()) return setError('Il nome non può essere vuoto.');
    try {
      const changedPayment = paid !== p.paid || (paid && method !== p.method) || parseAmount(due) !== p.due;
      await updateDoc(ref, {
        name: name.trim(),
        contact: contact.trim(),
        note: note.trim(),
        ...(locked
          ? {}
          : {
              due: parseAmount(due),
              paid,
              method: paid ? method : '',
              paidAt: paid ? p.paidAt || todayISO() : '',
              ...(p.movementId && changedPayment ? { movementId: deleteField() } : {}),
            }),
      });
      onClose();
    } catch (e) {
      setError(describeError(e));
    }
  };
  const remove = async () => {
    if (!window.confirm(`Togliere ${p.name} dall'elenco?`)) return;
    try {
      await deleteDoc(ref);
      onClose();
    } catch (e) {
      setError(describeError(e));
    }
  };

  return (
    <Modal
      title="Partecipante"
      onClose={onClose}
      footer={
        <>
          {!locked && (
            <button className="btn danger ghost" onClick={remove}>
              Togli
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Annulla
          </button>
          <button className="btn primary" onClick={save}>
            Salva
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Nome" full>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Telefono o email">
          <input value={contact} onChange={(e) => setContact(e.target.value)} />
        </Field>
        <Field label="Quota (€)">
          <input inputMode="decimal" value={due} onChange={(e) => setDue(e.target.value)} disabled={locked} />
        </Field>
        <div className="field full checks">
          <label className="check">
            <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} disabled={locked} />
            Ha pagato
          </label>
          {paid && (
            <div className="segmented small">
              {PARTICIPANT_METHODS.map((m) => (
                <button key={m} type="button" className={method === m ? 'on' : ''} onClick={() => !locked && setMethod(m)} disabled={locked}>
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
        {p.movementId && (
          <p className="field full field-hint">
            <Badge tone="info">In prima nota</Badge>{' '}
            {isAdmin
              ? 'Questo incasso è già stato registrato: se cambi quota o pagamento, correggi anche il movimento in prima nota.'
              : 'Incasso già registrato in prima nota: quota e pagamento possono essere cambiati solo da un amministratore.'}
          </p>
        )}
        <Field label="Note" full>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Allergie, accompagnatori…" />
        </Field>
      </div>
      <ErrorBox message={error} />
    </Modal>
  );
}
