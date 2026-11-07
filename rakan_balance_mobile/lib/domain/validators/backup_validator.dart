import 'dart:convert';
import 'package:crypto/crypto.dart';

import '../financial/money_utils.dart';
import '../financial/inter_account_transfer_engine.dart';
import '../models/account_model.dart';
import '../models/due_item_model.dart';
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

      final schemaVersion = manifest['schemaVersion'] as int?;
      if (schemaVersion == null || schemaVersion < 1 || schemaVersion > 2 ||
          backupFormatVersion != schemaVersion) {
        return (isValid: false, error: 'إصدار مخطط النسخة الاحتياطية غير مدعوم.',
          parsedBundle: null);
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

      if (recordCounts.containsKey('allocations') &&
          recordCounts['allocations'] != allocationsList.length ||
          recordCounts.containsKey('reminders') &&
          recordCounts['reminders'] != remindersList.length) {
        return (isValid: false, error: 'أعداد تخصيصات السداد أو التذكيرات غير متطابقة.',
          parsedBundle: null);
      }

      // Validate the cross-platform schema before creating model instances.
      if (data['accounts'] is! List || data['categories'] is! List ||
          data['transactions'] is! List || data['attachments'] is! List ||
          data['notes'] is! List) {
        return (isValid: false, error: 'بيانات النسخة ليست قوائم صالحة.', parsedBundle: null);
      }

      bool uniqueRecords(List records) {
        final ids = <String>{};
        for (final raw in records) {
          if (raw is! Map || raw['id'] is! String ||
              (raw['id'] as String).isEmpty || !ids.add(raw['id'] as String)) {
            return false;
          }
        }
        return true;
      }

      for (final records in [
        accountsList, categoriesList, transactionsList, attachmentsList,
        notesList, duesList, allocationsList, remindersList,
      ]) {
        if (!uniqueRecords(records)) {
          return (isValid: false, error: 'النسخة تحتوي معرفات مكررة أو مفقودة.',
            parsedBundle: null);
        }
      }

      final categoryIds = categoriesList.map((e) => e['id'] as String).toSet();
      final accountIds = accountsList.map((e) => e['id'] as String).toSet();
      final transactionIds = transactionsList.map((e) => e['id'] as String).toSet();
      final attachmentIds = attachmentsList.map((e) => e['id'] as String).toSet();
      final parentMap = <String, String?>{};
      for (final raw in accountsList) {
        final acc = Map<String, dynamic>.from(raw as Map);
        if (!categoryIds.contains(acc['categoryId']) ||
            acc['name'] is! String ||
            (acc['name'] as String).trim().isEmpty ||
            !['active', 'archived'].contains(acc['status'] ?? 'active')) {
          return (isValid: false, error: 'حساب مرتبط بتصنيف مفقود أو يحمل بيانات غير صالحة.',
            parsedBundle: null);
        }
        parentMap[acc['id'] as String] = acc['parentId'] as String?;
      }
      for (final id in accountIds) {
        final visited = <String>{};
        String? current = id;
        while (current != null) {
          if (!parentMap.containsKey(current) || !visited.add(current)) {
            return (isValid: false, error: 'شجرة الحسابات تتضمن مرجعًا مفقودًا أو دورة.',
              parsedBundle: null);
          }
          current = parentMap[current];
        }
      }

      for (final raw in transactionsList) {
        final tx = Map<String, dynamic>.from(raw as Map);
        final refs = tx['attachmentIds'];
        if (!['owedByAccount', 'owedToAccount'].contains(tx['entryType']) ||
            !MoneyUtils.isValidDateString(tx['date'] as String? ?? '') ||
            refs is! List || refs.any((id) => !attachmentIds.contains(id))) {
          return (isValid: false, error: 'حركة مالية تحتوي تاريخًا أو مرفقات أو نوعًا غير صالح.',
            parsedBundle: null);
        }
      }

      for (final raw in attachmentsList) {
        final att = Map<String, dynamic>.from(raw as Map);
        if (!transactionIds.contains(att['transactionId']) ||
            att['originalName'] is! String ||
            att['mimeType'] is! String ||
            att['size'] is! int || (att['size'] as int) < 0 ||
            att['dataUrl'] is! String) {
          return (isValid: false, error: 'مرفق لا يطابق حركة مالية موجودة.',
            parsedBundle: null);
        }
      }

      for (final raw in duesList) {
        final due = Map<String, dynamic>.from(raw as Map);
        if (due['sourceTransactionId'] != null) {
          final source = transactionsList.where(
            (tx) => tx['id'] == due['sourceTransactionId']).toList();
          if (source.length != 1 ||
              source.first['accountId'] != due['accountId'] ||
              source.first['entryType'] != due['entryType']) {
            return (isValid: false, error: 'الحركة الأصلية للاستحقاق غير متطابقة.',
              parsedBundle: null);
          }
        }
      }

      for (final raw in notesList) {
        final note = Map<String, dynamic>.from(raw as Map);
        if (note['content'] is! String ||
            note['title'] is! String ||
            !['emerald', 'amber', 'rose', 'blue', 'purple', 'slate']
                .contains(note['color']) ||
            note['archived'] is! bool) {
          return (isValid: false, error: 'سجل الملاحظات العامة غير صالح.',
            parsedBundle: null);
        }
      }

      final settings = data['settings'];
      if (settings is Map &&
          settings.keys.any((key) => key.toString().toLowerCase().contains('pin') ||
              key.toString().toLowerCase().contains('password') ||
              key.toString().toLowerCase().contains('secret'))) {
        return (isValid: false, error: 'بيانات حساسة غير مسموحة ضمن النسخة الاحتياطية.',
          parsedBundle: null);
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

      // Reject orphaned, mismatched or incomplete inter-account transfer pairs.
      final transferCheck =
          InterAccountTransferEngine.validateTransferJournal(transactions);
      if (!transferCheck.isValid) {
        return (isValid: false,
          error: transferCheck.error ?? 'بيانات الحركة البينية غير سليمة.',
          parsedBundle: null);
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
