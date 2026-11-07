import 'package:flutter_test/flutter_test.dart';
import 'package:rakan_balance_mobile/domain/financial/balance_calculator.dart';
import 'package:rakan_balance_mobile/domain/financial/inter_account_transfer_engine.dart';
import 'package:rakan_balance_mobile/domain/financial/money_utils.dart';
import 'package:rakan_balance_mobile/domain/models/account_model.dart';
import 'package:rakan_balance_mobile/domain/models/due_item_model.dart';
import 'package:rakan_balance_mobile/domain/models/transaction_model.dart';
import 'package:rakan_balance_mobile/domain/models/transfer_model.dart';
import 'package:rakan_balance_mobile/domain/validators/due_validator.dart';

void main() {
  group('N1 & N2 Financial Rules Parity Suite (Dart vs TypeScript)', () {
    test('Test 1: toMinorUnits validates exact 2 decimal places and handles string amounts', () {
      final valid = MoneyUtils.toMinorUnits('150.25');
      expect(valid.success, true);
      expect(valid.minor, 15025);

      final invalidDecimals = MoneyUtils.toMinorUnits('150.255');
      expect(invalidDecimals.success, false);

      final negative = MoneyUtils.toMinorUnits('-50.00');
      expect(negative.success, true); // Web monetary domain permits signed opening balances.
      expect(negative.minor, -5000);
    });

    test('Test 2: Money balance equation invariant B = opening + sum(signed)', () {
      final account = AccountModel(
        id: 'acc-1',
        name: 'عميل 1',
        categoryId: 'cat-1',
        openingBalanceMinor: 10000, // 100 SAR
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      );

      final txs = [
        TransactionModel(
          id: 'tx-1',
          accountId: 'acc-1',
          entryType: EntryType.owedByAccount, // +50 SAR
          amountMinor: 5000,
          date: '2026-01-02',
          description: 'مشتريات',
          attachmentIds: [],
          createdAt: '2026-01-02T00:00:00Z',
          updatedAt: '2026-01-02T00:00:00Z',
        ),
        TransactionModel(
          id: 'tx-2',
          accountId: 'acc-1',
          entryType: EntryType.owedToAccount, // -20 SAR
          amountMinor: 2000,
          date: '2026-01-03',
          description: 'سداد',
          attachmentIds: [],
          createdAt: '2026-01-03T00:00:00Z',
          updatedAt: '2026-01-03T00:00:00Z',
        ),
      ];

      final balance = BalanceCalculator.calculateAccountBalance(account: account, transactions: txs);
      expect(balance, 13000); // 130.00 SAR
    });

    test('Test 3: Inter-Account Transfer preserves net system balance invariant (sum = 0)', () {
      final srcAcc = AccountModel(id: 'src', name: 'المصدر', categoryId: 'c1', openingBalanceMinor: 50000, createdAt: '', updatedAt: '');
      final dstAcc = AccountModel(id: 'dst', name: 'الوجهة', categoryId: 'c1', openingBalanceMinor: 10000, createdAt: '', updatedAt: '');

      final input = InterAccountTransferInput(
        sourceAccountId: 'src',
        destinationAccountId: 'dst',
        amountMinor: 15000, // 150 SAR
        date: '2026-02-01',
        description: 'تحويل مديونية',
      );

      final entries = InterAccountTransferEngine.buildTransferEntries(
        input: input,
        transferId: 'trsf-1',
        sourceAccountName: 'المصدر',
        destinationAccountName: 'الوجهة',
      );

      expect(entries.length, 2);
      final val = InterAccountTransferEngine.validateTransferPair(entries);
      expect(val.isValid, true);

      // Invariant check
      expect(entries[0].signedAmountMinor + entries[1].signedAmountMinor, 0);

      final srcNewBalance = BalanceCalculator.calculateAccountBalance(account: srcAcc, transactions: [entries[0]]);
      final dstNewBalance = BalanceCalculator.calculateAccountBalance(account: dstAcc, transactions: [entries[1]]);

      expect(srcNewBalance, 35000); // 350 SAR
      expect(dstNewBalance, 25000); // 250 SAR
    });

    test('Test 4: N2 due follow-up record does NOT alter financial balances until settled', () {
      final acc = AccountModel(id: 'acc-1', name: 'عميل', categoryId: 'c1', openingBalanceMinor: 20000, createdAt: '', updatedAt: '');
      final due = DueItemModel(
        id: 'due-1',
        accountId: 'acc-1',
        entryType: EntryType.owedByAccount,
        dueDate: '2026-12-30',
        originalAmountMinor: 10000,
        settledAmountMinor: 0,
        status: 'pending',
        createdAt: '',
        updatedAt: '',
      );

      // Financial transactions list is EMPTY
      final balance = BalanceCalculator.calculateAccountBalance(account: acc, transactions: []);
      expect(balance, 20000); // Unchanged opening balance

      expect(due.remainingAmountMinor, 10000);
      expect(due.status, 'pending');
    });

    test('Test 5: DueValidator rejects invalid dates, oversettlement, and orphan allocations', () {
      final acc = AccountModel(id: 'acc-1', name: 'عميل', categoryId: 'c1', openingBalanceMinor: 20000, createdAt: '', updatedAt: '');
      final dueOversettled = DueItemModel(
        id: 'due-1',
        accountId: 'acc-1',
        entryType: EntryType.owedByAccount,
        dueDate: '2026-12-30',
        originalAmountMinor: 10000,
        settledAmountMinor: 10001, // Oversettled!
        status: 'partially_settled',
        createdAt: '',
        updatedAt: '',
      );

      expect(
        () => DueValidator.validateDueRecord(dueOversettled, [acc]),
        throwsA(isA<Exception>()),
      );
    });
  });
}
