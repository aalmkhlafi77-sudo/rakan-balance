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
  }) {
    final movements = transactions
        .where((tx) => tx.accountId == account.id)
        .toList()
      ..sort((a, b) {
        final byDate = a.date.compareTo(b.date);
        if (byDate != 0) return byDate;
        final byCreated = a.createdAt.compareTo(b.createdAt);
        if (byCreated != 0) return byCreated;
        return a.id.compareTo(b.id);
      });

    final lines = <String>[
      ['الحساب', _cell(account.name)].join(','),
      ['رقم الحساب', _cell(account.id)].join(','),
      'التاريخ,البيان,مدين (هللة),دائن (هللة),الرصيد (هللة),الرصيد (ريال)',
    ];
    var running = account.openingBalanceMinor;
    lines.add([
      _cell(''),
      _cell('الرصيد الافتتاحي'),
      '0', '0', '$running', MoneyUtils.formatMinorAmount(running),
    ].join(','));
    for (final tx in movements) {
      final signed = tx.signedAmountMinor;
      running += signed;
      if (running.abs() > MoneyUtils.maxSafeHalalas) {
        throw StateError('تجاوز الرصيد الحد المالي المسموح به.');
      }
      lines.add([
        _cell(tx.date),
        _cell(tx.description),
        '${signed > 0 ? signed : 0}',
        '${signed < 0 ? -signed : 0}',
        '$running',
        MoneyUtils.formatMinorAmount(running),
      ].join(','));
    }
    lines.add([
      _cell(''),
      _cell('الرصيد الختامي'),
      '0', '0', '$running', MoneyUtils.formatMinorAmount(running),
    ].join(','));
    return '\uFEFF${lines.join('\r\n')}\r\n';
  }
}
