import 'dart:convert';
import 'dart:typed_data';

import 'package:csv/csv.dart';
import 'package:excel/excel.dart';

import '../financial/money_utils.dart';
import '../models/account_model.dart';
import '../models/transaction_model.dart';

class ImportIssue {
  final String section;
  final int rowNumber;
  final String message;
  final bool blocking;

  const ImportIssue({
    required this.section,
    required this.rowNumber,
    required this.message,
    required this.blocking,
  });
}

class ImportAccountDraft {
  final int sourceRow;
  final String? externalRef;
  final String name;
  final String categoryName;
  final int openingBalanceMinor;
  final String? phone;
  final String? notes;
  final bool duplicate;

  const ImportAccountDraft({
    required this.sourceRow,
    required this.externalRef,
    required this.name,
    required this.categoryName,
    required this.openingBalanceMinor,
    required this.phone,
    required this.notes,
    required this.duplicate,
  });
}

class ImportTransactionDraft {
  final int sourceRow;
  final String accountRef;
  final EntryType entryType;
  final int amountMinor;
  final String date;
  final String description;
  final String? notes;
  final bool duplicate;

  const ImportTransactionDraft({
    required this.sourceRow,
    required this.accountRef,
    required this.entryType,
    required this.amountMinor,
    required this.date,
    required this.description,
    required this.notes,
    required this.duplicate,
  });
}

class LedgerImportPreview {
  final String sourceName;
  final List<ImportAccountDraft> accounts;
  final List<ImportTransactionDraft> transactions;
  final List<ImportIssue> issues;

  const LedgerImportPreview({
    required this.sourceName,
    required this.accounts,
    required this.transactions,
    required this.issues,
  });

  List<ImportIssue> get blockingIssues =>
      issues.where((issue) => issue.blocking).toList(growable: false);

  List<ImportIssue> get warnings =>
      issues.where((issue) => !issue.blocking).toList(growable: false);

  int get duplicateAccounts => accounts.where((row) => row.duplicate).length;
  int get duplicateTransactions =>
      transactions.where((row) => row.duplicate).length;

  int get importableAccounts => accounts.length - duplicateAccounts;
  int get importableTransactions => transactions.length - duplicateTransactions;

  bool get canCommit =>
      blockingIssues.isEmpty &&
      (importableAccounts > 0 || importableTransactions > 0);
}

class LedgerImportCommitResult {
  final int importedAccounts;
  final int skippedAccounts;
  final int importedTransactions;
  final int skippedTransactions;

  const LedgerImportCommitResult({
    required this.importedAccounts,
    required this.skippedAccounts,
    required this.importedTransactions,
    required this.skippedTransactions,
  });
}

class LedgerImportService {
  static const _accountExternalRef = [
    'externalref', 'externalid', 'reference', 'ref', 'المرجع', 'المعرفالخارجي'
  ];
  static const _accountName = [
    'name', 'accountname', 'اسم', 'اسمالحساب', 'الحساب'
  ];
  static const _category = [
    'category', 'categoryname', 'التصنيف', 'الفئة'
  ];
  static const _openingBalance = [
    'openingbalance', 'opening', 'openingamount', 'الرصيدالافتتاحي'
  ];
  static const _phone = ['phone', 'mobile', 'الهاتف', 'الجوال'];
  static const _notes = ['notes', 'note', 'ملاحظات', 'الملاحظات'];

  static const _accountRef = [
    'accountref', 'accountid', 'account', 'accountname',
    'مرجعالحساب', 'الحساب', 'اسمالحساب'
  ];
  static const _entryType = [
    'entrytype', 'direction', 'transactiontype', 'نوعالحركة', 'الاتجاه'
  ];
  static const _amount = ['amount', 'value', 'المبلغ', 'القيمة'];
  static const _date = ['date', 'transactiondate', 'التاريخ'];
  static const _description = [
    'description', 'statement', 'memo', 'البيان', 'الوصف'
  ];
  static const _recordType = ['recordtype', 'نوعالسجل'];

