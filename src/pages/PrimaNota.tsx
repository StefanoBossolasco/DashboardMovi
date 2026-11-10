import { useMemo, useState } from 'react';
import { collection, query } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../firebase';
import { useAppConfig } from '../App';
import { useCol } from '../hooks';
import { eur, fmtDate } from '../lib/format';
import { effectiveVoce, voceLabel } from '../lib/modd';
import { METHODS, type Movement } from '../lib/types';
import MovementForm from '../components/MovementForm';
import { Badge, Empty, ErrorBox, PageHead, Stat } from '../components/ui';

export const needsBank = (m: Movement) => m.method !== 'Contanti' && !m.bankTxId && !m.advance;

type StatusFilter = '' | 'nobank' | 'noinvoice' | 'toreimburse' | 'incomplete';

export function useYears(movs: Movement[]): string[] {
  return useMemo(() => {
    const set = new Set<string>([String(new Date().getFullYear())]);
    movs.forEach((m) => m.date && set.add(m.date.slice(0, 4)));
    return [...set].sort().reverse();
  }, [movs]);
}

export default function PrimaNota() {
  const { subgroups } = useAppConfig();
  const { data, loading, error } = useCol<Movement>(() => query(collection(db, 'movements')), []);
  const years = useYears(data);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [text, setText] = useState('');
  const [type, setType] = useState('');
  const [subgroup, setSubgroup] = useState('');
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [editing, setEditing] = useState<Partial<Movement> | null>(null);

  const rows = useMemo(() => {
    const t = text.trim().toLowerCase();
    return data
      .filter((m) => {
        if (year && m.date && m.date.slice(0, 4) !== year) return false;
        if (type && m.type !== type) return false;
        if (subgroup && m.subgroup !== subgroup) return false;
        if (method && m.method !== method) return false;
        if (status === 'nobank' && !needsBank(m)) return false;
        if (status === 'noinvoice' && !(m.hasInvoice && !m.invoiceId)) return false;
        if (status === 'toreimburse' && !(m.advance && !m.reimbursed)) return false;
        if (status === 'incomplete' && m.date && m.amount > 0) return false;
        if (t && !`${m.description} ${m.note} ${m.paidBy} ${m.subgroup}`.toLowerCase().includes(t)) return false;
        return true;
      })
      .sort((a, b) => (b.date || '9999').localeCompare(a.date || '9999') || b.createdAt - a.createdAt);
  }, [data, year, text, type, subgroup, method, status]);

  const entrate = rows.filter((m) => m.type === 'entrata').reduce((s, m) => s + m.amount, 0);
  const uscite = rows.filter((m) => m.type === 'uscita').reduce((s, m) => s + m.amount, 0);
  const subgroupNames = useMemo(
    () => [...new Set([...subgroups.map((s) => s.name), ...data.map((m) => m.subgroup)])].filter(Boolean),
    [subgroups, data],
  );

  const exportXlsx = () => {
    const aoa = [
      ['DATA', 'TIPO', 'IMPORTO', 'DESCRIZIONE', 'SOTTOGRUPPO', 'METODO', 'FATTURA', 'PAGATO/RICEVUTO DA', 'COMPILATO DA', 'ANTICIPATA', 'RIMBORSATA', 'VOCE MOD. D', 'RISCONTRO BANCA', 'NOTE'],
      ...[...rows].reverse().map((m) => [
        fmtDate(m.date),
        m.type === 'entrata' ? 'Entrata' : 'Uscita',
        m.amount,
        m.description,
        m.subgroup,
        m.method,
        m.hasInvoice ? 'Sì' : 'No',
        m.paidBy,
        m.compiledBy,
        m.advance ? 'Sì' : 'No',
        m.reimbursed ? 'Sì' : 'No',
        voceLabel(effectiveVoce(m, subgroups)),
        m.bankTxId ? 'Sì' : m.method === 'Contanti' ? '—' : 'No',
        m.note,
      ]),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Movimenti');
    XLSX.writeFile(wb, `prima-nota-${year || 'tutti'}.xlsx`);
  };

  return (
    <>
      <PageHead title="Prima nota" sub="Entrate e uscite dell'associazione.">
        <button className="btn" onClick={exportXlsx} disabled={!rows.length}>
          Esporta Excel
        </button>
        <button className="btn primary" onClick={() => setEditing({})}>
          + Movimento
        </button>
      </PageHead>

      <div className="stats">
        <Stat label="Entrate" value={eur(entrate)} tone="pos" />
        <Stat label="Uscite" value={eur(uscite)} tone="neg" />
        <Stat label="Saldo" value={eur(entrate - uscite)} />
        <Stat label="Movimenti" value={String(rows.length)} />
      </div>

      <div className="toolbar filters">
        <input className="search" type="search" placeholder="Cerca descrizione, note, persona…" value={text} onChange={(e) => setText(e.target.value)} />
        <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Anno">
          <option value="">Tutti gli anni</option>
          {years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo">
          <option value="">Entrate e uscite</option>
          <option value="entrata">Solo entrate</option>
          <option value="uscita">Solo uscite</option>
        </select>
        <select value={subgroup} onChange={(e) => setSubgroup(e.target.value)} aria-label="Sottogruppo">
          <option value="">Tutti i sottogruppi</option>
          {subgroupNames.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Metodo">
          <option value="">Tutti i metodi</option>
          {METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Stato">
          <option value="">Qualsiasi stato</option>
          <option value="nobank">Senza riscontro in banca</option>
          <option value="noinvoice">Fattura non collegata</option>
          <option value="toreimburse">Da rimborsare</option>
          <option value="incomplete">Da completare (data o importo)</option>
        </select>
      </div>

      <ErrorBox message={error} />

      {loading ? (
        <p className="muted">Caricamento…</p>
      ) : rows.length === 0 ? (
        <Empty title={data.length ? 'Nessun movimento con questi filtri' : 'Nessun movimento'}>
          {data.length ? 'Prova ad allargare la ricerca.' : 'Aggiungi il primo con “+ Movimento” oppure importa lo storico da Impostazioni.'}
        </Empty>
      ) : (
        <div className="card list">
          <div className="mov-row head">
            <span>Data</span>
            <span>Descrizione</span>
            <span className="hide-m">Sottogruppo</span>
            <span className="hide-m">Metodo</span>
            <span className="num">Importo</span>
          </div>
          {rows.map((m) => (
            <MovementRow key={m.id} m={m} onClick={() => setEditing(m)} />
          ))}
        </div>
      )}

      {editing && <MovementForm initial={editing} subgroups={subgroups} onClose={() => setEditing(null)} />}
    </>
  );
}

export function MovementRow({ m, onClick }: { m: Movement; onClick?: () => void }) {
  return (
    <button className="mov-row" onClick={onClick} disabled={!onClick}>
      <span className="mov-date">{m.date ? fmtDate(m.date).slice(0, 5) : '—'}<small>{m.date.slice(0, 4)}</small></span>
      <span className="mov-main">
        <strong>{m.description}</strong>
        <span className="mov-meta">
          <span className="show-m">{m.subgroup} · {m.method || 'metodo n.d.'}</span>
          {m.paidBy && <span>{m.type === 'uscita' ? 'pagato da' : 'da'} {m.paidBy}</span>}
          {m.bankTxId && <Badge tone="ok">Banca ✓</Badge>}
          {m.invoiceId ? <Badge tone="ok">Fattura ✓</Badge> : m.hasInvoice ? <Badge tone="info">Fattura</Badge> : null}
          {m.advance && !m.reimbursed && <Badge tone="warn">Da rimborsare</Badge>}
          {m.advance && m.reimbursed && <Badge>Rimborsata</Badge>}
          {(!m.date || !m.amount) && <Badge tone="bad">Da completare</Badge>}
        </span>
      </span>
      <span className="hide-m">{m.subgroup}</span>
      <span className="hide-m">{m.method || '—'}</span>
      <span className={`num amount ${m.type}`}>
        {m.type === 'uscita' ? '−' : '+'}
        {eur(m.amount)}
      </span>
    </button>
  );
}
