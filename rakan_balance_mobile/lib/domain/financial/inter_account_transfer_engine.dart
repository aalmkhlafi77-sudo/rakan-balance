import '../models/account_model.dart';
import '../models/transaction_model.dart';
import '../models/transfer_model.dart';
import 'money_utils.dart';

class InterAccountTransferEngine {
  /// Validates inputs for creating or updating an inter-account debt transfer.
  static ({bool isValid, String? error}) validateTransfer({
    required InterAccountTransferInput input,
    required List<AccountModel> accounts,
  }) {
    if (input.sourceAccountId.isEmpty || input.destinationAccountId.isEmpty) {
      return (isValid: false, error: 'يجب تحديد الحساب المصدر والحساب الوجهة.');
    }

    if (input.sourceAccountId == input.destinationAccountId) {
      return (isValid: false, error: 'لا يمكن تحويل المديونية إلى نفس الحساب.');
    }

    final source = accounts.firstWhere(
      (a) => a.id == input.sourceAccountId,
      orElse: () => AccountModel(id: '', name: '', categoryId: '', openingBalanceMinor: 0, createdAt: '', updatedAt: ''),
    );
    final destination = accounts.firstWhere(
      (a) => a.id == input.destinationAccountId,
      orElse: () => AccountModel(id: '', name: '', categoryId: '', openingBalanceMinor: 0, createdAt: '', updatedAt: ''),
    );

    if (source.id.isEmpty || source.status != 'active') {
      return (isValid: false, error: 'الحساب المصدر غير موجود أو مؤرشف.');
    }
    if (destination.id.isEmpty || destination.status != 'active') {
      return (isValid: false, error: 'الحساب الوجهة غير موجود أو مؤرشف.');
    }

    if (input.amountMinor <= 0 || input.amountMinor > MoneyUtils.maxSafeHalalas) {
      return (isValid: false, error: 'مبلغ الحركة البينية غير صالح.');
    }

    if (!MoneyUtils.isValidDateString(input.date)) {
      return (isValid: false, error: 'تاريخ الحركة البينية غير صالح.');
    }

    return (isValid: true, error: null);
  }

  /// Builds atomic pair of ledger entries for an inter-account transfer.
  /// Source entry: owedToAccount (-amountMinor)
  /// Destination entry: owedByAccount (+amountMinor)
  /// Net system impact = (-amountMinor) + (+amountMinor) = 0 Halalas.
  static List<TransactionModel> buildTransferEntries({
    required InterAccountTransferInput input,
    required String transferId,
    required String sourceAccountName,
    required String destinationAccountName,
  }) {
    final now = DateTime.now().toIso8601String();
    final userDesc = input.description.trim();
    final descPrefix = userDesc.isNotEmpty ? '$userDesc | ' : '';

    final sourceTx = TransactionModel(
      id: 'tx_src_${DateTime.now().millisecondsSinceEpoch}_${transferId.substring(0, 4)}',
      accountId: input.sourceAccountId,
      entryType: EntryType.owedToAccount,
      amountMinor: input.amountMinor,
      date: input.date,
      description: '${descPrefix}تحويل مديونية إلى: $destinationAccountName',
      attachmentIds: [],
      transferId: transferId,
      transferRole: TransferRole.source,
      counterpartyAccountId: input.destinationAccountId,
      createdAt: now,
      updatedAt: now,
    );

    final destTx = TransactionModel(
      id: 'tx_dst_${DateTime.now().millisecondsSinceEpoch}_${transferId.substring(0, 4)}',
      accountId: input.destinationAccountId,
      entryType: EntryType.owedByAccount,
      amountMinor: input.amountMinor,
      date: input.date,
      description: '${descPrefix}تحويل مديونية من: $sourceAccountName',
      attachmentIds: [],
      transferId: transferId,
      transferRole: TransferRole.destination,
      counterpartyAccountId: input.sourceAccountId,
      createdAt: now,
      updatedAt: now,
    );

    return [sourceTx, destTx];
  }

  /// Validates that a pair of transactions representing an inter-account transfer are completely valid and balanced.
  static ({bool isValid, String? error}) validateTransferPair(List<TransactionModel> pair) {
    if (pair.length != 2) {
      return (isValid: false, error: 'الحركة البينية يجب أن تحتوي على زوج أفراد بالضبط (2).');
    }

    final t1 = pair[0];
    final t2 = pair[1];

    if (t1.transferId == null || t1.transferId != t2.transferId) {
      return (isValid: false, error: 'رمز الحركة البينية غير متطابق.');
    }

    if (t1.amountMinor != t2.amountMinor || t1.amountMinor <= 0) {
      return (isValid: false, error: 'مبلغ الحركة البينية غير متطابق أو غير موجب.');
    }

    if (t1.date != t2.date) {
      return (isValid: false, error: 'تاريخ الطرفين غير متطابق.');
    }

    if (t1.accountId == t2.accountId) {
      return (isValid: false, error: 'الحسابان المتأثران بالحركة البينية متطابقان.');
    }

    // Verify opposite entry types and net zero balance sum
    if (t1.signedAmountMinor + t2.signedAmountMinor != 0) {
      return (isValid: false, error: 'مجموع أثر الحركة البينية على النظام لا يساوى صفرًا.');
    }

    return (isValid: true, error: null);
  }
}
