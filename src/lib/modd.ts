import type { Config, Movement, Subgroup } from './types';

/** Voci del Mod. D - Rendiconto per cassa (ETS / APS) */
export interface Voce {
  code: string;
  side: 'U' | 'E';
  section: string;
  label: string;
  parent?: string;
}

export const SECTIONS: { id: string; U: string; E: string; saldo: string }[] = [
  {
    id: 'A',
    U: 'A) Uscite da attività di interesse generale',
    E: 'A) Entrate da attività di interesse generale',
    saldo: 'Avanzo/Disavanzo attività di interesse generale',
  },
  {
    id: 'B',
    U: 'B) Uscite da attività diverse',
    E: 'B) Entrate da attività diverse',
    saldo: 'Avanzo/Disavanzo attività diverse',
  },
  {
    id: 'C',
    U: 'C) Uscite da attività di raccolta fondi',
    E: 'C) Entrate da attività di raccolta fondi',
    saldo: 'Avanzo/Disavanzo attività di raccolta fondi',
  },
  {
    id: 'D',
    U: 'D) Uscite da attività finanziarie e patrimoniali',
    E: 'D) Entrate da attività finanziarie e patrimoniali',
    saldo: 'Avanzo/Disavanzo attività finanziarie e patrimoniali',
  },
  {
    id: 'E',
    U: 'E) Uscite di supporto generale',
    E: 'E) Entrate di supporto generale',
    saldo: 'Avanzo/Disavanzo supporto generale',
  },
  {
    id: 'I',
    U: 'Uscite da investimenti in immobilizzazioni o da deflussi di capitale di terzi',
    E: 'Entrate da disinvestimenti in immobilizzazioni o da flussi di capitale di terzi',
    saldo: 'Avanzo/Disavanzo da investimenti, disinvestimenti e finanziamenti',
  },
];

const u = (section: string, n: string, label: string, parent?: string): Voce => ({
  code: `U-${section}${n}`,
  side: 'U',
  section,
  label,
  parent: parent ? `U-${section}${parent}` : undefined,
});
const e = (section: string, n: string, label: string, parent?: string): Voce => ({
  code: `E-${section}${n}`,
  side: 'E',
  section,
  label,
  parent: parent ? `E-${section}${parent}` : undefined,
});

export const VOCI: Voce[] = [
  u('A', '1', '1) Materie prime, sussidiarie, di consumo e di merci'),
  u('A', '1.1', '1.1 Quote adesione ACLI APS (provinciale, regionale, nazionale)', '1'),
  u('A', '2', '2) Servizi'),
  u('A', '3', '3) Godimento di beni di terzi'),
  u('A', '4', '4) Personale dipendente'),
  u('A', '5', '5) Uscite diverse di gestione'),
  u('A', '5.1', '5.1 Rimborsi a volontari per spese documentate', '5'),
  u('A', '5.2', '5.2 Diritti SIAE', '5'),
  u('A', '5.3', '5.3 Uscite per canone RAI / Audiovisivi', '5'),
  u('A', '5.4', '5.4 Altre uscite diverse di gestione', '5'),
  u('B', '1', '1) Materie prime, sussidiarie, di consumo e di merci'),
  u('B', '2', '2) Servizi'),
  u('B', '3', '3) Godimento di beni di terzi'),
  u('B', '4', '4) Personale'),
  u('B', '5', '5) Uscite diverse di gestione'),
  u('C', '1', '1) Uscite per raccolte fondi abituali'),
  u('C', '2', '2) Uscite per raccolte fondi occasionali'),
  u('C', '3', '3) Altre uscite'),
  u('D', '1', '1) Su rapporti bancari'),
  u('D', '2', '2) Su investimenti finanziari'),
  u('D', '3', '3) Su patrimonio edilizio'),
  u('D', '4', '4) Su altri beni patrimoniali'),
  u('D', '5', '5) Altre uscite'),
  u('E', '1', '1) Materie prime, sussidiarie, di consumo e di merci'),
  u('E', '2', '2) Servizi'),
  u('E', '3', '3) Godimento di beni di terzi'),
  u('E', '4', '4) Personale'),
  u('E', '5', '5) Altre uscite'),
  u('I', '1', '1) Investimenti in immobilizzazioni inerenti alle attività di interesse generale'),
  u('I', '2', '2) Investimenti in immobilizzazioni inerenti alle attività diverse'),
  u('I', '3', '3) Investimenti in attività finanziarie e patrimoniali'),
  u('I', '4', '4) Rimborso di finanziamenti per quota capitale e di prestiti'),

  e('A', '1', '1) Entrate da quote associative e apporti dei fondatori'),
  e('A', '2', '2) Entrate dagli associati per attività mutualistiche'),
  e('A', '2.1', '2.1 Entrate da soci', '2'),
  e('A', '2.2', '2.2 Entrate da rete ACLI APS', '2'),
  e('A', '3', '3) Entrate per prestazioni e cessioni ad associati e fondatori'),
  e('A', '4', '4) Erogazioni liberali'),
  e('A', '5', '5) Entrate del 5 per mille'),
  e('A', '6', '6) Contributi da soggetti privati'),
  e('A', '7', '7) Entrate per prestazioni e cessioni a terzi'),
  e('A', '8', '8) Contributi da enti pubblici'),
  e('A', '9', '9) Entrate da contratti con enti pubblici'),
  e('A', '10', '10) Altre entrate (tra cui somministrazione di alimenti e bevande ai soci)'),
  e('B', '1', '1) Entrate per prestazioni e cessioni ad associati e fondatori'),
  e('B', '2', '2) Contributi da soggetti privati'),
  e('B', '3', '3) Entrate per prestazioni e cessioni a terzi'),
  e('B', '4', '4) Contributi da enti pubblici'),
  e('B', '5', '5) Entrate da contratti con enti pubblici'),
  e('B', '6', '6) Altre entrate'),
  e('C', '1', '1) Entrate da raccolte fondi abituali'),
  e('C', '2', '2) Entrate da raccolte fondi occasionali'),
  e('C', '3', '3) Altre entrate'),
  e('D', '1', '1) Da rapporti bancari'),
  e('D', '2', '2) Da altri investimenti finanziari'),
  e('D', '3', '3) Da patrimonio edilizio'),
  e('D', '4', '4) Da altri beni patrimoniali'),
  e('D', '5', '5) Altre entrate'),
  e('E', '1', '1) Entrate da distacco del personale'),
  e('E', '2', '2) Altre entrate di supporto generale'),
  e('I', '1', '1) Disinvestimenti in immobilizzazioni inerenti alle attività di interesse generale'),
  e('I', '2', '2) Disinvestimenti in immobilizzazioni inerenti alle attività diverse'),
  e('I', '3', '3) Disinvestimenti in attività finanziarie e patrimoniali'),
  e('I', '4', '4) Ricevimento di finanziamenti e di prestiti'),
];

