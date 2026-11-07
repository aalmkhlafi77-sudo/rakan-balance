import '../models/account_model.dart';
import '../models/transaction_model.dart';
import 'balance_calculator.dart';
import 'money_utils.dart';

class AccountAnalyticsRow {
  final String accountId;
  final String name;
  final String categoryId;
  final String categoryName;
  final int balanceMinor;
  final int transactionCount;
  final String? lastActivityDate;

  const AccountAnalyticsRow({
    required this.accountId,
    required this.name,
    required this.categoryId,
    required this.categoryName,
    required this.balanceMinor,
    required this.transactionCount,
    required this.lastActivityDate,
  });
}

class CategoryAnalyticsRow {
  final String categoryId;
  final String categoryName;
  final int accountCount;
  final int receivableMinor;
  final int payableMinor;
  final int netMinor;

  const CategoryAnalyticsRow({
    required this.categoryId,
    required this.categoryName,
    required this.accountCount,
    required this.receivableMinor,
    required this.payableMinor,
    required this.netMinor,
  });
}

class MonthlyPositionRow {
  final String month;
  final int receivableMinor;
  final int payableMinor;
  final int netMinor;
  final int movementOwedByMinor;
  final int movementOwedToMinor;

  const MonthlyPositionRow({
    required this.month,
    required this.receivableMinor,
    required this.payableMinor,
    required this.netMinor,
    required this.movementOwedByMinor,
    required this.movementOwedToMinor,
  });
}

class AnalyticsReport {
  final int totalReceivableMinor;
  final int totalPayableMinor;
  final int netMinor;
  final int activeAccountCount;
  final List<AccountAnalyticsRow> accounts;
  final List<CategoryAnalyticsRow> categories;
  final List<MonthlyPositionRow> monthly;

  const AnalyticsReport({
    required this.totalReceivableMinor,
    required this.totalPayableMinor,
    required this.netMinor,
    required this.activeAccountCount,
    required this.accounts,
    required this.categories,
    required this.monthly,
  });
}

class AnalyticsReportBuilder {
  static String _monthKey(DateTime date) =>
      '${date.year.toString().padLeft(4, '0')}-'
      '${date.month.toString().padLeft(2, '0')}';

  static DateTime _monthStart(DateTime date) =>
      DateTime.utc(date.year, date.month, 1);

  static DateTime _addMonths(DateTime date, int months) =>
      DateTime.utc(date.year, date.month + months, 1);

