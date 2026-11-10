export type Role = 'admin' | 'collaboratore';

export interface AppUser {
  email: string;
  name: string;
  role: Role;
}

export interface Space {
  id: string;
  name: string;
  color: string;
}

export interface Subgroup {
  name: string;
  /** Voce Mod. D predefinita per le uscite */
  modDU: string;
  /** Voce Mod. D predefinita per le entrate */
  modDE: string;
}

export interface Config {
  spaces: Space[];
  subgroups: Subgroup[];
}

export interface Booking {
  id: string;
  spaceId: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM oppure ''
  end: string;
  title: string;
  note?: string;
  seriesId?: string;
  createdBy?: string;
}

export type MovementType = 'entrata' | 'uscita';

export interface Movement {
  id: string;
  date: string; // YYYY-MM-DD oppure '' se da completare
  type: MovementType;
  amount: number; // sempre positivo
  description: string;
  subgroup: string;
  method: string;
  hasInvoice: boolean;
  paidBy: string;
  compiledBy: string;
  /** Anticipato da un privato: va rimborsato */
  advance: boolean;
  reimbursed: boolean;
  note: string;
  /** Voce Mod. D scelta a mano (altrimenti vale quella del sottogruppo) */
  modD?: string;
  eventId?: string;
  bankTxId?: string;
  invoiceId?: string;
  createdBy: string;
  createdAt: number;
}

export interface BankTx {
  id: string;
  date: string;
  amount: number; // positivo = accredito, negativo = addebito
  causale: string;
  description: string;
  category: string;
  ignored?: boolean;
}

export interface Invoice {
  id: string;
  supplier: string;
  sdiId: string;
  number: string;
  docType: string;
  date: string;
  amount: number;
}

export interface EventDoc {
  id: string;
  name: string;
  date: string;
  fee: number;
  subgroup: string;
  collaborators: string[];
  note: string;
}

export interface Participant {
  id: string;
  name: string;
  contact: string;
  due: number;
  paid: boolean;
  method: string;
  paidAt: string;
  note: string;
  /** Movimento di prima nota in cui l'incasso e' stato registrato */
  movementId?: string;
  createdAt: number;
}

export const METHODS = ['Contanti', 'Carta', 'Bonifico', 'Satispay', 'Assegno', 'Altro'];
export const PARTICIPANT_METHODS = ['Satispay', 'Carta', 'Contanti'];
