import 'package:flutter_test/flutter_test.dart';
import 'package:rakan_balance_mobile/domain/financial/analytics_report.dart';
import 'package:rakan_balance_mobile/domain/financial/balance_calculator.dart';
import 'package:rakan_balance_mobile/domain/models/account_model.dart';
import 'package:rakan_balance_mobile/domain/models/transaction_model.dart';

AccountModel account({
  required String id,
  required String name,
  required String categoryId,
  required int opening,
  String status = 'active',
}) =>
    AccountModel(
      id: id,
      name: name,
      categoryId: categoryId,
      openingBalanceMinor: opening,
      status: status,
      createdAt: '',
      updatedAt: '',
    );

TransactionModel tx({
  required String id,
  required String accountId,
  required EntryType type,
  required int amount,
  required String date,
}) =>
    TransactionModel(
      id: id,
      accountId: accountId,
      entryType: type,
      amountMinor: amount,
      date: date,
      description: 'حركة $id',
      attachmentIds: const [],
      createdAt: '${date}T00:00:00Z',
      updatedAt: '${date}T00:00:00Z',
    );

void main() {
  test('current analytics exactly match the core balance calculator', () {
    final accounts = [
      account(
        id: 'a',
        name: 'أ',
        categoryId: 'c1',
        opening: 10000,
      ),
      account(
        id: 'b',
        name: 'ب',
        categoryId: 'c2',
        opening: -5000,
      ),
      account(
        id: 'archived',
        name: 'مؤرشف',
        categoryId: 'c1',
        opening: 99900,
        status: 'archived',
      ),
    ];
    final transactions = [
      tx(
        id: 'aug',
        accountId: 'a',
        type: EntryType.owedToAccount,
        amount: 1000,
        date: '2026-08-20',
      ),
      tx(
        id: 'sep-a',
        accountId: 'a',
        type: EntryType.owedByAccount,
        amount: 5000,
        date: '2026-09-10',
      ),
      tx(
        id: 'sep-b',
        accountId: 'b',
        type: EntryType.owedToAccount,
        amount: 2000,
        date: '2026-09-15',
      ),
      tx(
        id: 'oct-a',
        accountId: 'a',
        type: EntryType.owedToAccount,
        amount: 3000,
        date: '2026-10-05',
      ),
      tx(
        id: 'oct-b',
        accountId: 'b',
        type: EntryType.owedByAccount,
        amount: 1000,
        date: '2026-10-20',
      ),
      tx(
        id: 'nov-a',
        accountId: 'a',
        type: EntryType.owedByAccount,
        amount: 4000,
        date: '2026-11-01',
      ),
      tx(
        id: 'nov-b',
        accountId: 'b',
        type: EntryType.owedByAccount,
        amount: 7000,
        date: '2026-11-02',
      ),
      tx(
        id: 'archived-tx',
        accountId: 'archived',
        type: EntryType.owedByAccount,
        amount: 50000,
        date: '2026-11-03',
      ),
    ];

    final report = AnalyticsReportBuilder.build(
      accounts: accounts,
      transactions: transactions,
      categoryNames: const {'c1': 'أفراد', 'c2': 'شركات'},
      throughDate: DateTime.utc(2026, 11, 7),
      monthCount: 3,
    );
    final summary = BalanceCalculator.calculateSystemSummary(
      accounts: accounts,
      transactions: transactions,
    );

    expect(report.totalReceivableMinor, summary.totalOwedByMinor);
    expect(report.totalPayableMinor, summary.totalOwedToMinor);
    expect(report.netMinor, summary.netBalanceMinor);
    expect(report.activeAccountCount, 2);
    expect(report.accounts.map((row) => row.accountId), isNot(contains('archived')));
    expect(report.netMinor, 16000);
    expect(report.totalReceivableMinor, 16000);
    expect(report.totalPayableMinor, 0);
  });

  test('monthly closing positions carry movements from before the report range', () {
    final accounts = [
      account(
        id: 'a',
        name: 'أ',
        categoryId: 'c1',
        opening: 10000,
      ),
      account(
        id: 'b',
        name: 'ب',
        categoryId: 'c2',
        opening: -5000,
      ),
    ];
    final transactions = [
      tx(
        id: 'aug',
        accountId: 'a',
        type: EntryType.owedToAccount,
        amount: 1000,
        date: '2026-08-20',
      ),
      tx(
        id: 'sep-a',
        accountId: 'a',
        type: EntryType.owedByAccount,
        amount: 5000,
        date: '2026-09-10',
      ),
      tx(
        id: 'sep-b',
        accountId: 'b',
        type: EntryType.owedToAccount,
        amount: 2000,
        date: '2026-09-15',
      ),
      tx(
        id: 'oct-a',
        accountId: 'a',
        type: EntryType.owedToAccount,
        amount: 3000,
        date: '2026-10-05',
      ),
      tx(
        id: 'oct-b',
        accountId: 'b',
        type: EntryType.owedByAccount,
        amount: 1000,
        date: '2026-10-20',
      ),
      tx(
        id: 'nov-a',
        accountId: 'a',
        type: EntryType.owedByAccount,
        amount: 4000,
        date: '2026-11-01',
      ),
      tx(
        id: 'nov-b',
        accountId: 'b',
        type: EntryType.owedByAccount,
        amount: 7000,
        date: '2026-11-02',
      ),
    ];

    final report = AnalyticsReportBuilder.build(
      accounts: accounts,
      transactions: transactions,
      categoryNames: const {'c1': 'أفراد', 'c2': 'شركات'},
      throughDate: DateTime.utc(2026, 11, 7),
      monthCount: 3,
    );

    expect(report.monthly.map((row) => row.month), [
      '2026-09',
      '2026-10',
      '2026-11',
    ]);

    final september = report.monthly[0];
    expect(september.receivableMinor, 14000);
    expect(september.payableMinor, 7000);
    expect(september.netMinor, 7000);
    expect(september.movementOwedByMinor, 5000);
    expect(september.movementOwedToMinor, 2000);

    final october = report.monthly[1];
    expect(october.receivableMinor, 11000);
    expect(october.payableMinor, 6000);
    expect(october.netMinor, 5000);

    final november = report.monthly[2];
    expect(november.receivableMinor, 16000);
    expect(november.payableMinor, 0);
    expect(november.netMinor, 16000);
    expect(november.movementOwedByMinor, 11000);
    expect(november.movementOwedToMinor, 0);
  });

  test('category report groups current balances by category name', () {
    final report = AnalyticsReportBuilder.build(
      accounts: [
        account(
          id: 'a',
          name: 'أ',
          categoryId: 'c',
          opening: 10000,
        ),
        account(
          id: 'b',
          name: 'ب',
          categoryId: 'c',
          opening: -4000,
        ),
      ],
      transactions: const [],
      categoryNames: const {'c': 'عائلة'},
      throughDate: DateTime.utc(2026, 11, 7),
      monthCount: 1,
    );

    expect(report.categories, hasLength(1));
    final category = report.categories.single;
    expect(category.categoryName, 'عائلة');
    expect(category.accountCount, 2);
    expect(category.receivableMinor, 10000);
    expect(category.payableMinor, 4000);
    expect(category.netMinor, 6000);
  });

  test('CSV export protects formula-like account names and excludes notes entirely', () {
    final report = AnalyticsReport(
      totalReceivableMinor: 100,
      totalPayableMinor: 0,
      netMinor: 100,
      activeAccountCount: 1,
      accounts: const [
        AccountAnalyticsRow(
          accountId: 'a',
          name: '=SUM(A1:A2)',
          categoryId: 'c',
          categoryName: 'اختبار',
          balanceMinor: 100,
          transactionCount: 0,
          lastActivityDate: null,
        ),
      ],
      categories: const [],
      monthly: const [],
    );

    final csv = AnalyticsReportBuilder.buildCsv(report);
    expect(csv.startsWith('\uFEFF'), true);
    expect(csv, contains('"\t=SUM(A1:A2)"'));
    expect(csv, isNot(contains('PRIVATE_NOTE')));
  });

  test('month range is bounded', () {
    expect(
      () => AnalyticsReportBuilder.build(
        accounts: const [],
        transactions: const [],
        categoryNames: const {},
        throughDate: DateTime.utc(2026, 11, 7),
        monthCount: 0,
      ),
      throwsArgumentError,
    );
    expect(
      () => AnalyticsReportBuilder.build(
        accounts: const [],
        transactions: const [],
        categoryNames: const {},
        throughDate: DateTime.utc(2026, 11, 7),
        monthCount: 61,
      ),
      throwsArgumentError,
    );
  });
}