export const VOCE_BY_CODE: Record<string, Voce> = Object.fromEntries(VOCI.map((v) => [v.code, v]));

export const FALLBACK_U = 'U-A5.4';
export const FALLBACK_E = 'E-A10';

export function voceLabel(code: string): string {
  const v = VOCE_BY_CODE[code];
  if (!v) return code;
  return `${v.section === 'I' ? 'Inv.' : v.section} · ${v.label}`;
}

export function effectiveVoce(m: Pick<Movement, 'type' | 'modD' | 'subgroup'>, subgroups: Subgroup[]): string {
  if (m.modD && VOCE_BY_CODE[m.modD]) return m.modD;
  const sg = subgroups.find((s) => s.name === m.subgroup);
  const code = m.type === 'uscita' ? sg?.modDU : sg?.modDE;
  if (code && VOCE_BY_CODE[code]) return code;
  return m.type === 'uscita' ? FALLBACK_U : FALLBACK_E;
}

/** Totali per voce: le voci "padre" includono le sotto-voci (es. 5 include 5.1-5.4) */
export function modDTotals(movs: Movement[], subgroups: Subgroup[]): Record<string, number> {
  const tot: Record<string, number> = {};
  for (const m of movs) {
    const code = effectiveVoce(m, subgroups);
    tot[code] = (tot[code] || 0) + m.amount;
    const parent = VOCE_BY_CODE[code]?.parent;
    if (parent) tot[parent] = (tot[parent] || 0) + m.amount;
  }
  return tot;
}

export function sectionTotal(tot: Record<string, number>, side: 'U' | 'E', section: string): number {
  return VOCI.filter((v) => v.side === side && v.section === section && !v.parent).reduce(
    (s, v) => s + (tot[v.code] || 0),
    0,
  );
}

const sg = (name: string, modDU = 'U-A1', modDE = 'E-A3'): Subgroup => ({ name, modDU, modDE });

export const DEFAULT_CONFIG: Config = {
  spaces: [
    { id: 'campo-calcio', name: 'Campo calcio', color: '#15803d' },
    { id: 'campo-basket', name: 'Campo basket', color: '#ea580c' },
    { id: 'spogliatoio-1', name: 'Spogliatoio 1', color: '#0891b2' },
    { id: 'spogliatoio-2', name: 'Spogliatoio 2', color: '#0e7490' },
    { id: 'casa-marro', name: 'Casa Marro', color: '#b91c1c' },
    { id: 'salone-oratorio', name: 'Salone primo piano oratorio', color: '#7c3aed' },
    { id: 'salone-sopra-casa-marro', name: 'Salone sopra Casa Marro', color: '#c026d3' },
    { id: 'salone-bar', name: 'Salone bar', color: '#ca8a04' },
    { id: 'cinema', name: 'Cinema', color: '#1d4ed8' },
    { id: 'plance', name: 'Plance (affitto/prestito)', color: '#57534e' },
    { id: 'altri-spazi', name: 'Altri spazi', color: '#64748b' },
  ],
  subgroups: [
    sg('Generale', 'U-A5.4', 'E-A10'),
    sg('Struttura', 'U-A2', 'E-A10'),
    sg('Biliardo'),
    sg('Torneo dei cantoni'),
    sg('Sport vari'),
    sg('Tessere', 'U-A1.1', 'E-A1'),
    sg('Cena al buio'),
    sg('Cena bagna cauda'),
    sg('Corso cucina adulti'),
    sg('Corso cucina bambini'),
    sg('Corso ceramica'),
    sg('Corso cucito'),
    sg('Corso yoga'),
    sg('Corso balli occitani'),
    sg('Corso formaggi'),
    sg('Club del libro'),
    sg('Donazioni', 'U-A5.4', 'E-A4'),
    sg('Altro', 'U-A5.4', 'E-A10'),
  ],
};
