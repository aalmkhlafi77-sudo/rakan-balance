import '../models/account_model.dart';
import '../models/transaction_model.dart';
import 'money_utils.dart';

/// Export one account's ledger as UTF-8 CSV, using exact integer halalas.
/// Private account notes and transaction notes are deliberately excluded.
class AccountStatementCsv {
  static String _cell(String value) {
    // Quoting all text neutralizes separators and line breaks. Leading formula
    // operators are prefixed with a tab inside the quoted cell for Excel safety.
    final escapedFormula = RegExp(r'^[\s]*[=+@-]').hasMatch(value)
        ? '\t$value' : value;
    return '"${escapedFormula.replaceAll('"', '""')}"';
  }

  static String build({
    required AccountModel account,
    required Iterable<TransactionModel> transactions,
    Iterable<AccountModel> accounts = const [],
    String? fromDate,
    String? toDate,
  }) {
    final from = fromDate?.trim();
    final to = toDate?.trim();
    if (from != null && from.isNotEmpty && !MoneyUtils.isValidDateString(from)) {
      throw ArgumentError('تاريخ بداية كشف الحساب غير صالح.');
    }
    if (to != null && to.isNotEmpty && !MoneyUtils.isValidDateString(to)) {
      throw ArgumentError('تاريخ نهاية كشف الحساب غير صالح.');
    }
    if (from != null && from.isNotEmpty &&
        to != null && to.isNotEmpty && from.compareTo(to) > 0) {
      throw ArgumentError('تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.');
    }

    final all = transactions
        .where((tx) => tx.accountId == account.id)
        .toList()
      ..sort((a, b) {
        final byDate = a.date.compareTo(b.date);
        if (byDate != 0) return byDate;
        final byCreated = a.createdAt.compareTo(b.createdAt);
        if (byCreated != 0) return byCreated;
        return a.id.compareTo(b.id);
      });

    var opening = account.openingBalanceMinor;
    if (from != null && from.isNotEmpty) {
      for (final tx in all.where((tx) => tx.date.compareTo(from) < 0)) {
        opening += tx.signedAmountMinor;
      }
    }
    if (opening.abs() > MoneyUtils.maxSafeHalalas) {
      throw StateError('تجاوز رصيد أول الفترة الحد المالي المسموح به.');
    }

    final movements = all.where((tx) {
      final afterStart = from == null || from.isEmpty ||
          tx.date.compareTo(from) >= 0;
      final beforeEnd = to == null || to.isEmpty ||
          tx.date.compareTo(to) <= 0;
      return afterStart && beforeEnd;
    }).toList();

    final lines = <String>[
      ['الحساب', _cell(account.name)].join(','),
      ['رقم الحساب', _cell(account.id)].join(','),
      ['من', _cell(from == null || from.isEmpty ? 'بداية السجل' : from)].join(','),
      ['إلى', _cell(to == null || to.isEmpty ? 'نهاية السجل' : to)].join(','),
      'التاريخ,البيان,مدين (هللة),دائن (هللة),الرصيد (هللة),الرصيد (ريال)',
    ];

    var running = opening;
    var periodOwedBy = 0;
    var periodOwedTo = 0;
    lines.add([
      _cell(''),
      _cell('رصيد أول الفترة'),
      '0', '0', '$running', MoneyUtils.formatMinorAmount(running),
    ].join(','));

    for (final tx in movements) {
      final signed = tx.signedAmountMinor;
      running += signed;
      if (running.abs() > MoneyUtils.maxSafeHalalas) {
        throw StateError('تجاوز الرصيد الحد المالي المسموح به.');
      }
      if (signed > 0) {
        periodOwedBy += signed;
      } else {
        periodOwedTo += -signed;
      }
      var description = tx.description;
      if (tx.transferId != null && tx.counterpartyAccountId != null) {
        final counterpart = accounts.where(
          (candidate) => candidate.id == tx.counterpartyAccountId).toList();
        if (counterpart.isNotEmpty) {
          final relation = tx.transferRole == TransferRole.source
              ? 'نقل مديونية إلى: '
              : 'مديونية محولة من: ';
          description = '$description ($relation${counterpart.first.name})';
        }
      }
      lines.add([
        _cell(tx.date),
        _cell(description),
        '${signed > 0 ? signed : 0}',
        '${signed < 0 ? -signed : 0}',
        '$running',
        MoneyUtils.formatMinorAmount(running),
      ].join(','));
    }

    lines.add([
      _cell(''),
      _cell('إجمالي عليه خلال الفترة'),
      '$periodOwedBy', '0', '', '',
    ].join(','));
    lines.add([
      _cell(''),
      _cell('إجمالي له خلال الفترة'),
      '0', '$periodOwedTo', '', '',
    ].join(','));
    lines.add([
      _cell(''),
      _cell('رصيد آخر الفترة'),
      '0', '0', '$running', MoneyUtils.formatMinorAmount(running),
    ].join(','));
    return '\uFEFF${lines.join('\r\n')}\r\n';
  }
}