  static String _token(dynamic value) {
    return (value ?? '')
        .toString()
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'[\s_\-]+'), '');
  }

  static String _display(dynamic value) => (value ?? '').toString().trim();

  static String? _value(
    Map<String, String> row,
    List<String> aliases,
  ) {
    for (final alias in aliases) {
      final value = row[_token(alias)];
      if (value != null && value.trim().isNotEmpty) return value.trim();
    }
    return null;
  }

  static Map<String, String> _rowMap(
    List<dynamic> headers,
    List<dynamic> values,
  ) {
    final row = <String, String>{};
    for (var index = 0; index < headers.length; index++) {
      final key = _token(headers[index]);
      if (key.isEmpty) continue;
      row[key] = index < values.length ? _display(values[index]) : '';
    }
    return row;
  }

  static List<Map<String, String>> _tableToRows(List<List<dynamic>> table) {
    if (table.isEmpty) return const [];
    final headers = table.first;
    final result = <Map<String, String>>[];
    for (var index = 1; index < table.length; index++) {
      final values = table[index];
      if (values.every((cell) => _display(cell).isEmpty)) continue;
      result.add(_rowMap(headers, values));
    }
    return result;
  }

  static String _normalizeDate(String raw) {
    final value = raw.trim();
    final isoPrefix = RegExp(r'^\d{4}-\d{2}-\d{2}').firstMatch(value);
    return isoPrefix?.group(0) ?? value;
  }

  static EntryType? _parseEntryType(String raw) {
    final value = _token(raw);
    if (const {
      'owedbyaccount', 'owedby', 'receivable', 'لك', 'مستحقليك'
    }.contains(value)) {
      return EntryType.owedByAccount;
    }
    if (const {
      'owedtoaccount', 'owedto', 'payable', 'عليك', 'مستحقعليك'
    }.contains(value)) {
      return EntryType.owedToAccount;
    }
    return null;
  }

  static bool _sameTransaction({
    required String accountId,
    required EntryType entryType,
    required int amountMinor,
    required String date,
    required String description,
    required TransactionModel existing,
  }) {
    return existing.accountId == accountId &&
        existing.entryType == entryType &&
        existing.amountMinor == amountMinor &&
        existing.date == date &&
        existing.description.trim() == description.trim();
  }

  static Future<LedgerImportPreview> previewFile({
    required Uint8List bytes,
    required String fileName,
    required List<AccountModel> existingAccounts,
    required List<TransactionModel> existingTransactions,
  }) async {
    final lower = fileName.toLowerCase();
    if (lower.endsWith('.csv')) {
      final text = utf8.decode(bytes, allowMalformed: false);
      final table = const CsvToListConverter(shouldParseNumbers: false)
          .convert(text);
      final rows = _tableToRows(table);
      final accountRows = <Map<String, String>>[];
      final transactionRows = <Map<String, String>>[];

      final hasRecordType =
          rows.any((row) => _value(row, _recordType) != null);
      if (hasRecordType) {
        for (final row in rows) {
          final type = _token(_value(row, _recordType));
          if (const {'account', 'accounts', 'حساب', 'حسابات'}.contains(type)) {
            accountRows.add(row);
          } else if (const {
            'transaction', 'transactions', 'movement', 'حركة', 'حركات'
          }.contains(type)) {
            transactionRows.add(row);
          } else {
            transactionRows.add({
              ...row,
              '__invalidrecordtype': _value(row, _recordType) ?? '',
            });
          }
        }
      } else if (rows.isNotEmpty) {
        final sample = rows.first;
        final looksAccounts = _value(sample, _accountName) != null &&
            _value(sample, _category) != null;
        final looksTransactions = _value(sample, _accountRef) != null &&
            _value(sample, _entryType) != null &&
            _value(sample, _amount) != null;
        if (looksAccounts && !looksTransactions) {
          accountRows.addAll(rows);
        } else if (looksTransactions) {
          transactionRows.addAll(rows);
        } else {
          return LedgerImportPreview(
            sourceName: fileName,
            accounts: const [],
            transactions: const [],
            issues: const [
              ImportIssue(
                section: 'file',
                rowNumber: 1,
                message:
                    'تعذر تحديد نوع CSV. استخدم أعمدة الحسابات أو الحركات المعتمدة، '
                    'أو أضف عمود recordType.',
                blocking: true,
              ),
            ],
          );
        }
      }
      return previewFromRows(
        sourceName: fileName,
        accountRows: accountRows,
        transactionRows: transactionRows,
        existingAccounts: existingAccounts,
        existingTransactions: existingTransactions,
      );
    }

    if (lower.endsWith('.xlsx')) {
      final workbook = Excel.decodeBytes(bytes);
      final accountRows = <Map<String, String>>[];
      final transactionRows = <Map<String, String>>[];

      for (final entry in workbook.tables.entries) {
        final sheetToken = _token(entry.key);
        final rawRows = entry.value.rows
            .map((row) => row
                .map((cell) => cell?.value?.toString() ?? '')
                .toList(growable: false))
            .toList(growable: false);
        final rows = _tableToRows(rawRows);
        if (const {'accounts', 'account', 'الحسابات', 'حسابات'}
            .contains(sheetToken)) {
          accountRows.addAll(rows);
        } else if (const {
          'transactions', 'transaction', 'movements', 'الحركات', 'حركات'
        }.contains(sheetToken)) {
          transactionRows.addAll(rows);
        }
      }

      if (accountRows.isEmpty && transactionRows.isEmpty) {
        return LedgerImportPreview(
          sourceName: fileName,
          accounts: const [],
          transactions: const [],
          issues: const [
            ImportIssue(
              section: 'file',
              rowNumber: 1,
              message:
                  'ملف Excel يجب أن يحتوي ورقة Accounts/الحسابات '
                  'و/أو Transactions/الحركات.',
              blocking: true,
            ),
          ],
        );
      }

      return previewFromRows(
        sourceName: fileName,
        accountRows: accountRows,
        transactionRows: transactionRows,
        existingAccounts: existingAccounts,
        existingTransactions: existingTransactions,
      );
    }

    throw FormatException('صيغة الملف غير مدعومة. استخدم CSV أو XLSX.');
  }

  static LedgerImportPreview previewFromRows({
    required String sourceName,
    required List<Map<String, String>> accountRows,
    required List<Map<String, String>> transactionRows,
    required List<AccountModel> existingAccounts,
    required List<TransactionModel> existingTransactions,
  }) {
    final issues = <ImportIssue>[];
    final accounts = <ImportAccountDraft>[];
    final transactions = <ImportTransactionDraft>[];

    final existingByName = <String, AccountModel>{
      for (final account in existingAccounts) _token(account.name): account,
    };
    final importedNames = <String>{};
    final importedRefs = <String>{};

    for (var index = 0; index < accountRows.length; index++) {
      final row = accountRows[index];
      final rowNumber = index + 2;
      final name = _value(row, _accountName);
      final category = _value(row, _category);
      final rawOpening = _value(row, _openingBalance) ?? '0';
      final ref = _value(row, _accountExternalRef);
      final phone = _value(row, _phone);
      final notes = _value(row, _notes);

      if (name == null || name.trim().isEmpty) {
        issues.add(ImportIssue(
          section: 'accounts',
          rowNumber: rowNumber,
          message: 'اسم الحساب مطلوب.',
          blocking: true,
        ));
        continue;
      }
      if (category == null || category.trim().isEmpty) {
        issues.add(ImportIssue(
          section: 'accounts',
          rowNumber: rowNumber,
          message: 'تصنيف الحساب مطلوب.',
          blocking: true,
        ));
        continue;
      }

      final opening = MoneyUtils.toMinorUnits(rawOpening);
      if (!opening.success) {
        issues.add(ImportIssue(
          section: 'accounts',
          rowNumber: rowNumber,
          message: opening.error ?? 'الرصيد الافتتاحي غير صالح.',
          blocking: true,
        ));
        continue;
      }

      final normalizedName = _token(name);
      final normalizedRef = ref == null ? null : _token(ref);
      final duplicate = existingByName.containsKey(normalizedName) ||
          importedNames.contains(normalizedName) ||
          (normalizedRef != null &&
              normalizedRef.isNotEmpty &&
              importedRefs.contains(normalizedRef));

      if (duplicate) {
        issues.add(ImportIssue(
          section: 'accounts',
          rowNumber: rowNumber,
          message: 'الحساب مكرر وسيتم تجاهل صفه عند التنفيذ.',
          blocking: false,
        ));
      }

      importedNames.add(normalizedName);
      if (normalizedRef != null && normalizedRef.isNotEmpty) {
        importedRefs.add(normalizedRef);
      }

      accounts.add(ImportAccountDraft(
        sourceRow: rowNumber,
        externalRef: ref,
        name: name.trim(),
        categoryName: category.trim(),
        openingBalanceMinor: opening.minor,
        phone: phone,
        notes: notes,
        duplicate: duplicate,
      ));
    }

    final knownRefs = <String>{
      for (final account in existingAccounts) ...[
        _token(account.id),
        _token(account.name),
      ],
      for (final account in accounts) ...[
        _token(account.name),
        if (account.externalRef != null) _token(account.externalRef!),
      ],
    };

    final seenImportTransactions = <String>{};

    for (var index = 0; index < transactionRows.length; index++) {
      final row = transactionRows[index];
      final rowNumber = index + 2;

      if (row.containsKey('__invalidrecordtype')) {
        issues.add(ImportIssue(
          section: 'transactions',
          rowNumber: rowNumber,
          message: 'نوع السجل غير معروف: ${row['__invalidrecordtype']}',
          blocking: true,
        ));
        continue;
      }

      final accountRef = _value(row, _accountRef);
      final rawType = _value(row, _entryType);
      final rawAmount = _value(row, _amount);
      final rawDate = _value(row, _date);
      final description = _value(row, _description);
      final notes = _value(row, _notes);

      if (accountRef == null || !knownRefs.contains(_token(accountRef))) {
        issues.add(ImportIssue(
          section: 'transactions',
          rowNumber: rowNumber,
          message: 'مرجع الحساب غير موجود في البيانات الحالية أو صفوف الحسابات.',
          blocking: true,
        ));
        continue;
      }

      final entryType = rawType == null ? null : _parseEntryType(rawType);
      if (entryType == null) {
        issues.add(ImportIssue(
          section: 'transactions',
          rowNumber: rowNumber,
          message:
              'نوع الحركة مطلوب صراحةً: لك / عليك أو owedByAccount / owedToAccount.',
          blocking: true,
        ));
        continue;
      }

      final amount = MoneyUtils.toMinorUnits(rawAmount);
      if (!amount.success || amount.minor <= 0) {
        issues.add(ImportIssue(
          section: 'transactions',
          rowNumber: rowNumber,
          message: amount.error ?? 'مبلغ الحركة يجب أن يكون موجبًا.',
          blocking: true,
        ));
        continue;
      }

      if (rawDate == null) {
        issues.add(ImportIssue(
          section: 'transactions',
          rowNumber: rowNumber,
          message: 'تاريخ الحركة مطلوب.',
          blocking: true,
        ));
        continue;
      }
      final date = _normalizeDate(rawDate);
      if (!MoneyUtils.isValidDateString(date)) {
        issues.add(ImportIssue(
          section: 'transactions',
          rowNumber: rowNumber,
          message: 'التاريخ غير صالح. استخدم YYYY-MM-DD.',
          blocking: true,
        ));
        continue;
      }

      if (description == null || description.trim().isEmpty) {
        issues.add(ImportIssue(
          section: 'transactions',
          rowNumber: rowNumber,
          message: 'بيان الحركة مطلوب.',
          blocking: true,
        ));
        continue;
      }

      AccountModel? existingAccount;
      final normalizedAccountRef = _token(accountRef);
      for (final account in existingAccounts) {
        if (_token(account.id) == normalizedAccountRef ||
            _token(account.name) == normalizedAccountRef) {
          existingAccount = account;
          break;
        }
      }

      final signature =
          '$normalizedAccountRef|${entryType.name}|${amount.minor}|$date|${description.trim()}';
      var duplicate = !seenImportTransactions.add(signature);
      if (!duplicate && existingAccount != null) {
        duplicate = existingTransactions.any((existing) => _sameTransaction(
              accountId: existingAccount!.id,
              entryType: entryType,
              amountMinor: amount.minor,
              date: date,
              description: description.trim(),
              existing: existing,
            ));
      }

      if (duplicate) {
        issues.add(ImportIssue(
          section: 'transactions',
          rowNumber: rowNumber,
          message: 'الحركة مكررة وسيتم تجاهل صفها عند التنفيذ.',
          blocking: false,
        ));
      }

      transactions.add(ImportTransactionDraft(
        sourceRow: rowNumber,
        accountRef: accountRef.trim(),
        entryType: entryType,
        amountMinor: amount.minor,
        date: date,
        description: description.trim(),
        notes: notes,
        duplicate: duplicate,
      ));
    }

    return LedgerImportPreview(
      sourceName: sourceName,
      accounts: accounts,
      transactions: transactions,
      issues: issues,
    );
  }
}
