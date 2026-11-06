import '../models/account_model.dart';
import '../models/transaction_model.dart';

/// One entry in a period statement with a stable running balance.
class StatementRow {
  final TransactionModel transaction;
  final int signedAmountMinor;
  final int runningBalanceMinor;

  const StatementRow({
    required this.transaction,
    required this.signedAmountMinor,
    required this.runningBalanceMinor,
  });
}

/// Central financial balance calculator implementing strict balance invariance ($B = \text{openingBalanceMinor} + \sum \text{signedTransactionsMinor}$).
class BalanceCalculator {
  /// Computes the net signed balance of an account in Halalas.
  /// Positive = "Owed by account" (لك)
  /// Negative = "Owed to account" (عليك)
  /// Zero = Balanced
  static int calculateAccountBalance({
    required AccountModel account,
    required List<TransactionModel> transactions,
  }) {
    int balance = account.openingBalanceMinor;
    for (final tx in transactions) {
      if (tx.accountId == account.id) {
        balance += tx.signedAmountMinor;
      }
    }
    return balance;
  }

  /// Opening at fromDate includes all earlier movements; subsequent rows
  /// are sorted by date, creation timestamp, then identifier as on the web.
  static ({
    int openingBalanceMinor,
    int closingBalanceMinor,
    int totalOwedByMinor,
    int totalOwedToMinor,
    List<StatementRow> rows,
  }) calculateAccountStatement({
    required AccountModel account,
    required List<TransactionModel> transactions,
    String? fromDate,
    String? toDate,
  }) {
    final relevant = transactions.where((tx) => tx.accountId == account.id).toList()
      ..sort((a, b) {
        final dateOrder = a.date.compareTo(b.date);
        if (dateOrder != 0) return dateOrder;
        final timeOrder = a.createdAt.compareTo(b.createdAt);
        return timeOrder != 0 ? timeOrder : a.id.compareTo(b.id);
      });
    var opening = account.openingBalanceMinor;
    final included = <TransactionModel>[];
    for (final tx in relevant) {
      if (fromDate != null && tx.date.compareTo(fromDate) < 0) {
        opening += tx.signedAmountMinor;
      } else if (toDate != null && tx.date.compareTo(toDate) > 0) {
        continue;
      } else {
        included.add(tx);
      }
    }
    var running = opening;
    var owedBy = 0;
    var owedTo = 0;
    final rows = <StatementRow>[];
    for (final tx in included) {
      running += tx.signedAmountMinor;
      if (tx.entryType == EntryType.owedByAccount) {
        owedBy += tx.amountMinor;
      } else {
        owedTo += tx.amountMinor;
      }
      rows.add(StatementRow(transaction: tx, signedAmountMinor: tx.signedAmountMinor,
        runningBalanceMinor: running));
    }
    return (openingBalanceMinor: opening, closingBalanceMinor: running,
      totalOwedByMinor: owedBy, totalOwedToMinor: owedTo, rows: rows);
  }

  /// Calculates total system summary: Total Owed By (لك), Total Owed To (عليك), and Net Balance.
  static ({int totalOwedByMinor, int totalOwedToMinor, int netBalanceMinor}) calculateSystemSummary({
    required List<AccountModel> accounts,
    required List<TransactionModel> transactions,
  }) {
    int totalOwedBy = 0;
    int totalOwedTo = 0;

    for (final acc in accounts) {
      if (acc.status != 'active') continue;
      final b = calculateAccountBalance(account: acc, transactions: transactions);
      if (b > 0) {
        totalOwedBy += b;
      } else if (b < 0) {
        totalOwedTo += b.abs();
      }
    }

    return (
      totalOwedByMinor: totalOwedBy,
      totalOwedToMinor: totalOwedTo,
      netBalanceMinor: totalOwedBy - totalOwedTo,
    );
  }

  /// Validates cycle prevention when updating account parent ID to prevent self-referential or circular hierarchies.
  static bool hasHierarchyCycle(String accountId, String? targetParentId, List<AccountModel> allAccounts) {
    if (targetParentId == null || targetParentId.isEmpty) return false;
    if (targetParentId == accountId) return true;

    String? currentParentId = targetParentId;
    final visited = <String>{accountId};

    while (currentParentId != null) {
      if (visited.contains(currentParentId)) return true;
      visited.add(currentParentId);

      final parent = allAccounts.firstWhere(
        (a) => a.id == currentParentId,
        orElse: () => AccountModel(
          id: '',
          name: '',
          categoryId: '',
          openingBalanceMinor: 0,
          createdAt: '',
          updatedAt: '',
        ),
      );

      if (parent.id.isEmpty) break;
      currentParentId = parent.parentId;
    }

    return false;
  }
}
