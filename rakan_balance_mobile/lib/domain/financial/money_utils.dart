/// Exact base-10 money parsing aligned to the TypeScript web domain.
/// Signed values are supported at the DOMAIN layer (opening balances may be negative).
/// Transaction/transfer validators independently require strictly positive amounts.
class MoneyUtils {
  static const int maxSafeHalalas = 10000000000000;

  static bool isValidDateString(String dateStr) {
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(dateStr)) return false;
    try {
      final parsed = DateTime.parse('${dateStr}T00:00:00Z');
      return '${parsed.year.toString().padLeft(4, '0')}-${parsed.month.toString().padLeft(2, '0')}-${parsed.day.toString().padLeft(2, '0')}' == dateStr;
    } catch (_) {
      return false;
    }
  }

  /// Parse decimal input without floating-point arithmetic or rounding.
  /// Fractional digits beyond two are rejected even when they are zero.
  static ({bool success, int minor, String? error}) toMinorUnits(dynamic amount) {
    if (amount == null) {
      return (success: false, minor: 0, error: 'المبلغ غير محدد.');
    }
    if (amount is! String && amount is! num) {
      return (success: false, minor: 0, error: 'نوع بيانات المبلغ غير مدعوم.');
    }
    if (amount is double && !amount.isFinite) {
      return (success: false, minor: 0, error: 'المبلغ الرقمي غير صالح.');
    }

    final input = amount.toString().trim();
    if (!RegExp(r'^-?\d+(\.\d{1,2})?$').hasMatch(input)) {
      return (success: false, minor: 0, error: 'تنسيق المبلغ غير صالح؛ الحد الأقصى منزلتان عشريتان.');
    }

    final negative = input.startsWith('-');
    final raw = negative ? input.substring(1) : input;
    final parts = raw.split('.');
    final whole = BigInt.parse(parts[0]);
    final fractional = parts.length == 1
        ? 0
        : int.parse(parts[1].padRight(2, '0'));
    final value = whole * BigInt.from(100) + BigInt.from(fractional);
    if (value > BigInt.from(maxSafeHalalas)) {
      return (success: false, minor: 0, error: 'المبلغ يتجاوز الحد التشغيلي المعتمد.');
    }
    final minor = value.toInt() * (negative ? -1 : 1);
    return (success: true, minor: minor, error: null);
  }

  static String formatMinorAmount(int minorUnits) {
    final absVal = minorUnits.abs();
    final riyals = absVal ~/ 100;
    final halalas = absVal % 100;
    final sign = minorUnits < 0 ? '-' : '';
    return '$sign$riyals.${halalas.toString().padLeft(2, '0')}';
  }
}
