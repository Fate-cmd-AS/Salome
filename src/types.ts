// Modèle de données de Salomé. Les mêmes formes servent en local (hors ligne)
// et côté serveur (voir supabase/schema.sql).

export type Role = 'owner' | 'manager';
export type PayMethod = 'cash' | 'wave' | 'om' | 'mtn' | 'moov';
export type Geo = { lat: number; lng: number; acc: number } | null;

export interface Business {
  id: string;
  name: string;
  kind: string; // maquis, restaurant, boutique, salon...
  city: string;
  district: string;
  tz: string; // ex. Africa/Abidjan
  zone: { lat: number; lng: number; radiusM: number } | null;
  openingFloat: number; // fond de caisse laissé chaque matin
  settings: {
    cashGapAlert: number; // écart de caisse qui déclenche une alerte (FCFA)
    expenseApprovalAbove: number; // au-delà, la dépense doit être validée
    openHour: number; // heure d'ouverture (heure locale du commerce)
    closeHour: number;
  };
}

export interface Person {
  id: string;
  name: string;
  job: string;
  phone: string;
  role: Role | 'staff';
  pin?: string;
  salary: number; // mensuel
  payMethod: PayMethod;
  restDay?: number; // 0 = dimanche … 6 = samedi
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  trackStock: boolean;
  stock: number; // stock théorique
  lowStock: number;
  unit: string;
  archived?: boolean; // retiré de la vente (jamais effacé : les anciennes ventes y font référence)
}

export interface SaleItem { productId: string | null; name: string; qty: number; price: number }

export interface Sale {
  id: string;
  at: number;
  items: SaleItem[];
  total: number;
  method: PayMethod;
  customerPhone?: string;
  byId: string;
  // Mobile Money : référence de l'opérateur, confirmée par lui (et non par la gérante)
  mmRef?: string;
  mmConfirmed?: boolean;
  receipt?: 'sms' | 'whatsapp' | 'none';
  status: 'ok' | 'cancelled';
  cancelReason?: string;
  cancelledAt?: number;
  check?: { result: 'confirmed' | 'disputed'; at: number; note?: string };
}

export interface Expense {
  id: string;
  at: number;
  label: string;
  category: string;
  amount: number;
  photo?: string; // photo du reçu (dataURL compressée)
  geo: Geo;
  byId: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedAt?: number;
  note?: string;
}

export interface StockMove {
  id: string;
  at: number;
  productId: string;
  kind: 'delivery' | 'loss' | 'inventory';
  qty: number; // variation (+/-) appliquée au stock théorique
  counted?: number; // pour un inventaire : quantité comptée
  expected?: number; // stock théorique au moment de l'inventaire
  note?: string;
  photo?: string;
  byId: string;
}

export interface CashClose {
  id: string;
  day: string; // AAAA-MM-JJ (heure du commerce)
  at: number;
  counted: number;
  expected: number; // calculé par le système, jamais montré à la gérante
  gap: number; // counted - expected
  detail?: Record<string, number>; // billets et pièces
  photo?: string;
  byId: string;
  note?: string;
}

export interface Attendance {
  id: string;
  personId: string;
  day: string;
  inAt: number;
  outAt?: number;
  geo: Geo;
  inZone: boolean | null;
  photo?: string;
  byId: string;
}

export interface Reminder {
  id: string;
  at: number;
  text: string;
  to: string | 'all';
  due?: string;
  ackAt?: number;
  doneAt?: number;
}

export interface Advance { id: string; personId: string; at: number; amount: number; note?: string }

export interface PayLine {
  personId: string;
  base: number;
  absentDays: number;
  deduction: number;
  advances: number;
  bonus: number;
  net: number;
  paidAt?: number;
  method?: PayMethod;
  ref?: string;
}
export interface PayRun { id: string; month: string; lines: PayLine[] }

export interface Invoice {
  id: string;
  number: string;
  kind: 'client' | 'supplier';
  party: string;
  phone?: string;
  lines: { label: string; qty: number; price: number }[];
  total: number;
  issuedAt: number;
  dueAt: number;
  paidAt?: number;
  method?: PayMethod;
  note?: string;
}

export interface LogEntry { id: string; at: number; byId: string; action: string; detail: string }

export interface State {
  version: number;
  business: Business;
  people: Person[];
  products: Product[];
  sales: Sale[];
  expenses: Expense[];
  stockMoves: StockMove[];
  closes: CashClose[];
  attendance: Attendance[];
  reminders: Reminder[];
  advances: Advance[];
  payRuns: PayRun[];
  invoices: Invoice[];
  log: LogEntry[];
  seenAlerts: string[];
  outbox: number; // opérations en attente d'envoi (hors ligne)
  session: { personId: string; role: Role } | null;
  // mode connecté : commerce et compte Supabase de ce téléphone
  cloud?: { businessId: string; userId: string; role: Role; inviteCode?: string };
}

export interface Alert {
  id: string;
  at: number;
  level: 'high' | 'med' | 'low';
  title: string;
  detail: string;
  go?: { tab: string; ref?: string };
}