  static AnalyticsReport build({
    required List<AccountModel> accounts,
    required List<TransactionModel> transactions,
    required Map<String, String> categoryNames,
    required DateTime throughDate,
    int monthCount = 12,
    bool includeArchived = false,
  }) {
    if (monthCount <= 0 || monthCount > 60) {
      throw ArgumentError('نطاق الأشهر يجب أن يكون بين 1 و60.');
    }

    final selectedAccounts = accounts
        .where((account) => includeArchived || account.status == 'active')
        .toList();
    final selectedIds = selectedAccounts.map((account) => account.id).toSet();
    final relevantTransactions = transactions
        .where((tx) => selectedIds.contains(tx.accountId))
        .toList();

    final systemSummary = BalanceCalculator.calculateSystemSummary(
      accounts: selectedAccounts,
      transactions: relevantTransactions,
    );

    final txByAccount = <String, List<TransactionModel>>{};
    for (final tx in relevantTransactions) {
      txByAccount.putIfAbsent(tx.accountId, () => []).add(tx);
    }

    final accountRows = <AccountAnalyticsRow>[];
    for (final account in selectedAccounts) {
      final txs = txByAccount[account.id] ?? const <TransactionModel>[];
      final balance = BalanceCalculator.calculateAccountBalance(
        account: account,
        transactions: txs,
      );
      String? lastDate;
      for (final tx in txs) {
        if (lastDate == null || tx.date.compareTo(lastDate) > 0) {
          lastDate = tx.date;
        }
      }
      accountRows.add(
        AccountAnalyticsRow(
          accountId: account.id,
          name: account.name,
          categoryId: account.categoryId,
          categoryName: categoryNames[account.categoryId] ?? 'غير مصنف',
          balanceMinor: balance,
          transactionCount: txs.length,
          lastActivityDate: lastDate,
        ),
      );
    }
    accountRows.sort((a, b) {
      final byAbsolute = b.balanceMinor.abs().compareTo(a.balanceMinor.abs());
      if (byAbsolute != 0) return byAbsolute;
      return a.name.compareTo(b.name);
    });

    final categoryBuckets = <String, List<AccountAnalyticsRow>>{};
    for (final row in accountRows) {
      categoryBuckets.putIfAbsent(row.categoryId, () => []).add(row);
    }
    final categoryRows = <CategoryAnalyticsRow>[];
    for (final entry in categoryBuckets.entries) {
      var receivable = 0;
      var payable = 0;
      var net = 0;
      for (final row in entry.value) {
        net += row.balanceMinor;
        if (row.balanceMinor > 0) {
          receivable += row.balanceMinor;
        } else if (row.balanceMinor < 0) {
          payable += -row.balanceMinor;
        }
      }
      categoryRows.add(
        CategoryAnalyticsRow(
          categoryId: entry.key,
          categoryName: entry.value.first.categoryName,
          accountCount: entry.value.length,
          receivableMinor: receivable,
          payableMinor: payable,
          netMinor: net,
        ),
      );
    }
    categoryRows.sort(
      (a, b) => a.categoryName.compareTo(b.categoryName),
    );

    final endMonth = _monthStart(throughDate);
    final startMonth = _addMonths(endMonth, -(monthCount - 1));
    final nextAfterEnd = _addMonths(endMonth, 1);
    final balances = <String, int>{
      for (final account in selectedAccounts)
        account.id: account.openingBalanceMinor,
    };

    for (final tx in relevantTransactions) {
      final txDate = DateTime.tryParse(tx.date);
      if (txDate != null && txDate.isBefore(startMonth)) {
        balances[tx.accountId] =
            (balances[tx.accountId] ?? 0) + tx.signedAmountMinor;
      }
    }

    final monthlyRows = <MonthlyPositionRow>[];
    for (var monthIndex = 0; monthIndex < monthCount; monthIndex++) {
      final monthStart = _addMonths(startMonth, monthIndex);
      final nextMonth = _addMonths(monthStart, 1);
      var movementOwedBy = 0;
      var movementOwedTo = 0;

      for (final tx in relevantTransactions) {
        final txDate = DateTime.tryParse(tx.date);
        if (txDate == null ||
            txDate.isBefore(monthStart) ||
            !txDate.isBefore(nextMonth) ||
            !txDate.isBefore(nextAfterEnd)) {
          continue;
        }
        balances[tx.accountId] =
            (balances[tx.accountId] ?? 0) + tx.signedAmountMinor;
        if (tx.entryType == EntryType.owedByAccount) {
          movementOwedBy += tx.amountMinor;
        } else {
          movementOwedTo += tx.amountMinor;
        }
      }

      var receivable = 0;
      var payable = 0;
      var net = 0;
      for (final balance in balances.values) {
        net += balance;
        if (balance > 0) {
          receivable += balance;
        } else if (balance < 0) {
          payable += -balance;
        }
      }
      monthlyRows.add(
        MonthlyPositionRow(
          month: _monthKey(monthStart),
          receivableMinor: receivable,
          payableMinor: payable,
          netMinor: net,
          movementOwedByMinor: movementOwedBy,
          movementOwedToMinor: movementOwedTo,
        ),
      );
    }

    return AnalyticsReport(
      totalReceivableMinor: systemSummary.totalOwedByMinor,
      totalPayableMinor: systemSummary.totalOwedToMinor,
      netMinor: systemSummary.netBalanceMinor,
      activeAccountCount: selectedAccounts.length,
      accounts: accountRows,
      categories: categoryRows,
      monthly: monthlyRows,
    );
  }

  static String _csvCell(String value) {
    final safe = RegExp(r'^[\s]*[=+@-]').hasMatch(value) ? '\t$value' : value;
    return '"${safe.replaceAll('"', '""')}"';
  }

  static String buildCsv(AnalyticsReport report) {
    final lines = <String>[
      'ملخص التقرير',
      'إجمالي لك (هللة),إجمالي عليك (هللة),الصافي (هللة),الحسابات النشطة',
      '${report.totalReceivableMinor},${report.totalPayableMinor},'
          '${report.netMinor},${report.activeAccountCount}',
      '',
      'التصنيفات',
      'التصنيف,عدد الحسابات,لك (هللة),عليك (هللة),الصافي (هللة)',
      ...report.categories.map(
        (row) => [
          _csvCell(row.categoryName),
          '${row.accountCount}',
          '${row.receivableMinor}',
          '${row.payableMinor}',
          '${row.netMinor}',
        ].join(','),
      ),
      '',
      'الحسابات',
      'الحساب,التصنيف,الرصيد (هللة),الرصيد (ريال),عدد الحركات,آخر نشاط',
      ...report.accounts.map(
        (row) => [
          _csvCell(row.name),
          _csvCell(row.categoryName),
          '${row.balanceMinor}',
          MoneyUtils.formatMinorAmount(row.balanceMinor),
          '${row.transactionCount}',
          _csvCell(row.lastActivityDate ?? ''),
        ].join(','),
      ),
      '',
      'الاتجاه الشهري',
      'الشهر,لك ختامي (هللة),عليك ختامي (هللة),الصافي (هللة),حركات لك,حركات عليك',
      ...report.monthly.map(
        (row) => [
          row.month,
          '${row.receivableMinor}',
          '${row.payableMinor}',
          '${row.netMinor}',
          '${row.movementOwedByMinor}',
          '${row.movementOwedToMinor}',
        ].join(','),
      ),
    ];
    return '\uFEFF${lines.join('\r\n')}\r\n';
  }
}
