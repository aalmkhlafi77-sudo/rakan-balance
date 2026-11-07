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
    expect(csv, contains('الرصيد الافتتاحي'));
    expect(csv, contains('الرصيد الختامي'));
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
}
