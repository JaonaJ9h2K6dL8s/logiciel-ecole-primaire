import { api } from './api';

/** Types et helpers partagés du module financier (étape 11). Montants : ariary entiers. */

export const FEE_CATEGORIES = [
  'registration', 'tuition', 'exam', 'supplies', 'transport', 'canteen', 'other',
] as const;
export type FeeCategory = (typeof FEE_CATEGORIES)[number];

export const FEE_CATEGORY_LABELS: Record<FeeCategory, string> = {
  registration: "Frais d'inscription",
  tuition: 'Écolage mensuel',
  exam: "Frais d'examen",
  supplies: 'Fournitures scolaires',
  transport: 'Transport scolaire',
  canteen: 'Cantine',
  other: 'Autres frais',
};

export const FEE_FREQUENCIES = ['once', 'monthly', 'quarterly', 'annual', 'custom'] as const;
export type FeeFrequency = (typeof FEE_FREQUENCIES)[number];

export const FEE_FREQUENCY_LABELS: Record<FeeFrequency, string> = {
  once: 'Unique',
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  annual: 'Annuel',
  custom: 'Personnalisé',
};

export const PAYMENT_METHODS = [
  'cash', 'mvola', 'orange_money', 'airtel_money', 'bank_transfer', 'cheque', 'other',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  mvola: 'Mvola',
  orange_money: 'Orange Money',
  airtel_money: 'Airtel Money',
  bank_transfer: 'Virement',
  cheque: 'Chèque',
  other: 'Autre',
};

export const FEE_STATUS_LABELS: Record<string, string> = {
  pending: 'Non payé',
  partial: 'Partiel',
  paid: 'Payé',
  cancelled: 'Annulé',
};

/** Formatage ariary : « 1 250 000 Ar » — aucun calcul, affichage seul. */
export function formatAr(amount: number | string | null | undefined): string {
  const v = typeof amount === 'string' ? Number(amount) : amount;
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${v.toLocaleString('fr-FR')} Ar`;
}

export interface SchoolYear {
  id: number;
  label: string;
  isActive: boolean;
}

export interface ClassRow {
  id: number;
  name: string;
  levelName: string;
  schoolYearId: number;
}

export interface Tariff {
  id: number;
  school_year_id: number;
  level_id: number | null;
  class_id: number | null;
  fee_category: FeeCategory;
  name: string;
  amount: string;
  frequency: FeeFrequency;
  applies_from: string | null;
  applies_to: string | null;
  is_active: number;
  description: string | null;
  created_at: string;
  yearLabel: string;
  levelName: string | null;
  className: string | null;
}

export interface StudentFee {
  id: number;
  student_id: number;
  school_year_id: number;
  class_id: number | null;
  tariff_id: number | null;
  fee_category: FeeCategory;
  name: string;
  amount: string;
  due_date: string | null;
  status: 'pending' | 'partial' | 'paid' | 'cancelled';
  paid_amount: string;
  batch_id: string | null;
  notes: string | null;
  created_at: string;
  matricule: string;
  lastName: string;
  firstName: string;
  className: string | null;
  yearLabel: string;
}

export interface Payment {
  id: number;
  student_fee_id: number;
  student_id: number;
  amount: string;
  method: PaymentMethod;
  reference: string | null;
  payer_name: string | null;
  comment: string | null;
  status: 'confirmed' | 'cancelled';
  recorded_at: string;
  cancelled_at: string | null;
  matricule: string;
  last_name: string;
  first_names: string;
  feeName: string;
  className: string | null;
  recordedByName: string;
  receiptNumber: string | null;
}

export interface CancelRequest {
  id: number;
  payment_id: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  approved_at: string | null;
  rejection_reason: string | null;
  replacement_payment_id: number | null;
  requestedByName: string;
  approvedByName: string | null;
  amount: string;
  method: PaymentMethod;
  recorded_at: string;
  matricule: string;
  last_name: string;
  first_names: string;
}

export interface Receipt {
  id: number;
  payment_id: number;
  receipt_number: string;
  school_name: string;
  student_name: string;
  matricule: string;
  class_name: string | null;
  year_label: string;
  fee_name: string;
  payer_name: string | null;
  amount: string;
  amount_in_words: string;
  method: PaymentMethod;
  reference: string | null;
  balance_after: string;
  agent_name: string;
  issued_at: string;
  reprint_count: number;
  last_reprint_at: string | null;
  paymentStatus: 'confirmed' | 'cancelled';
  paymentComment: string | null;
}

export interface FinanceDashboard {
  year: number;
  billed: number;
  collected: number;
  outstanding: number;
  todayCollected: number;
  monthCollected: number;
  overdueCount: number;
  methods: { method: PaymentMethod; total: number; count: number }[];
  arrearsByClass: { className: string; balance: number; feeCount: number }[];
  evolution: { ym: string; total: number }[];
}

export interface ArrearRow {
  id: number;
  student_id: number;
  matricule: string;
  last_name: string;
  first_names: string;
  feeName: string;
  fee_category: FeeCategory;
  amount: string;
  paid_amount: string;
  status: 'pending' | 'partial';
  due_date: string | null;
  balance: string;
  className: string | null;
  isOverdue: number;
  guardianPhone: string | null;
}

/** Clé d'idempotence locale (anti double-soumission). */
export function newIdempotencyKey(): string {
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Années + classes accessibles pour les formulaires financiers (finance.view). */
export async function loadFormOptions(schoolYearId?: number) {
  const qs = schoolYearId ? `?schoolYearId=${schoolYearId}` : '';
  const res = await api.get<{ data: { years: SchoolYear[]; classes: ClassRow[] } }>(`/finance/form-options${qs}`);
  return res.data;
}
