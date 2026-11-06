import '../financial/money_utils.dart';
import '../models/account_model.dart';
import '../models/transaction_model.dart';

class TransactionValidator {
  static ({bool isValid, String? error}) validate({
    required String accountId,
    required EntryType entryType,
    required int amountMinor,
    required String date,
    required String description,
    required List<AccountModel> accounts,
  }) {
    if (accountId.isEmpty) {
      return (isValid: false, error: 'يجب اختيار الحساب المالي.');
    }

    final account = accounts.firstWhere(
      (a) => a.id == accountId,
      orElse: () => AccountModel(id: '', name: '', categoryId: '', openingBalanceMinor: 0, createdAt: '', updatedAt: ''),
    );

    if (account.id.isEmpty) {
      return (isValid: false, error: 'الحساب غير موجود.');
    }

    if (account.status != 'active') {
      return (isValid: false, error: 'لا يمكن إضافة أو تعديل حركة لحساب مؤرشف.');
    }

    if (amountMinor <= 0 || amountMinor > MoneyUtils.maxSafeHalalas) {
      return (isValid: false, error: 'مبلغ الحركة غير صالح ويجب أن يكون موجبًا بالهللات.');
    }

    if (!MoneyUtils.isValidDateString(date)) {
      return (isValid: false, error: 'تاريخ الحركة غير صالح.');
    }

    return (isValid: true, error: null);
  }
}
