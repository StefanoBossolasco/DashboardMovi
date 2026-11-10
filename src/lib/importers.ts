import * as XLSX from 'xlsx';
import { anyToISO, anyToTime, hash, round2 } from './format';
import type { BankTx, Invoice, MovementType } from './types';

type Row = unknown[];

export async function readWorkbook(file: File): Promise<XLSX.WorkBook> {
  return XLSX.read(await file.arrayBuffer(), { type: 'array' });
}

function rows(wb: XLSX.WorkBook, sheet?: string): Row[] {
  const ws = wb.Sheets[sheet ?? wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Row>(ws, { header: 1, raw: true, defval: null });
}

const str = (v: unknown) => (v == null ? '' : String(v).trim());
const num = (v: unknown) =>
  typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.'));

/** Estratto conto (colonne: Data contabile, Valuta, Dare, Avere, Divisa, Causale, Descrizione, Categoria) */
export function parseBank(wb: XLSX.WorkBook): BankTx[] {
  const rs = rows(wb);
  const h = rs.findIndex((r) => r.some((c) => /data contabile/i.test(str(c))));
  if (h < 0) throw new Error('Non trovo la colonna "Data contabile": è il file dell\'estratto conto?');
  const head = rs[h].map((c) => str(c).toLowerCase());
  const col = (name: string) => head.findIndex((x) => x.startsWith(name));
  const cDate = col('data contabile');
  const cDare = col('dare');
  const cAvere = col('avere');
  const cCaus = col('causale');
  const cDesc = col('descrizione');
  const cCat = col('categoria');
  const seen: Record<string, number> = {};
  const out: BankTx[] = [];
  for (const r of rs.slice(h + 1)) {
    const date = anyToISO(r[cDate]);
    const dare = num(r[cDare]);
    const avere = num(r[cAvere]);
    if (!date || (!isFinite(dare) && !isFinite(avere))) continue;
    const amount = round2(isFinite(avere) && avere !== 0 ? Math.abs(avere) : -Math.abs(dare));
    const description = str(r[cDesc]).replace(/\s+/g, ' ');
    const key = `${date}|${amount}|${description}`;
    seen[key] = (seen[key] || 0) + 1;
    out.push({
      id: `b_${hash(key)}_${seen[key]}`,
      date,
      amount,
      causale: str(r[cCaus]),
      description,
      category: cCat >= 0 ? str(r[cCat]) : '',
    });
  }
  return out;
}

/** Export fatture elettroniche (colonne: Cedente / Prestatore, ID SDI, N° doc., Tipo documento, Data documento, Importo) */
export function parseInvoices(wb: XLSX.WorkBook): Invoice[] {
  const rs = rows(wb);
  const h = rs.findIndex((r) => r.some((c) => /cedente/i.test(str(c))));
  if (h < 0) throw new Error('Non trovo la colonna "Cedente / Prestatore": è l\'export delle fatture?');
  const head = rs[h].map((c) => str(c).toLowerCase());
  const col = (re: RegExp) => head.findIndex((x) => re.test(x));
  const cSup = col(/cedente/);
  const cSdi = col(/sdi/);
  const cNum = col(/^n/);
  const cType = col(/tipo/);
  const cDate = col(/data doc/);
  const cAmt = col(/importo/);
  const out: Invoice[] = [];
  for (const r of rs.slice(h + 1)) {
    const supplier = str(r[cSup]);
    const amount = num(r[cAmt]);
    if (!supplier || !isFinite(amount)) continue;
    const sdiId = str(r[cSdi]);
    const number = str(r[cNum]);
    const date = anyToISO(r[cDate]);
    out.push({
      id: `f_${sdiId || hash(`${supplier}|${number}|${date}`)}`,
      supplier,
      sdiId,
      number,
      docType: cType >= 0 ? str(r[cType]) : '',
      date,
      amount: round2(amount),
    });
  }
  return out;
}

export interface ImportedMovement {
  date: string;
  type: MovementType;
  amount: number;
  description: string;
  subgroup: string;
  method: string;
  hasInvoice: boolean;
  paidBy: string;
  compiledBy: string;
  advance: boolean;
  reimbursed: boolean;
  note: string;
}

/** Foglio "Movimenti" del file Entrate/Uscite */
export function parseMovements(
  wb: XLSX.WorkBook,
  sheet: string,
): { items: ImportedMovement[]; warnings: string[] } {
  const rs = rows(wb, sheet);
  const h = rs.findIndex((r) => str(r[0]).toUpperCase() === 'DATA');
  if (h < 0) throw new Error(`Nel foglio "${sheet}" non trovo la riga di intestazione (DATA, TIPO, IMPORTO…).`);
  const items: ImportedMovement[] = [];
  const warnings: string[] = [];
  rs.slice(h + 1).forEach((r, i) => {
    const line = h + 2 + i;
    const description = str(r[3]);
    const rawAmount = r[2];
    if (!description && (rawAmount == null || rawAmount === '')) return;
    const amount = num(rawAmount);
    const date = anyToISO(r[0]);
    const typeRaw = str(r[1]).toLowerCase();
    if (!isFinite(amount)) warnings.push(`Riga ${line}: "${description}" senza importo (importata a 0 €).`);
    if (!date) warnings.push(`Riga ${line}: "${description}" senza data.`);
    if (typeRaw !== 'entrata' && typeRaw !== 'uscita')
      warnings.push(`Riga ${line}: "${description}" senza tipo (importata come uscita).`);
    const reimbursed = r[9] === true;
    items.push({
      date,
      type: typeRaw === 'entrata' ? 'entrata' : 'uscita',
      amount: isFinite(amount) ? round2(Math.abs(amount)) : 0,
      description,
      subgroup: str(r[4]) || 'Altro',
      method: str(r[5]),
      hasInvoice: r[6] === true,
      paidBy: str(r[7]),
      compiledBy: str(r[8]),
      advance: reimbursed,
      reimbursed,
      note: r
        .slice(10)
        .map(str)
        .filter(Boolean)
        .join(' | '),
    });
  });
  return { items, warnings };
}

export interface ImportedBooking {
  spaceName: string;
  date: string;
  start: string;
  end: string;
  title: string;
}

/** Foglio annuale del file "Utilizzo spazi": una riga per giorno, tre colonne per spazio */
export function parseSpaces(wb: XLSX.WorkBook, sheet: string): ImportedBooking[] {
  const rs = rows(wb, sheet);
  const h = rs.findIndex((r) => str(r[1]).toUpperCase() === 'DATA');
  if (h < 0) throw new Error(`Nel foglio "${sheet}" non trovo la riga di intestazione (MESE, DATA, …).`);
  const head = rs[h].map(str);
  const limit = head.findIndex((x) => /MOVI ASD/i.test(x));
  const cols: { c: number; name: string; other: boolean }[] = [];
  head.forEach((x, c) => {
    if (c < 2 || !x || /^ORARIO/i.test(x) || (limit >= 0 && c >= limit)) return;
    cols.push({ c, name: x.replace(/\s+/g, ' '), other: /ALTRI SPAZI/i.test(x) });
  });
  const out: ImportedBooking[] = [];
  let current = '';
  for (const r of rs.slice(h + 1)) {
    if (r.some((c) => /^OCCUPATO DA$/i.test(str(c)))) continue;
    const d = anyToISO(r[1]);
    if (d) current = d;
    if (!current) continue;
    for (const col of cols) {
      const who = str(r[col.c]);
      const off = col.other ? 1 : 0;
      const extra = col.other ? str(r[col.c + 1]) : '';
      const start = anyToTime(r[col.c + 1 + off]);
      const end = anyToTime(r[col.c + 2 + off]);
      if (!who && !extra && !start && !end) continue;
      out.push({
        spaceName: col.name,
        date: current,
        start,
        end,
        title: [who, extra].filter(Boolean).join(' — ') || '(senza nome)',
      });
    }
  }
  return out;
}

const SPACE_KEYWORDS: [RegExp, string][] = [
  [/CALCIO/i, 'campo-calcio'],
  [/BASKET/i, 'campo-basket'],
  [/SPOGL.*1/i, 'spogliatoio-1'],
  [/SPOGL.*2/i, 'spogliatoio-2'],
  [/SOPRA CASA MARRO/i, 'salone-sopra-casa-marro'],
  [/ORATORIO/i, 'salone-oratorio'],
  [/CASA MARRO/i, 'casa-marro'],
  [/BAR/i, 'salone-bar'],
  [/CINEMA/i, 'cinema'],
  [/PLANCE/i, 'plance'],
  [/ALTRI SPAZI/i, 'altri-spazi'],
];

/** Collega l'intestazione di colonna del foglio allo spazio predefinito */
export function spaceIdForHeader(header: string): string | null {
  for (const [re, id] of SPACE_KEYWORDS) if (re.test(header)) return id;
  return null;
}

export interface ImportedParticipant {
  name: string;
  contact: string;
  due: number;
  paid: boolean;
  method: string;
  note: string;
  child: boolean;
}

/**
 * Foglio iscrizioni di un evento (es. "Bagna Cauda"): Numero, Nome, telefono, Adulto/bambino
 * (si/no, costo, pagato), metodo di pagamento a spunta, intolleranze, iscritto da.
 */
export function parseParticipants(
  wb: XLSX.WorkBook,
  sheet: string,
): { title: string; fee: number; items: ImportedParticipant[] } {
  const rs = rows(wb, sheet);
  const h = rs.findIndex((r) => /^numero/i.test(str(r[0])) && /^nome/i.test(str(r[1])));
  if (h < 0) throw new Error(`Nel foglio "${sheet}" non trovo l'intestazione "Numero / Nome".`);
  const find = (re: RegExp, from = h, to = h + 3) => {
    for (let i = from; i < to && i < rs.length; i++) {
      const c = rs[i].findIndex((x) => re.test(str(x)));
      if (c >= 0) return c;
    }
    return -1;
  };
  const sub = rs.slice(h, h + 4).find((r) => r.some((x) => /si\s*\/\s*no/i.test(str(x)))) || [];
  const yesNo = sub.map((x, i) => (/si\s*\/\s*no/i.test(str(x)) ? i : -1)).filter((i) => i >= 0);
  const [cAdult, cChild] = [yesNo[0] ?? -1, yesNo[1] ?? -1];
  const methods: [string, number][] = (
    [
      ['Satispay', find(/^satispay/i)],
      ['Contanti', find(/^contanti/i)],
      ['Carta', find(/^(carta|pos)/i)],
      ['Bonifico', find(/^bonifico/i)],
    ] as [string, number][]
  ).filter(([, c]) => c >= 0);
  const cPhone = find(/telefono/i);
  const cIntol = find(/intolleranz/i);
  const cBy = find(/iscritto da/i);
  const cNote = find(/note/i);
  const yes = (v: unknown) => v === true || /^(si|sì|x|true)$/i.test(str(v));

  const items: ImportedParticipant[] = [];
  for (const r of rs.slice(h + 1)) {
    const name = str(r[1]);
    if (!name || typeof r[0] !== 'number') continue;
    const adult = cAdult >= 0 && yes(r[cAdult]);
    const child = cChild >= 0 && yes(r[cChild]);
    const col = child ? cChild : cAdult;
    const cost = adult || child ? num(r[col + 1]) : 0;
    const paid = (adult && yes(r[cAdult + 2])) || (child && yes(r[cChild + 2]));
    const method = methods.find(([, c]) => yes(r[c]))?.[0] ?? '';
    const intol = cIntol >= 0 ? str(r[cIntol]) : '';
    const by = cBy >= 0 ? str(r[cBy]) : '';
    const extra = cNote >= 0 ? str(r[cNote]) : '';
    const note = [
      child ? 'Bambino' : '',
      !adult && !child ? 'Né adulto né bambino nel foglio: quota da verificare' : '',
      intol && intol !== '❌' ? `Intolleranze: ${intol}` : '',
      by ? `Iscritto da ${by}` : '',
      /^iscritto da/i.test(extra) && by ? '' : extra,
    ]
      .filter(Boolean)
      .join(' · ');
    items.push({
      name,
      contact: cPhone >= 0 ? str(r[cPhone]) : '',
      due: isFinite(cost) ? round2(cost) : 0,
      paid: !!paid,
      method: paid ? method : '',
      note,
      child,
    });
  }
  const firstAdult = rs.slice(h + 1).find((r) => typeof r[0] === 'number' && cAdult >= 0 && isFinite(num(r[cAdult + 1])));
  return {
    title: str(rs[0]?.[0]) || sheet,
    fee: firstAdult ? round2(num(firstAdult[cAdult + 1])) : 0,
    items,
  };
}
