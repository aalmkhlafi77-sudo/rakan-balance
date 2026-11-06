import type { AccountModel, DueItemContract, EntryType, PaymentAllocationContract, ReminderContract, TransactionModel } from './types.ts';
import { MAX_SAFE_MINOR_AMOUNT } from './money.ts';

const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date + 'T00:00:00Z'))
  && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;

export function validateDueRecord(due: DueItemContract, accounts: AccountModel[], transactions: TransactionModel[]): void {
  if (!due.id || !accounts.some(a => a.id === due.accountId)) throw new Error('حساب الاستحقاق غير موجود.');
  if (!['owedByAccount', 'owedToAccount'].includes(due.entryType)) throw new Error('نوع الاستحقاق غير صالح.');
  if (!validDate(due.dueDate)) throw new Error('تاريخ الاستحقاق غير صالح.');
  if (!Number.isSafeInteger(due.originalAmountMinor) || due.originalAmountMinor <= 0 || due.originalAmountMinor > MAX_SAFE_MINOR_AMOUNT) throw new Error('مبلغ الاستحقاق غير صالح.');
  if (!Number.isSafeInteger(due.settledAmountMinor) || due.settledAmountMinor < 0 || due.settledAmountMinor > due.originalAmountMinor) throw new Error('قيمة سداد الاستحقاق غير صالحة.');
  if (due.sourceTransactionId && !transactions.some(t => t.id === due.sourceTransactionId && t.accountId === due.accountId && t.entryType === due.entryType)) throw new Error('الحركة الأصلية للاستحقاق غير متطابقة.');
}

export function dueRemaining(due: DueItemContract): number {
  return due.originalAmountMinor - due.settledAmountMinor;
}

export function dueDisplayStatus(due: DueItemContract, today: string): 'pending' | 'partially_settled' | 'settled' | 'overdue' {
  if (dueRemaining(due) === 0) return 'settled';
  if (due.dueDate < today) return 'overdue';
  if (due.settledAmountMinor > 0) return 'partially_settled';
  return 'pending';
}

export function validateDueLedger(dues: DueItemContract[], allocations: PaymentAllocationContract[], reminders: ReminderContract[], accounts: AccountModel[], transactions: TransactionModel[]): void {
  const accountMap = new Map(accounts.map(a => [a.id, a]));
  const txMap = new Map(transactions.map(t => [t.id, t]));
  const dueIds = new Set<string>();
  const allocatedByDue = new Map<string, number>();
  const allocatedByPayment = new Map<string, number>();
  const allocationIds = new Set<string>();
  const reminderIds = new Set<string>();
  for (const due of dues) {
    if (dueIds.has(due.id)) throw new Error('معرف استحقاق مكرر.');
    dueIds.add(due.id);
    validateDueRecord(due, accounts, transactions);
  }
  for (const a of allocations) {
    if (!a.id || allocationIds.has(a.id)) throw new Error('معرف تخصيص سداد مكرر أو مفقود.');
    allocationIds.add(a.id);
    const due = dues.find(d => d.id === a.dueItemId);
    const tx = txMap.get(a.paymentTransactionId);
    if (!due || !tx) throw new Error('تخصيص سداد مرتبط باستحقاق أو حركة مفقودة.');
    if (tx.transferId || tx.accountId !== due.accountId || tx.entryType === due.entryType) throw new Error('حركة السداد لا تطابق حساب أو اتجاه الاستحقاق.');
    if (!Number.isSafeInteger(a.amountMinor) || a.amountMinor <= 0 || a.amountMinor > MAX_SAFE_MINOR_AMOUNT) throw new Error('مبلغ تخصيص غير صالح.');
    allocatedByDue.set(due.id, (allocatedByDue.get(due.id) || 0) + a.amountMinor);
    allocatedByPayment.set(tx.id, (allocatedByPayment.get(tx.id) || 0) + a.amountMinor);
  }
  for (const due of dues) {
    if (allocatedByDue.get(due.id) !== undefined && allocatedByDue.get(due.id) !== due.settledAmountMinor) throw new Error('مجموع التخصيصات لا يطابق المدفوع من الاستحقاق.');
    if (allocatedByDue.get(due.id) === undefined && due.settledAmountMinor !== 0) throw new Error('استحقاق مسدد دون تخصيصات.');
  }
  for (const [txId, amount] of allocatedByPayment) if (amount > txMap.get(txId)!.amountMinor) throw new Error('تخصيصات السداد تتجاوز قيمة الحركة المالية.');
  for (const reminder of reminders) {
    if (!reminder.id || reminderIds.has(reminder.id)) throw new Error('معرف تذكير مكرر أو مفقود.');
    reminderIds.add(reminder.id);
    if (!dueIds.has(reminder.dueItemId) || !validDate(reminder.remindAt) || !reminder.templateText.trim() || typeof reminder.isCompleted !== 'boolean' || (reminder.channel && reminder.channel !== 'manual')) throw new Error('تذكير غير صالح.');
  }
}
