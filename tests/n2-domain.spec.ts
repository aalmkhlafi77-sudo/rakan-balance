import { expect, test } from '@playwright/test';
import { dueDisplayStatus, dueRemaining, validateDueLedger, validateDueRecord } from '../src/domain/dues.ts';
import type { AccountModel, DueItemContract, PaymentAllocationContract, ReminderContract, TransactionModel } from '../src/domain/types.ts';

const account: AccountModel = {
  id: 'acc-1', name: 'اختبار', parentId: null, categoryId: 'cat-1',
  openingBalanceMinor: 20000, status: 'active',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};
const due: DueItemContract = {
  id: 'due-1', accountId: account.id, dueDate: '2026-12-30',
  entryType: 'owedByAccount', originalAmountMinor: 20000,
  settledAmountMinor: 5000, status: 'partially_settled',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};
const payment: TransactionModel = {
  id: 'payment-1', accountId: account.id, entryType: 'owedToAccount',
  amountMinor: 5000, date: '2026-02-01', description: 'سداد جزئي',
  attachmentIds: [], createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z',
};
const allocation: PaymentAllocationContract = {
  id: 'allocation-1', dueItemId: due.id, paymentTransactionId: payment.id, amountMinor: 5000,
};
const reminder: ReminderContract = {
  id: 'rem-1', dueItemId: due.id, remindAt: '2026-12-20',
  templateText: 'تذكير يدوي', isCompleted: false, channel: 'manual',
};

test('N2 domain: linked payment is one movement, due balance is follow-up only', () => {
  expect(() => validateDueLedger([due], [allocation], [reminder], [account], [payment])).not.toThrow();
  expect(dueRemaining(due)).toBe(15000);
  expect(dueDisplayStatus(due, '2026-11-07')).toBe('partially_settled');
  expect(dueDisplayStatus(due, '2026-12-31')).toBe('overdue');
  expect(dueDisplayStatus({ ...due, settledAmountMinor: due.originalAmountMinor }, '2027-01-01')).toBe('settled');
});

test('N2 domain: reject oversettlement, duplication, orphan and wrong-sign allocations', () => {
  expect(() => validateDueRecord({ ...due, settledAmountMinor: 20001 }, [account], [payment])).toThrow();
  expect(() => validateDueLedger([due], [allocation, { ...allocation, id: 'allocation-2' }], [], [account], [payment])).toThrow();
  expect(() => validateDueLedger([due], [allocation], [], [account], [{ ...payment, entryType: 'owedByAccount' }])).toThrow();
  expect(() => validateDueLedger([due], [{ ...allocation, paymentTransactionId: 'absent' }], [], [account], [payment])).toThrow();
  expect(() => validateDueLedger([due], [allocation], [{ ...reminder, dueItemId: 'absent' }], [account], [payment])).toThrow();
  expect(() => validateDueRecord({ ...due, dueDate: '2026-02-30' }, [account], [payment])).toThrow();
});
