import '../financial/money_utils.dart';
import '../models/account_model.dart';
import '../models/due_item_model.dart';
import '../models/transaction_model.dart';

class DueValidator {
  static void validateDueRecord(DueItemModel due, List<AccountModel> accounts) {
    if (due.id.isEmpty) throw Exception('معرف الاستحقاق مطلوب.');
    if (!accounts.any((a) => a.id == due.accountId)) throw Exception('حساب الاستحقاق غير موجود.');
    if (!MoneyUtils.isValidDateString(due.dueDate)) throw Exception('تاريخ الاستحقاق غير صالح.');
    if (due.originalAmountMinor <= 0 || due.originalAmountMinor > MoneyUtils.maxSafeHalalas) {
      throw Exception('مبلغ الاستحقاق غير صالح.');
    }
    if (due.settledAmountMinor < 0 || due.settledAmountMinor > due.originalAmountMinor) {
      throw Exception('قيمة سداد الاستحقاق غير صالحة.');
    }
  }

  static void validateLedger({
    required List<DueItemModel> dues,
    required List<PaymentAllocationModel> allocations,
    required List<ReminderModel> reminders,
    required List<AccountModel> accounts,
    required List<TransactionModel> transactions,
  }) {
    final txMap = {for (var t in transactions) t.id: t};
    final dueIds = <String>{};
    final allocatedByDue = <String, int>{};
    final allocatedByPayment = <String, int>{};

    for (final due in dues) {
      if (dueIds.contains(due.id)) throw Exception('معرف استحقاق مكرر.');
      dueIds.add(due.id);
      validateDueRecord(due, accounts);
    }

    for (final a in allocations) {
      final due = dues.firstWhere((d) => d.id == a.dueItemId, orElse: () => DueItemModel(id: '', accountId: '', entryType: EntryType.owedByAccount, dueDate: '', originalAmountMinor: 0, settledAmountMinor: 0, status: '', createdAt: '', updatedAt: ''));
      final tx = txMap[a.paymentTransactionId];

      if (due.id.isEmpty || tx == null) throw Exception('تخصيص سداد مرتبط باستحقاق أو حركة مفقودة.');
      if (tx.transferId != null || tx.accountId != due.accountId || tx.entryType == due.entryType) {
        throw Exception('حركة السداد لا تطابق حساب أو اتجاه الاستحقاق.');
      }
      if (a.amountMinor <= 0 || a.amountMinor > MoneyUtils.maxSafeHalalas) throw Exception('مبلغ تخصيص غير صالح.');

      allocatedByDue[due.id] = (allocatedByDue[due.id] ?? 0) + a.amountMinor;
      allocatedByPayment[tx.id] = (allocatedByPayment[tx.id] ?? 0) + a.amountMinor;
    }

    for (final due in dues) {
      final totalAllocated = allocatedByDue[due.id] ?? 0;
      if (totalAllocated != due.settledAmountMinor) {
        throw Exception('مجموع التخصيصات لا يطابق المدفوع من الاستحقاق.');
      }
    }

    for (final reminder in reminders) {
      if (reminder.id.isEmpty || !dueIds.contains(reminder.dueItemId)) {
        throw Exception('تذكير مرتبطة باستحقاق غير موجود.');
      }
      if (!MoneyUtils.isValidDateString(reminder.remindAt)) {
        throw Exception('تاريخ التذكير غير صالح.');
      }
    }
  }
}
