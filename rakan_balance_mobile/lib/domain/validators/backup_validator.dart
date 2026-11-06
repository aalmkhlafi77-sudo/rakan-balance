import 'dart:convert';
import 'package:crypto/crypto.dart';

import '../financial/money_utils.dart';
import '../models/account_model.dart';
import '../models/attachment_model.dart';
import '../models/due_item_model.dart';
import '../models/note_model.dart';
import '../models/transaction_model.dart';
import 'due_validator.dart';

class BackupValidator {
  static ({bool isValid, String? error, Map<String, dynamic>? parsedBundle}) validateBackupJson(String jsonString) {
    try {
      final Map<String, dynamic> bundle = jsonDecode(jsonString);

      if (!bundle.containsKey('manifest') || !bundle.containsKey('data')) {
        return (isValid: false, error: 'ملف النسخة الاحتياطية يفتقد الترويسة المعتمدة (manifest) أو البيانات (data).', parsedBundle: null);
      }

      final manifest = bundle['manifest'] as Map<String, dynamic>;
      final data = bundle['data'] as Map<String, dynamic>;

      // A. Manifest check
      if (manifest['formatName'] != 'RAKAN_BALANCE_BACKUP') {
        return (isValid: false, error: 'صيغة ملف النسخة الاحتياطية غير متوافقة.', parsedBundle: null);
      }

      final backupFormatVersion = manifest['backupFormatVersion'] as int?;
      if (backupFormatVersion == null || backupFormatVersion < 1 || backupFormatVersion > 2) {
        return (isValid: false, error: 'إصدار النسخة الاحتياطية غير مدعوم.', parsedBundle: null);
      }

      // B. SHA-256 Checksum Verification
      final expectedChecksum = manifest['checksum'] as String?;
      if (expectedChecksum == null || expectedChecksum.isEmpty) {
        return (isValid: false, error: 'بصمة الحماية SHA-256 مفقودة.', parsedBundle: null);
      }

      // Canonical stringification of data object
      final dataJsonString = jsonEncode(data);
      final computedDigest = sha256.convert(utf8.encode(dataJsonString)).toString();

      if (computedDigest.toLowerCase() != expectedChecksum.toLowerCase()) {
        return (isValid: false, error: 'فشل التحقق من بصمة الحماية SHA-256. الملف تالف أو معدل بشكل غير مصرح به.', parsedBundle: null);
      }

      // C. Record Counts Verification
      final recordCounts = manifest['recordCounts'] as Map<String, dynamic>;
      final accountsList = (data['accounts'] as List? ?? []);
      final categoriesList = (data['categories'] as List? ?? []);
      final transactionsList = (data['transactions'] as List? ?? []);
      final attachmentsList = (data['attachments'] as List? ?? []);
      final notesList = (data['notes'] as List? ?? []);
      final duesList = (data['dues'] as List? ?? []);
      final allocationsList = (data['allocations'] as List? ?? []);
      final remindersList = (data['reminders'] as List? ?? []);

      if (recordCounts['accounts'] != accountsList.length ||
          recordCounts['categories'] != categoriesList.length ||
          recordCounts['transactions'] != transactionsList.length ||
          recordCounts['attachments'] != attachmentsList.length ||
          recordCounts['notes'] != notesList.length) {
        return (isValid: false, error: 'أعداد السجلات الواردة لا تطابق الترويسة المعتمدة.', parsedBundle: null);
      }

      if (recordCounts.containsKey('dues') && recordCounts['dues'] != duesList.length) {
        return (isValid: false, error: 'أعداد الاستحقاقات لا تطابق الترويسة.', parsedBundle: null);
      }

      // D. Parse & Validate Domain Invariants
      final accounts = accountsList.map((e) => AccountModel.fromMap(Map<String, dynamic>.from(e))).toList();
      final transactions = transactionsList.map((e) => TransactionModel.fromMap(Map<String, dynamic>.from(e))).toList();
      final dues = duesList.map((e) => DueItemModel.fromMap(Map<String, dynamic>.from(e))).toList();
      final allocations = allocationsList.map((e) => PaymentAllocationModel.fromMap(Map<String, dynamic>.from(e))).toList();
      final reminders = remindersList.map((e) => ReminderModel.fromMap(Map<String, dynamic>.from(e))).toList();

      // Check account balances and safe money limits
      for (final acc in accounts) {
        if (acc.openingBalanceMinor.abs() > MoneyUtils.maxSafeHalalas) {
          return (isValid: false, error: 'رصيد الحساب المبدئي يتجاوز الحد المسموح.', parsedBundle: null);
        }
      }

      for (final tx in transactions) {
        if (tx.amountMinor <= 0 || tx.amountMinor > MoneyUtils.maxSafeHalalas) {
          return (isValid: false, error: 'مبلغ إحدى الحركات المالية غير صالح.', parsedBundle: null);
        }
        if (!accounts.any((a) => a.id == tx.accountId)) {
          return (isValid: false, error: 'توجد حركة مرتبطة بحساب غير موجود.', parsedBundle: null);
        }
      }

      // Validate N2 dues & allocations ledger integrity
      if (dues.isNotEmpty || allocations.isNotEmpty || reminders.isNotEmpty) {
        DueValidator.validateLedger(
          dues: dues,
          allocations: allocations,
          reminders: reminders,
          accounts: accounts,
          transactions: transactions,
        );
      }

      return (isValid: true, error: null, parsedBundle: bundle);
    } catch (e) {
      return (isValid: false, error: 'فشل تحليل ملف النسخة الاحتياطية: ${e.toString()}', parsedBundle: null);
    }
  }
}
