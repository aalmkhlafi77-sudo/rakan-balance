import 'package:flutter_test/flutter_test.dart';
import 'package:rakan_balance_mobile/domain/financial/account_statement_csv.dart';
import 'package:rakan_balance_mobile/domain/models/account_model.dart';
import 'package:rakan_balance_mobile/domain/models/transaction_model.dart';

void main() {
  test('statement uses exact halalas, chronological running totals and isolates accounts', () {
    final account = AccountModel(
      id: 'acc1', name: 'اختبار', categoryId: 'cat',
      openingBalanceMinor: 10000, notes: 'PRIVATE_ACCOUNT_NOTE',
      createdAt: '', updatedAt: '');
    TransactionModel tx(String id, String acc, String day, EntryType type,
        int amount, String description) => TransactionModel(
      id: id, accountId: acc, entryType: type, amountMinor: amount,
      date: day, description: description, notes: 'PRIVATE_TX_NOTE',
      attachmentIds: const [], createdAt: day, updatedAt: day);
    final csv = AccountStatementCsv.build(account: account, transactions: [
      tx('later', 'acc1', '2026-11-03', EntryType.owedToAccount, 2501, 'سداد'),
      tx('other', 'acc2', '2026-11-02', EntryType.owedByAccount, 8000, 'NOT_THIS_ACCOUNT'),
      tx('first', 'acc1', '2026-11-02', EntryType.owedByAccount, 5002, 'فاتورة'),
    ]);
    expect(csv.startsWith('\uFEFF'), true);
    expect(csv, contains('رصيد أول الفترة'));
    expect(csv, contains('رصيد آخر الفترة'));
    expect(csv, contains('12501,125.01'));
    expect(csv, contains('15002,150.02'));
    expect(csv.indexOf('فاتورة'), lessThan(csv.indexOf('سداد')));
    expect(csv, isNot(contains('PRIVATE_ACCOUNT_NOTE')));
    expect(csv, isNot(contains('PRIVATE_TX_NOTE')));
    expect(csv, isNot(contains('NOT_THIS_ACCOUNT')));
    expect(csv, isNot(contains('acc2')));
  });

  test('CSV escapes comma, quotes and line breaks and prevents formula injection', () {
    final account = AccountModel(
      id: 'account', name: '=SUM(A1:A2)', categoryId: 'c',
      openingBalanceMinor: -1, createdAt: '', updatedAt: '');
    final tx = TransactionModel(
      id: '1', accountId: 'account', entryType: EntryType.owedByAccount,
      amountMinor: 2, date: '2026-11-01',
      description: '+CMD,"quoted"\nline', attachmentIds: const [],
      createdAt: '', updatedAt: '');
    final csv = AccountStatementCsv.build(account: account, transactions: [tx]);
    expect(csv, contains('"\t=SUM(A1:A2)"'));
    expect(csv, contains('"+CMD,""quoted""\nline"'.replaceFirst('"+', '"\t+')));
    expect(csv, contains('-1,-0.01'));
    expect(csv, contains('1,0.01'));
  });

  test('period statement carries prior movements into opening balance and filters rows', () {
    final account = AccountModel(
      id: 'acc', name: 'فترة', categoryId: 'c',
      openingBalanceMinor: 20000, createdAt: '', updatedAt: '');
    TransactionModel tx(String id, String date, EntryType type, int amount) =>
        TransactionModel(
          id: id, accountId: 'acc', entryType: type, amountMinor: amount,
          date: date, description: id, attachmentIds: const [],
          createdAt: date, updatedAt: date);
    final csv = AccountStatementCsv.build(
      account: account,
      transactions: [
        tx('before-1', '2026-11-01', EntryType.owedByAccount, 15000),
        tx('before-2', '2026-11-02', EntryType.owedToAccount, 8000),
        tx('inside', '2026-11-04', EntryType.owedToAccount, 30000),
        tx('after', '2026-11-05', EntryType.owedByAccount, 999),
      ],
      fromDate: '2026-11-04',
      toDate: '2026-11-04',
    );
    expect(csv, contains('27000,270.00'));
    expect(csv, contains('-3000,-30.00'));
    expect(csv, contains('inside'));
    expect(csv, isNot(contains('before-1')));
    expect(csv, isNot(contains('before-2')));
    expect(csv, isNot(contains('after')));
    expect(csv, contains('0,30000'));
  });

  test('statement rejects invalid or inverted date ranges', () {
    final account = AccountModel(
      id: 'acc', name: 'فترة', categoryId: 'c',
      openingBalanceMinor: 0, createdAt: '', updatedAt: '');
    expect(() => AccountStatementCsv.build(
      account: account, transactions: const [],
      fromDate: '2026-02-30'), throwsArgumentError);
    expect(() => AccountStatementCsv.build(
      account: account, transactions: const [],
      fromDate: '2026-12-01', toDate: '2026-11-01'), throwsArgumentError);
  });


  test('transfer rows include the counterparty context used by the web statement', () {
    final source = AccountModel(
      id: 'src', name: 'المصدر', categoryId: 'c',
      openingBalanceMinor: 5000, createdAt: '', updatedAt: '');
    final destination = AccountModel(
      id: 'dst', name: 'الوجهة', categoryId: 'c',
      openingBalanceMinor: 0, createdAt: '', updatedAt: '');
    final transfer = TransactionModel(
      id: 't1', accountId: 'src', entryType: EntryType.owedToAccount,
      amountMinor: 1000, date: '2026-11-07', description: 'نقل',
      attachmentIds: const [], transferId: 'tr-1',
      transferRole: TransferRole.source, counterpartyAccountId: 'dst',
      createdAt: '', updatedAt: '');
    final csv = AccountStatementCsv.build(
      account: source,
      accounts: [source, destination],
      transactions: [transfer],
    );
    expect(csv, contains('نقل مديونية إلى: الوجهة'));
  });

}
