import { useMemo, useRef, useState } from 'react';
import { collection, deleteField, doc, query, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAppConfig } from '../App';
import { describeError, useCol } from '../hooks';
import { daysBetween, eur, fmtDate, round2 } from '../lib/format';
import { parseBank, parseInvoices, readWorkbook } from '../lib/importers';
import type { BankTx, Invoice, Movement } from '../lib/types';
import MovementForm from '../components/MovementForm';
import { Badge, Empty, ErrorBox, Modal, PageHead, Stat } from '../components/ui';

type TxStatus = 'open' | 'partial' | 'matched' | 'ignored';

/** Quanto del movimento bancario e' coperto dai movimenti di prima nota collegati */
function coverage(tx: BankTx, linked: Movement[]) {
  const dir = tx.amount >= 0 ? 'entrata' : 'uscita';
  const sum = linked.reduce((s, m) => s + (m.type === dir ? m.amount : -m.amount), 0);
  const remaining = round2(Math.abs(tx.amount) - sum);
  const status: TxStatus = tx.ignored ? 'ignored' : Math.abs(remaining) < 0.005 ? 'matched' : linked.length ? 'partial' : 'open';
  return { dir, remaining, status } as const;
}

const shortDesc = (s: string) =>
  s
    .replace(/BONIFICO A VOSTRO FAVORE /i, '')
    .replace(/Bonifico - SEPA istantaneo /i, '')
    .replace(/ (Data Regolamento|BONIFICO DISPOSTO IN|Cod\.Id\.Ord):.*$/i, '')
    .trim();

async function commitChunks<T>(items: T[], apply: (batch: ReturnType<typeof writeBatch>, item: T) => void) {
  for (let i = 0; i < items.length; i += 400) {
    const batch = writeBatch(db);
    items.slice(i, i + 400).forEach((it) => apply(batch, it));
    await batch.commit();
  }
}

