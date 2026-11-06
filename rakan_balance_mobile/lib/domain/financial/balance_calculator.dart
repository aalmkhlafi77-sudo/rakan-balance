import '../models/account_model.dart';
import '../models/transaction_model.dart';

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
