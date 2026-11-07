import 'package:flutter_test/flutter_test.dart';
import 'package:rakan_balance_mobile/domain/financial/account_statement_pdf.dart';
import 'package:rakan_balance_mobile/domain/models/account_model.dart';
import 'package:rakan_balance_mobile/domain/models/transaction_model.dart';

void main() {
  test('PDF data uses exact period balances and excludes private notes', () {
    final account = AccountModel(
      id: 'acc/pdf',
      name: 'طرف اختبار',
      categoryId: 'c',
      openingBalanceMinor: 20000,
      notes: 'PRIVATE_ACCOUNT_NOTE',
      createdAt: '',
      updatedAt: '',
    );

    TransactionModel tx(
      String id,
      String date,
      EntryType type,
      int amount,
      String description,
    ) =>
        TransactionModel(
          id: id,
          accountId: account.id,
          entryType: type,
          amountMinor: amount,
          date: date,
          description: description,
          notes: 'PRIVATE_TX_NOTE',
          attachmentIds: const [],
          createdAt: date,
          updatedAt: date,
        );

    final data = AccountStatementPdf.buildData(
      account: account,
      accounts: [account],
      transactions: [
        tx('before-1', '2026-11-01', EntryType.owedByAccount, 15000, 'قبل 1'),
        tx('before-2', '2026-11-02', EntryType.owedToAccount, 8000, 'قبل 2'),
        tx('inside', '2026-11-04', EntryType.owedToAccount, 30000, 'داخل الفترة'),
        tx('after', '2026-11-05', EntryType.owedByAccount, 999, 'بعد الفترة'),
      ],
      fromDate: '2026-11-04',
      toDate: '2026-11-04',
    );

    expect(data.openingBalanceMinor, 27000);
    expect(data.totalOwedByMinor, 0);
    expect(data.totalOwedToMinor, 30000);
    expect(data.closingBalanceMinor, -3000);
    expect(data.rows, hasLength(1));
    expect(data.rows.single.description, 'داخل الفترة');
    expect(data.rows.single.runningBalanceMinor, -3000);

    final serialized = [
      data.accountName,
      ...data.rows.map((row) => row.description),
    ].join('|');
    expect(serialized, isNot(contains('PRIVATE_ACCOUNT_NOTE')));
    expect(serialized, isNot(contains('PRIVATE_TX_NOTE')));
    expect(serialized, isNot(contains('قبل 1')));
    expect(serialized, isNot(contains('بعد الفترة')));
  });

  test('PDF data includes transfer counterparty context', () {
    final source = AccountModel(
      id: 'src',
      name: 'المصدر',
      categoryId: 'c',
      openingBalanceMinor: 5000,
      createdAt: '',
      updatedAt: '',
    );
    final destination = AccountModel(
      id: 'dst',
      name: 'الوجهة',
      categoryId: 'c',
      openingBalanceMinor: 0,
      createdAt: '',
      updatedAt: '',
    );
    final transfer = TransactionModel(
      id: 't1',
      accountId: source.id,
      entryType: EntryType.owedToAccount,
      amountMinor: 1000,
      date: '2026-11-07',
      description: 'نقل',
      attachmentIds: const [],
      transferId: 'tr-1',
      transferRole: TransferRole.source,
      counterpartyAccountId: destination.id,
      createdAt: '',
      updatedAt: '',
    );

    final data = AccountStatementPdf.buildData(
      account: source,
      accounts: [source, destination],
      transactions: [transfer],
    );

    expect(data.rows.single.description, contains('نقل مديونية إلى: الوجهة'));
    expect(data.closingBalanceMinor, 4000);
  });

  test('PDF filename is stable and strips unsafe account-id characters', () {
    final account = AccountModel(
      id: 'person/42:private',
      name: 'اختبار',
      categoryId: 'c',
      openingBalanceMinor: 0,
      createdAt: '',
      updatedAt: '',
    );

    expect(
      AccountStatementPdf.fileName(
        account: account,
        fromDate: '2026-11-01',
        toDate: '2026-11-30',
      ),
      'rakan_statement_person_42_private_2026-11-01_2026-11-30.pdf',
    );
  });
}