export default function Riconciliazione() {
  const [tab, setTab] = useState<'bank' | 'inv'>('bank');
  const movs = useCol<Movement>(() => query(collection(db, 'movements')), []);
  const bank = useCol<BankTx>(() => query(collection(db, 'bankTx')), []);
  const invs = useCol<Invoice>(() => query(collection(db, 'invoices')), []);
  const [filter, setFilter] = useState<'todo' | 'all' | 'done'>('todo');
  const [openTx, setOpenTx] = useState<string | null>(null);
  const [openInv, setOpenInv] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const byTx = useMemo(() => {
    const map: Record<string, Movement[]> = {};
    movs.data.forEach((m) => m.bankTxId && (map[m.bankTxId] ||= []).push(m));
    return map;
  }, [movs.data]);
  const byInv = useMemo(() => {
    const map: Record<string, Movement[]> = {};
    movs.data.forEach((m) => m.invoiceId && (map[m.invoiceId] ||= []).push(m));
    return map;
  }, [movs.data]);

  const txRows = useMemo(
    () =>
      bank.data
        .map((tx) => ({ tx, ...coverage(tx, byTx[tx.id] || []) }))
        .sort((a, b) => b.tx.date.localeCompare(a.tx.date)),
    [bank.data, byTx],
  );
  const invRows = useMemo(
    () => invs.data.map((inv) => ({ inv, linked: byInv[inv.id] || [] })).sort((a, b) => b.inv.date.localeCompare(a.inv.date)),
    [invs.data, byInv],
  );

  const txTodo = txRows.filter((r) => r.status === 'open' || r.status === 'partial');
  const invTodo = invRows.filter((r) => !r.linked.length);
  const shownTx = filter === 'todo' ? txTodo : filter === 'done' ? txRows.filter((r) => r.status === 'matched' || r.status === 'ignored') : txRows;
  const shownInv = filter === 'todo' ? invTodo : filter === 'done' ? invRows.filter((r) => r.linked.length) : invRows;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const wb = await readWorkbook(file);
      if (tab === 'bank') {
        const items = parseBank(wb);
        const known = new Set(bank.data.map((b) => b.id));
        await commitChunks(items, (batch, it) => batch.set(doc(db, 'bankTx', it.id), it, { merge: true }));
        setMsg(`Estratto conto letto: ${items.length} righe, ${items.filter((i) => !known.has(i.id)).length} nuove.`);
      } else {
        const items = parseInvoices(wb);
        const known = new Set(invs.data.map((b) => b.id));
        await commitChunks(items, (batch, it) => batch.set(doc(db, 'invoices', it.id), it, { merge: true }));
        setMsg(`Fatture lette: ${items.length}, ${items.filter((i) => !known.has(i.id)).length} nuove.`);
      }
    } catch (e) {
      setErr(describeError(e));
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  /** Abbina da solo i casi senza ambiguita': stesso importo, date vicine, un solo candidato */
  const autoMatch = async () => {
    setBusy(true);
    setErr('');
    const used = new Set<string>();
    const links: { m: Movement; field: 'bankTxId' | 'invoiceId'; id: string }[] = [];
    if (tab === 'bank') {
      for (const r of txTodo.filter((r) => r.status === 'open')) {
        const c = movs.data.filter(
          (m) => !m.bankTxId && !used.has(m.id) && m.method !== 'Contanti' && m.type === r.dir &&
            Math.abs(m.amount - Math.abs(r.tx.amount)) < 0.005 && daysBetween(m.date, r.tx.date) <= 7,
        );
        if (c.length === 1) {
          used.add(c[0].id);
          links.push({ m: c[0], field: 'bankTxId', id: r.tx.id });
        }
      }
    } else {
      for (const r of invTodo) {
        const c = movs.data.filter(
          (m) => !m.invoiceId && !used.has(m.id) && m.type === 'uscita' &&
            Math.abs(m.amount - r.inv.amount) < 0.005 && daysBetween(m.date, r.inv.date) <= 45,
        );
        if (c.length === 1) {
          used.add(c[0].id);
          links.push({ m: c[0], field: 'invoiceId', id: r.inv.id });
        }
      }
    }
    try {
      await commitChunks(links, (batch, l) =>
        batch.update(doc(db, 'movements', l.m.id), l.field === 'invoiceId' ? { invoiceId: l.id, hasInvoice: true } : { bankTxId: l.id }),
      );
      setMsg(links.length ? `Abbinati automaticamente ${links.length} movimenti.` : 'Nessun abbinamento certo trovato: procedi a mano.');
    } catch (e) {
      setErr(describeError(e));
    }
    setBusy(false);
  };

  const currentTx = txRows.find((r) => r.tx.id === openTx);
  const currentInv = invRows.find((r) => r.inv.id === openInv);
  const loading = movs.loading || bank.loading || invs.loading;

  return (
    <>
      <PageHead title="Riconciliazione" sub="Fai combaciare prima nota, estratto conto e fatture.">
        <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <button className="btn" onClick={autoMatch} disabled={busy || loading}>
          Abbina automaticamente
        </button>
        <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={busy}>
          {tab === 'bank' ? 'Carica estratto conto' : 'Carica export fatture'}
        </button>
      </PageHead>

      <div className="tabs">
        <button className={tab === 'bank' ? 'on' : ''} onClick={() => setTab('bank')}>
          Estratto conto {txTodo.length > 0 && <span className="count">{txTodo.length}</span>}
        </button>
        <button className={tab === 'inv' ? 'on' : ''} onClick={() => setTab('inv')}>
          Fatture {invTodo.length > 0 && <span className="count">{invTodo.length}</span>}
        </button>
      </div>

      <div className="stats">
        {tab === 'bank' ? (
          <>
            <Stat label="Da abbinare" value={String(txTodo.length)} />
            <Stat label="Abbinati" value={String(txRows.filter((r) => r.status === 'matched').length)} />
            <Stat label="Prima nota senza riscontro" value={String(movs.data.filter((m) => m.method !== 'Contanti' && !m.bankTxId && !m.advance).length)} />
          </>
        ) : (
          <>
            <Stat label="Fatture da collegare" value={String(invTodo.length)} />
            <Stat label="Collegate" value={String(invRows.length - invTodo.length)} />
          </>
        )}
      </div>

      <div className="toolbar">
        <div className="segmented small">
          {(['todo', 'done', 'all'] as const).map((f) => (
            <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {f === 'todo' ? 'Da fare' : f === 'done' ? 'Fatti' : 'Tutti'}
            </button>
          ))}
        </div>
      </div>

      {msg && <div className="notice ok">{msg}</div>}
      <ErrorBox message={err || movs.error || bank.error || invs.error} />

      {loading ? (
        <p className="muted">Caricamento…</p>
      ) : tab === 'bank' ? (
        shownTx.length === 0 ? (
          <Empty title={bank.data.length ? 'Niente da mostrare' : 'Nessun estratto conto caricato'}>
            {bank.data.length ? 'Tutte le righe di questo elenco sono a posto.' : 'Scarica l\'estratto conto dalla banca in formato Excel e caricalo qui: le righe già presenti non vengono duplicate.'}
          </Empty>
        ) : (
          <div className="card list">
            {shownTx.map(({ tx, status, remaining }) => (
              <button key={tx.id} className="mov-row" onClick={() => setOpenTx(tx.id)}>
                <span className="mov-date">{fmtDate(tx.date).slice(0, 5)}<small>{tx.date.slice(0, 4)}</small></span>
                <span className="mov-main">
                  <strong>{shortDesc(tx.description)}</strong>
                  <span className="mov-meta">
                    {status === 'matched' && <Badge tone="ok">Abbinato</Badge>}
                    {status === 'partial' && <Badge tone="warn">Parziale · residuo {eur(remaining)}</Badge>}
                    {status === 'open' && <Badge tone="bad">Da abbinare</Badge>}
                    {status === 'ignored' && <Badge>Non è un movimento</Badge>}
                  </span>
                </span>
                <span className={`num amount ${tx.amount >= 0 ? 'entrata' : 'uscita'}`}>{tx.amount >= 0 ? '+' : '−'}{eur(Math.abs(tx.amount))}</span>
              </button>
            ))}
          </div>
        )
      ) : shownInv.length === 0 ? (
        <Empty title={invs.data.length ? 'Niente da mostrare' : 'Nessuna fattura caricata'}>
          {invs.data.length ? 'Tutte le fatture di questo elenco sono a posto.' : 'Carica l\'export Excel delle fatture elettroniche ricevute.'}
        </Empty>
      ) : (
        <div className="card list">
          {shownInv.map(({ inv, linked }) => (
            <button key={inv.id} className="mov-row" onClick={() => setOpenInv(inv.id)}>
              <span className="mov-date">{fmtDate(inv.date).slice(0, 5)}<small>{inv.date.slice(0, 4)}</small></span>
              <span className="mov-main">
                <strong>{inv.supplier}</strong>
                <span className="mov-meta">
                  <span>n. {inv.number}</span>
                  {linked.length ? <Badge tone="ok">Collegata</Badge> : <Badge tone="bad">Da collegare</Badge>}
                </span>
              </span>
              <span className="num amount">{eur(inv.amount)}</span>
            </button>
          ))}
        </div>
      )}

      {currentTx && (
        <MatchModal
          key={currentTx.tx.id}
          kind="bank"
          title={`${currentTx.tx.amount >= 0 ? 'Accredito' : 'Addebito'} del ${fmtDate(currentTx.tx.date)}`}
          description={currentTx.tx.description}
          amount={Math.abs(currentTx.tx.amount)}
          date={currentTx.tx.date}
          dir={currentTx.dir}
          refId={currentTx.tx.id}
          linked={byTx[currentTx.tx.id] || []}
          remaining={currentTx.remaining}
          ignored={!!currentTx.tx.ignored}
          movements={movs.data}
          suggestion={shortDesc(currentTx.tx.description)}
          onClose={() => setOpenTx(null)}
        />
      )}
      {currentInv && (
        <MatchModal
          key={currentInv.inv.id}
          kind="inv"
          title={`Fattura ${currentInv.inv.supplier}`}
          description={`N. ${currentInv.inv.number} del ${fmtDate(currentInv.inv.date)} · ID SDI ${currentInv.inv.sdiId}`}
          amount={currentInv.inv.amount}
          date={currentInv.inv.date}
          dir="uscita"
          refId={currentInv.inv.id}
          linked={currentInv.linked}
          remaining={round2(currentInv.inv.amount - currentInv.linked.reduce((s, m) => s + m.amount, 0))}
          ignored={false}
          movements={movs.data}
          suggestion={`${currentInv.inv.supplier} — fatt. ${currentInv.inv.number}`}
          onClose={() => setOpenInv(null)}
        />
      )}
    </>
  );
}

