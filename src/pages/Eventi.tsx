import { useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth';
import { useCol } from '../hooks';
import { eur, fmtDate, todayISO } from '../lib/format';
import type { EventDoc } from '../lib/types';
import EventForm from '../components/EventForm';
import EventImport from '../components/EventImport';
import { Empty, ErrorBox, PageHead } from '../components/ui';

export default function Eventi() {
  const { isAdmin, email } = useAuth();
  const { data, loading, error } = useCol<EventDoc>(
    () =>
      isAdmin
        ? query(collection(db, 'events'))
        : query(collection(db, 'events'), where('collaborators', 'array-contains', email)),
    [isAdmin, email],
  );
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const today = todayISO();
  const sorted = [...data].sort((a, b) => b.date.localeCompare(a.date));
  const upcoming = sorted.filter((e) => e.date >= today).reverse();
  const past = sorted.filter((e) => e.date < today);

  const card = (e: EventDoc) => (
    <Link key={e.id} to={`/eventi/${e.id}`} className="event-card card">
      <span className="event-date">{fmtDate(e.date)}</span>
      <strong>{e.name}</strong>
      <span className="muted">
        {e.subgroup}
        {e.fee ? ` · quota ${eur(e.fee)}` : ''}
      </span>
    </Link>
  );

  return (
    <>
      <PageHead title="Eventi" sub={isAdmin ? 'Partecipanti, pagamenti e spese di ogni evento.' : 'Gli eventi su cui sei abilitato.'}>
        {isAdmin && (
          <>
            <button className="btn" onClick={() => setImporting(true)}>
              Importa da Excel
            </button>
            <button className="btn primary" onClick={() => setCreating(true)}>
              + Evento
            </button>
          </>
        )}
      </PageHead>
      <ErrorBox message={error} />
      {loading ? (
        <p className="muted">Caricamento…</p>
      ) : data.length === 0 ? (
        <Empty title="Nessun evento">
          {isAdmin ? 'Crea il primo evento per raccogliere iscrizioni e pagamenti.' : 'Non sei ancora abilitato su nessun evento: chiedi a un amministratore.'}
        </Empty>
      ) : (
        <>
          {upcoming.length > 0 && (
            <>
              <h2 className="section-title">In programma</h2>
              <div className="event-grid">{upcoming.map(card)}</div>
            </>
          )}
          {past.length > 0 && (
            <>
              <h2 className="section-title">Passati</h2>
              <div className="event-grid">{past.map(card)}</div>
            </>
          )}
        </>
      )}
      {creating && <EventForm onClose={() => setCreating(false)} />}
      {importing && <EventImport onClose={() => setImporting(false)} />}
    </>
  );
}
