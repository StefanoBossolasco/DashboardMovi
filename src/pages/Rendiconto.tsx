import { useMemo, useState } from 'react';
import { collection, query } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../firebase';
import { useAppConfig } from '../App';
import { useCol } from '../hooks';
import { eur, round2 } from '../lib/format';
import { SECTIONS, VOCI, modDTotals, sectionTotal } from '../lib/modd';
import type { Movement } from '../lib/types';
import { Empty, ErrorBox, PageHead, Stat } from '../components/ui';
import { useYears } from './PrimaNota';

interface Agg {
  name: string;
  entrate: number;
  uscite: number;
}

function aggregate(movs: Movement[], key: (m: Movement) => string, order: string[]): Agg[] {
  const map = new Map<string, Agg>();
  for (const m of movs) {
    const k = key(m) || 'Non indicato';
    const a = map.get(k) || { name: k, entrate: 0, uscite: 0 };
    if (m.type === 'entrata') a.entrate += m.amount;
    else a.uscite += m.amount;
    map.set(k, a);
  }
  return [...map.values()].sort((a, b) => {
    const ia = order.indexOf(a.name);
    const ib = order.indexOf(b.name);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.name.localeCompare(b.name);
  });
}

export default function Rendiconto() {
  const { subgroups } = useAppConfig();
  const { data, loading, error } = useCol<Movement>(() => query(collection(db, 'movements')), []);
  const years = useYears(data);
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const movs = useMemo(() => data.filter((m) => m.date.slice(0, 4) === year), [data, year]);
  const undated = data.filter((m) => !m.date).length;
  const bySub = useMemo(() => aggregate(movs, (m) => m.subgroup, subgroups.map((s) => s.name)), [movs, subgroups]);
  const byMethod = useMemo(() => aggregate(movs, (m) => m.method, ['Contanti', 'Carta', 'Bonifico', 'Satispay']), [movs]);
  const tot = useMemo(() => modDTotals(movs, subgroups), [movs, subgroups]);

  const entrate = movs.filter((m) => m.type === 'entrata').reduce((s, m) => s + m.amount, 0);
  const uscite = movs.filter((m) => m.type === 'uscita').reduce((s, m) => s + m.amount, 0);

  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    const modD: (string | number)[][] = [['Mod. D - RENDICONTO PER CASSA'], [], ['USCITE', Number(year), 'ENTRATE', Number(year)]];
    for (const s of SECTIONS) {
      modD.push([], [s.U, '', s.E, '']);
      const us = VOCI.filter((v) => v.side === 'U' && v.section === s.id);
      const es = VOCI.filter((v) => v.side === 'E' && v.section === s.id);
      for (let i = 0; i < Math.max(us.length, es.length); i++) {
        modD.push([
          us[i]?.label ?? '',
          us[i] ? round2(tot[us[i].code] || 0) : '',
          es[i]?.label ?? '',
          es[i] ? round2(tot[es[i].code] || 0) : '',
        ]);
      }
      const tu = round2(sectionTotal(tot, 'U', s.id));
      const te = round2(sectionTotal(tot, 'E', s.id));
      modD.push(['Totale', tu, 'Totale', te], ['', '', `${s.saldo} (+/-)`, round2(te - tu)]);
    }
    modD.push([], ['Totale USCITE', round2(uscite), 'Totale ENTRATE', round2(entrate)], ['', '', 'Avanzo/Disavanzo complessivo (+/-)', round2(entrate - uscite)]);
    const ws = XLSX.utils.aoa_to_sheet(modD);
    ws['!cols'] = [{ wch: 62 }, { wch: 14 }, { wch: 62 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Mod. D');
    const table = (rows: Agg[], first: string) => [
      [first, 'ENTRATE', 'USCITE', 'NETTO'],
      ...rows.map((r) => [r.name, round2(r.entrate), round2(r.uscite), round2(r.entrate - r.uscite)]),
      ['Totale', round2(entrate), round2(uscite), round2(entrate - uscite)],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(table(bySub, 'SOTTOGRUPPO')), 'Per sottogruppo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(table(byMethod, 'METODO')), 'Per metodo');
    XLSX.writeFile(wb, `rendiconto-${year}.xlsx`);
  };

  return (
    <>
      <PageHead title="Rendiconto" sub="Totali per tipologia e rendiconto per cassa (Mod. D).">
        <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Anno">
          {years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
        <button className="btn" onClick={exportXlsx} disabled={!movs.length}>
          Esporta Excel
        </button>
      </PageHead>

      <ErrorBox message={error} />
      {undated > 0 && (
        <div className="notice">
          {undated} moviment{undated === 1 ? 'o è' : 'i sono'} senza data e non rientra{undated === 1 ? '' : 'no'} nel rendiconto:
          completal{undated === 1 ? 'o' : 'i'} da Prima nota (filtro “Da completare”).
        </div>
      )}

      {loading ? (
        <p className="muted">Caricamento…</p>
      ) : movs.length === 0 ? (
        <Empty title={`Nessun movimento nel ${year}`} />
      ) : (
        <>
          <div className="stats">
            <Stat label="Entrate" value={eur(entrate)} tone="pos" />
            <Stat label="Uscite" value={eur(uscite)} tone="neg" />
            <Stat label="Avanzo / disavanzo" value={eur(entrate - uscite)} />
          </div>

          <div className="two-col">
            <AggTable title="Per sottogruppo" rows={bySub} />
            <AggTable title="Per metodo di pagamento" rows={byMethod} />
          </div>

          <section className="card pad">
            <h2>Rendiconto per cassa — Mod. D</h2>
            <p className="muted small">
              Ogni movimento finisce nella voce predefinita del suo sottogruppo (modificabile in Impostazioni) o in quella
              scelta a mano sul singolo movimento.
            </p>
            {SECTIONS.map((s) => {
              const tu = sectionTotal(tot, 'U', s.id);
              const te = sectionTotal(tot, 'E', s.id);
              return (
                <div className="modd-section" key={s.id}>
                  <div className="modd-cols">
                    <ModDSide title={s.U} side="U" section={s.id} tot={tot} total={tu} />
                    <ModDSide title={s.E} side="E" section={s.id} tot={tot} total={te} />
                  </div>
                  <div className="modd-saldo">
                    <span>{s.saldo}</span>
                    <strong>{eur(te - tu)}</strong>
                  </div>
                </div>
              );
            })}
          </section>
        </>
      )}
    </>
  );
}

function ModDSide({ title, side, section, tot, total }: { title: string; side: 'U' | 'E'; section: string; tot: Record<string, number>; total: number }) {
  return (
    <div>
      <h3>{title}</h3>
      <table className="table compact">
        <tbody>
          {VOCI.filter((v) => v.side === side && v.section === section).map((v) => (
            <tr key={v.code} className={`${v.parent ? 'sub' : ''}${tot[v.code] ? '' : ' zero'}`}>
              <td>{v.label}</td>
              <td className="num">{eur(tot[v.code] || 0)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Totale</td>
            <td className="num">{eur(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function AggTable({ title, rows }: { title: string; rows: Agg[] }) {
  return (
    <section className="card pad">
      <h2>{title}</h2>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th />
              <th className="num">Entrate</th>
              <th className="num">Uscite</th>
              <th className="num">Netto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="num">{eur(r.entrate)}</td>
                <td className="num">{eur(r.uscite)}</td>
                <td className={`num ${r.entrate - r.uscite < 0 ? 'neg' : ''}`}>{eur(r.entrate - r.uscite)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
