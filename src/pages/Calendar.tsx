import { useMemo, useState, type CSSProperties } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth';
import { useAppConfig } from '../App';
import { describeError, useCol } from '../hooks';
import { addDays, fmtDate, fmtDateLong, fromISO, toISO, todayISO } from '../lib/format';
import type { Booking, Space } from '../lib/types';
import { Empty, ErrorBox, Field, Modal, PageHead } from '../components/ui';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // lunedi' = 0
  const start = new Date(year, month, 1 - offset);
  const weeks = Math.ceil((offset + new Date(year, month + 1, 0).getDate()) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toISO(d);
  });
}

function overlaps(a: Pick<Booking, 'start' | 'end'>, b: Pick<Booking, 'start' | 'end'>): boolean {
  // Senza orario si considera occupato tutto il giorno
  const as = a.start || '00:00';
  const ae = a.end || '24:00';
  const bs = b.start || '00:00';
  const be = b.end || '24:00';
  return as < be && bs < ae;
}

const timeLabel = (b: Booking) => (b.start ? `${b.start}${b.end ? '–' + b.end : ''}` : 'Orario n.d.');

export default function CalendarPage() {
  const { spaces } = useAppConfig();
  const today = todayISO();
  const [cursor, setCursor] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const [selected, setSelected] = useState(today);
  const [spaceFilter, setSpaceFilter] = useState('');
  const [editing, setEditing] = useState<Partial<Booking> | null>(null);

  const days = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const from = days[0];
  const to = days[days.length - 1];

  const { data, loading, error } = useCol<Booking>(
    () => query(collection(db, 'bookings'), where('date', '>=', from), where('date', '<=', to)),
    [from, to],
  );

  const spaceById = useMemo(() => Object.fromEntries(spaces.map((s) => [s.id, s])), [spaces]);
  const byDay = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    for (const b of data) {
      if (spaceFilter && b.spaceId !== spaceFilter) continue;
      (map[b.date] ||= []).push(b);
    }
    for (const k in map) map[k].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    return map;
  }, [data, spaceFilter]);

  const move = (delta: number) =>
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const goToday = () => {
    const d = new Date();
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(today);
  };

  const monthName = new Date(cursor.y, cursor.m, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const dayList = byDay[selected] || [];

  return (
    <>
      <PageHead title="Calendario spazi" sub="Chi usa cosa, e quando.">
        <button
          className="btn primary"
          onClick={() => setEditing({ date: selected, spaceId: spaceFilter || spaces[0]?.id, start: '20:30', end: '22:30' })}
        >
          + Prenotazione
        </button>
      </PageHead>

      <div className="toolbar">
        <div className="month-nav">
          <button className="icon-btn" onClick={() => move(-1)} aria-label="Mese precedente">
            ‹
          </button>
          <strong className="month-name">{monthName}</strong>
          <button className="icon-btn" onClick={() => move(1)} aria-label="Mese successivo">
            ›
          </button>
          <button className="btn small" onClick={goToday}>
            Oggi
          </button>
        </div>
        <select value={spaceFilter} onChange={(e) => setSpaceFilter(e.target.value)} aria-label="Filtra per spazio">
          <option value="">Tutti gli spazi</option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <ErrorBox message={error} />

      <div className="cal-layout">
        <div className="cal card">
          <div className="cal-head">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="cal-grid">
            {days.map((d) => {
              const list = byDay[d] || [];
              const inMonth = fromISO(d).getMonth() === cursor.m;
              return (
                <button
                  key={d}
                  className={`cal-cell${inMonth ? '' : ' out'}${d === today ? ' today' : ''}${d === selected ? ' selected' : ''}`}
                  onClick={() => setSelected(d)}
                >
                  <span className="cal-num">{+d.slice(8)}</span>
                  <span className="cal-chips">
                    {list.slice(0, 3).map((b) => (
                      <span key={b.id} className="chip" style={{ '--c': spaceById[b.spaceId]?.color || '#64748b' } as CSSProperties}>
                        <i />
                        <em>{b.start}</em> {b.title}
                      </span>
                    ))}
                    {list.length > 3 && <span className="chip more">+{list.length - 3} altre</span>}
                  </span>
                  {list.length > 0 && (
                    <span className="cal-dots">
                      {[...new Set(list.map((b) => spaceById[b.spaceId]?.color || '#64748b'))].slice(0, 4).map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <aside className="day-panel card">
          <div className="day-head">
            <h2>{fmtDateLong(selected)}</h2>
            <button className="btn small" onClick={() => setEditing({ date: selected, spaceId: spaceFilter || spaces[0]?.id, start: '20:30', end: '22:30' })}>
              + Aggiungi
            </button>
          </div>
          {loading ? (
            <p className="muted">Caricamento…</p>
          ) : dayList.length === 0 ? (
            <Empty title="Nessuna prenotazione">Tutti gli spazi sono liberi in questo giorno.</Empty>
          ) : (
            <ul className="day-list">
              {dayList.map((b) => (
                <li key={b.id}>
                  <button className="day-item" onClick={() => setEditing(b)}>
                    <span className="bar" style={{ background: spaceById[b.spaceId]?.color || '#64748b' }} />
                    <span className="day-item-main">
                      <strong>{b.title}</strong>
                      <span className="muted">
                        {spaceById[b.spaceId]?.name || 'Spazio rimosso'}
                        {b.seriesId ? ' · ricorrente' : ''}
                      </span>
                    </span>
                    <span className="day-time">{timeLabel(b)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {editing && <BookingForm initial={editing} spaces={spaces} onClose={() => setEditing(null)} />}
    </>
  );
}

function BookingForm({ initial, spaces, onClose }: { initial: Partial<Booking>; spaces: Space[]; onClose: () => void }) {
  const { email } = useAuth();
  const id = initial.id;
  const [spaceId, setSpaceId] = useState(initial.spaceId ?? spaces[0]?.id ?? '');
  const [date, setDate] = useState(initial.date ?? todayISO());
  const [start, setStart] = useState(initial.start ?? '');
  const [end, setEnd] = useState(initial.end ?? '');
  const [title, setTitle] = useState(initial.title ?? '');
  const [note, setNote] = useState(initial.note ?? '');
  const [repeat, setRepeat] = useState(false);
  const [until, setUntil] = useState(addDays(initial.date ?? todayISO(), 28));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!title.trim()) return setError('Indica chi occupa lo spazio.');
    if (!spaceId || !date) return setError('Scegli spazio e data.');
    if (start && end && end <= start) return setError("L'orario di fine deve essere dopo l'inizio.");
    const dates = [date];
    if (!id && repeat) {
      if (until < date) return setError('La data di fine ripetizione è precedente alla prima data.');
      for (let d = addDays(date, 7); d <= until && dates.length < 60; d = addDays(d, 7)) dates.push(d);
    }
    setBusy(true);
    setError('');
    try {
      // Controllo sovrapposizioni sullo stesso spazio
      const snap = await getDocs(
        query(collection(db, 'bookings'), where('date', '>=', dates[0]), where('date', '<=', dates[dates.length - 1])),
      );
      const clashes = snap.docs
        .map((d) => ({ ...(d.data() as Booking), id: d.id }))
        .filter((b) => b.id !== id && b.spaceId === spaceId && dates.includes(b.date) && overlaps(b, { start, end }));
      if (clashes.length) {
        const list = clashes
          .slice(0, 6)
          .map((b) => `• ${fmtDate(b.date)} ${timeLabel(b)} — ${b.title}`)
          .join('\n');
        const ok = window.confirm(
          `Lo spazio risulta già occupato:\n${list}${clashes.length > 6 ? `\n…e altre ${clashes.length - 6}` : ''}\n\nSalvare comunque?`,
        );
        if (!ok) {
          setBusy(false);
          return;
        }
      }
      const base = { spaceId, start, end, title: title.trim(), note: note.trim() };
      if (id) {
        await updateDoc(doc(db, 'bookings', id), { ...base, date });
      } else if (dates.length === 1) {
        await addDoc(collection(db, 'bookings'), { ...base, date, createdBy: email });
      } else {
        const seriesId = `s_${Date.now().toString(36)}`;
        const batch = writeBatch(db);
        for (const d of dates) batch.set(doc(collection(db, 'bookings')), { ...base, date: d, seriesId, createdBy: email });
        await batch.commit();
      }
      onClose();
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    let wholeSeries = false;
    if (initial.seriesId) {
      wholeSeries = window.confirm(
        'Questa prenotazione è ricorrente.\n\nOK = elimina questa e tutte le successive della serie\nAnnulla = elimina solo questa',
      );
    }
    if (!wholeSeries && !window.confirm(`Eliminare la prenotazione del ${fmtDate(date)}?`)) return;
    setBusy(true);
    try {
      if (wholeSeries) {
        const snap = await getDocs(query(collection(db, 'bookings'), where('seriesId', '==', initial.seriesId)));
        const batch = writeBatch(db);
        snap.docs.filter((d) => (d.data() as Booking).date >= (initial.date || '')).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      } else {
        await deleteDoc(doc(db, 'bookings', id));
      }
      onClose();
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={id ? 'Modifica prenotazione' : 'Nuova prenotazione'}
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
        <Field label="Spazio" full>
          <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Occupato da" full>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Allenamento, Corso yoga, ACR…" autoFocus={!id} />
        </Field>
        <Field label="Data" full>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Dalle">
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Alle">
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label="Note" full>
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {!id && (
          <div className="field full checks">
            <label className="check">
              <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
              Ripeti ogni settimana
            </label>
            {repeat && (
              <label className="inline-field">
                fino al
                <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
              </label>
            )}
          </div>
        )}
      </div>
      <ErrorBox message={error} />
    </Modal>
  );
}