interface MatchProps {
  kind: 'bank' | 'inv';
  title: string;
  description: string;
  amount: number;
  date: string;
  dir: 'entrata' | 'uscita';
  refId: string;
  linked: Movement[];
  remaining: number;
  ignored: boolean;
  movements: Movement[];
  suggestion: string;
  onClose: () => void;
}

function MatchModal(p: MatchProps) {
  const { subgroups } = useAppConfig();
  const field = p.kind === 'bank' ? 'bankTxId' : 'invoiceId';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const candidates = useMemo(() => {
    const t = text.trim().toLowerCase();
    return p.movements
      .filter((m) => !m[field])
      .filter((m) => (p.kind === 'bank' ? m.method !== 'Contanti' || m.advance : m.type === 'uscita'))
      .filter((m) => !t || `${m.description} ${m.note} ${m.paidBy} ${m.subgroup} ${m.amount}`.toLowerCase().includes(t))
      .map((m) => ({
        m,
        exact: Math.abs(m.amount - p.amount) < 0.005 && m.type === p.dir,
        days: daysBetween(m.date, p.date),
      }))
      .sort((a, b) => Number(b.exact) - Number(a.exact) || Number(b.m.type === p.dir) - Number(a.m.type === p.dir) || a.days - b.days)
      .slice(0, t ? 60 : 25);
  }, [p.movements, p.amount, p.date, p.dir, p.kind, field, text]);

  const selSum = p.movements.filter((m) => selected.has(m.id)).reduce((s, m) => s + (m.type === p.dir ? m.amount : -m.amount), 0);
  const after = round2(p.remaining - selSum);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(describeError(e));
    }
    setBusy(false);
  };

  const link = () =>
    run(async () => {
      const batch = writeBatch(db);
      selected.forEach((id) =>
        batch.update(doc(db, 'movements', id), p.kind === 'inv' ? { invoiceId: p.refId, hasInvoice: true } : { bankTxId: p.refId }),
      );
      await batch.commit();
      setSelected(new Set());
    });
  const unlink = (m: Movement) => run(() => updateDoc(doc(db, 'movements', m.id), { [field]: deleteField() }));
  const toggleIgnore = () => run(() => updateDoc(doc(db, 'bankTx', p.refId), { ignored: !p.ignored }));

  if (creating) {
    return (
      <MovementForm
        title="Nuovo movimento da questa riga"
        subgroups={subgroups}
        initial={{
          type: p.dir,
          date: p.date,
          amount: p.remaining > 0 ? p.remaining : p.amount,
          description: p.suggestion.slice(0, 80),
          method: 'Bonifico',
          hasInvoice: p.kind === 'inv',
          note: p.kind === 'bank' ? p.description : '',
        }}
        extra={{ [field]: p.refId }}
        onClose={() => setCreating(false)}
      />
    );
  }

  const done = Math.abs(p.remaining) < 0.005;

  return (
    <Modal
      wide
      title={p.title}
      onClose={p.onClose}
      footer={
        <>
          {p.kind === 'bank' && (
            <button className="btn ghost" onClick={toggleIgnore} disabled={busy}>
              {p.ignored ? 'Riporta tra quelli da abbinare' : 'Non è un movimento (giroconto, versamento…)'}
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={() => setCreating(true)} disabled={busy}>
            + Crea movimento{p.linked.length && !done ? ' per il residuo' : ''}
          </button>
          <button className="btn primary" onClick={link} disabled={busy || selected.size === 0}>
            Abbina {selected.size || ''}
          </button>
        </>
      }
    >
      <div className="match-head">
        <div>
          <p className="match-desc">{p.description}</p>
        </div>
        <div className="match-amount">
          <strong className={`amount ${p.kind === 'bank' ? p.dir : ''}`}>{eur(p.amount)}</strong>
          {done ? <Badge tone="ok">Coperto</Badge> : <Badge tone={p.linked.length ? 'warn' : 'bad'}>Residuo {eur(p.remaining)}</Badge>}
        </div>
      </div>

      {p.linked.length > 0 && (
        <>
          <h3 className="section-title">Movimenti collegati</h3>
          <ul className="pick-list">
            {p.linked.map((m) => (
              <li key={m.id} className="pick linked">
                <span className="pick-main">
                  <strong>{m.description}</strong>
                  <span className="muted">{fmtDate(m.date)} · {m.subgroup} · {m.method}</span>
                </span>
                <span className={`amount ${m.type}`}>{eur(m.amount)}</span>
                <button className="btn small ghost" onClick={() => unlink(m)} disabled={busy}>
                  Scollega
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="section-title">Movimenti di prima nota da collegare</h3>
      <input className="search" type="search" placeholder="Cerca per descrizione o importo…" value={text} onChange={(e) => setText(e.target.value)} />
      {candidates.length === 0 ? (
        <p className="muted pad-v">Nessun movimento libero in prima nota. Puoi crearlo direttamente da questa riga.</p>
      ) : (
        <ul className="pick-list">
          {candidates.map(({ m, exact, days }) => (
            <li key={m.id}>
              <label className={`pick${selected.has(m.id) ? ' on' : ''}`}>
                <input
                  type="checkbox"
                  checked={selected.has(m.id)}
                  onChange={() =>
                    setSelected((s) => {
                      const n = new Set(s);
                      if (n.has(m.id)) n.delete(m.id);
                      else n.add(m.id);
                      return n;
                    })
                  }
                />
                <span className="pick-main">
                  <strong>{m.description}</strong>
                  <span className="muted">
                    {fmtDate(m.date)} · {m.subgroup} · {m.method || 'metodo n.d.'}
                    {m.advance ? ' · anticipata' : ''}
                  </span>
                </span>
                {exact && <Badge tone="ok">{days <= 7 ? 'Stesso importo, data vicina' : 'Stesso importo'}</Badge>}
                <span className={`amount ${m.type}`}>{m.type === 'uscita' ? '−' : '+'}{eur(m.amount)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {selected.size > 0 && (
        <p className="sel-summary">
          Selezionati {selected.size} · totale {eur(selSum)} · residuo dopo l'abbinamento <strong>{eur(after)}</strong>
        </p>
      )}
      <ErrorBox message={error} />
    </Modal>
  );
}
