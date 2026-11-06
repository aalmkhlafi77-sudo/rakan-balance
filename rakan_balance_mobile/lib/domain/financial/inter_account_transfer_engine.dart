import '../models/account_model.dart';
import '../models/transaction_model.dart';
import '../models/transfer_model.dart';
import 'money_utils.dart';

class InterAccountTransferEngine {
  /// Validates inputs for creating or updating an inter-account debt transfer.
  static ({bool isValid, String? error}) validateTransfer({
    required InterAccountTransferInput input,
    required List<AccountModel> accounts,
    required List<TransactionModel> currentTransactions,
    String? editingTransferId,
  }) {
    if (input.sourceAccountId.isEmpty || input.destinationAccountId.isEmpty) {
      return (isValid: false, error: 'يجب تحديد الحساب المصدر والحساب الوجهة.');
    }
    if (input.sourceAccountId == input.destinationAccountId) {
      return (isValid: false, error: 'لا يمكن تحويل المديونية إلى الحساب نفسه.');
    }
    final sources = accounts.where((a) => a.id == input.sourceAccountId).toList();
    final destinations = accounts.where((a) => a.id == input.destinationAccountId).toList();
    if (sources.length != 1 || destinations.length != 1) {
      return (isValid: false, error: 'الحساب المصدر أو الوجهة غير موجود أو مكرر.');
    }
    final source = sources.single;
    final destination = destinations.single;
    if (source.status != 'active' || destination.status != 'active') {
      return (isValid: false, error: 'لا يمكن نقل المديونية من أو إلى حساب مؤرشف.');
    }
    if (input.amountMinor <= 0 || input.amountMinor > MoneyUtils.maxSafeHalalas) {
      return (isValid: false, error: 'مبلغ الحركة البينية غير صالح.');
    }
    if (!MoneyUtils.isValidDateString(input.date)) {
      return (isValid: false, error: 'تاريخ الحركة البينية غير صالح.');
    }
    if (input.description.trim().isEmpty) {
      return (isValid: false, error: 'بيان الحركة البينية إلزامي.');
    }

    var availableMinor = source.openingBalanceMinor;
    for (final tx in currentTransactions) {
      if (tx.accountId != source.id || tx.transferId == editingTransferId && editingTransferId != null) continue;
      availableMinor += tx.signedAmountMinor;
    }
    if (availableMinor <= 0 || input.amountMinor > availableMinor) {
      return (isValid: false, error: 'رصيد الحساب المصدر الموجب غير كافٍ لنقل هذه المديونية.');
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

    final sourceTx = TransactionModel(
      id: 'tx_src_$transferId',
      accountId: input.sourceAccountId,
      entryType: EntryType.owedToAccount,
      amountMinor: input.amountMinor,
      date: input.date,
      description: input.description.trim(),
      attachmentIds: [],
      transferId: transferId,
      transferRole: TransferRole.source,
      counterpartyAccountId: input.destinationAccountId,
      createdAt: now,
      updatedAt: now,
    );

    final destTx = TransactionModel(
      id: 'tx_dst_$transferId',
      accountId: input.destinationAccountId,
      entryType: EntryType.owedByAccount,
      amountMinor: input.amountMinor,
      date: input.date,
      description: input.description.trim(),
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
      return (isValid: false, error: 'الحركة البينية تتطلب قيدين بالضبط.');
    }
    final sources = pair.where((tx) => tx.transferRole == TransferRole.source).toList();
    final destinations = pair.where((tx) => tx.transferRole == TransferRole.destination).toList();
    if (sources.length != 1 || destinations.length != 1) {
      return (isValid: false, error: 'يلزم وجود قيد مصدر وقيد وجهة حصريًا.');
    }
    final source = sources.single;
    final dest = destinations.single;
    if (source.transferId == null || source.transferId!.isEmpty ||
        source.transferId != dest.transferId ||
        source.id == dest.id ||
        source.accountId == dest.accountId ||
        source.counterpartyAccountId != dest.accountId ||
        dest.counterpartyAccountId != source.accountId ||
        source.entryType != EntryType.owedToAccount ||
        dest.entryType != EntryType.owedByAccount ||
        source.amountMinor <= 0 ||
        source.amountMinor > MoneyUtils.maxSafeHalalas ||
        source.amountMinor != dest.amountMinor ||
        source.date != dest.date ||
        !MoneyUtils.isValidDateString(source.date) ||
        source.signedAmountMinor + dest.signedAmountMinor != 0) {
      return (isValid: false, error: 'طرفا الحركة البينية غير متطابقين أو غير متوازنين.');
    }
    return (isValid: true, error: null);
  }
}
