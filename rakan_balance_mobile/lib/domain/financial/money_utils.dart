/// Utility class for strict integer money arithmetic in Halalas (Minor Units).
/// Preserves exact 1:1 financial rules from the web reference implementation (`src/domain/money.ts`).
class MoneyUtils {
  /// Maximum safe minor amount: 10,000,000,000,000 Halalas (100 Billion SAR).
  static const int maxSafeHalalas = 10000000000000;

  /// Validates date string format YYYY-MM-DD
  static bool isValidDateString(String dateStr) {
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(dateStr)) return false;
    try {
      final parsed = DateTime.parse('${dateStr}T00:00:00Z');
      final year = parsed.year.toString().padLeft(4, '0');
      final month = parsed.month.toString().padLeft(2, '0');
      final day = parsed.day.toString().padLeft(2, '0');
      return '$year-$month-$day' == dateStr;
    } catch (_) {
      return false;
    }
  }

  /// Converts decimal string or number to integer Halalas without IEEE 754 floating point issues.
  /// Rejects negative amounts, NaN, infinite, >2 decimal places, or amounts exceeding [maxSafeHalalas].
  static ({bool success, int minor, String? error}) toMinorUnits(dynamic amount) {
    if (amount == null) {
      return (success: false, minor: 0, error: 'المبلغ مطلوب ولا يمكن أن يكون فارغًا.');
    }

    String inputStr;
    if (amount is int) {
      if (amount < 0) return (success: false, minor: 0, error: 'المبلغ لا يمكن أن يكون سالباً.');
      inputStr = '$amount.00';
    } else if (amount is double) {
      if (amount.isNaN || amount.isInfinite || amount < 0) {
        return (success: false, minor: 0, error: 'المبلغ المدخل غير صالح أو غير معرف.');
      }
      inputStr = amount.toStringAsFixed(4);
    } else if (amount is String) {
      inputStr = amount.trim();
      if (inputStr.isEmpty) {
        return (success: false, minor: 0, error: 'المبلغ مطلوب ولا يمكن أن يكون فارغًا.');
      }
    } else {
      return (success: false, minor: 0, error: 'نوع المدخلات غير يدعم المعالجة المالية.');
    }

    // Direct String parsing to avoid double precision loss
    final parts = inputStr.split('.');
    if (parts.length > 2) {
      return (success: false, minor: 0, error: 'صيغة المبلغ غير صالحة.');
    }

    final integerPartStr = parts[0];
    if (integerPartStr.isEmpty || !RegExp(r'^\d+$').hasMatch(integerPartStr)) {
      return (success: false, minor: 0, error: 'صيغة المبلغ غير صالحة.');
    }

    String decimalPartStr = parts.length > 1 ? parts[1] : '00';
    if (decimalPartStr.length > 2) {
      // Check if truncated digits are non-zero
      final extraDigits = decimalPartStr.substring(2);
      if (int.tryParse(extraDigits) != null && int.parse(extraDigits) > 0) {
        return (success: false, minor: 0, error: 'المبلغ لا يمكن أن يحتوي على أكثر من منزلتين عشريتين (هللات).');
      }
      decimalPartStr = decimalPartStr.substring(0, 2);
    } else if (decimalPartStr.length == 1) {
      decimalPartStr = '${decimalPartStr}0';
    } else if (decimalPartStr.isEmpty) {
      decimalPartStr = '00';
    }

    final intPart = int.tryParse(integerPartStr);
    final decPart = int.tryParse(decimalPartStr);

    if (intPart == null || decPart == null) {
      return (success: false, minor: 0, error: 'صيغة المبلغ غير صالحة.');
    }

    final totalMinor = (intPart * 100) + decPart;

    if (totalMinor > maxSafeHalalas) {
      return (success: false, minor: 0, error: 'المبلغ يتجاوز الحد التشغيلي المعتمد (100 مليار ريال).');
    }

    return (success: true, minor: totalMinor, error: null);
  }

  /// Formats Halalas integer to display string with 2 decimal places (e.g. 15025 -> "150.25")
  static String formatMinorAmount(int minorUnits) {
    final absVal = minorUnits.abs();
    final riyals = absVal ~/ 100;
    final halalas = absVal % 100;
    final sign = minorUnits < 0 ? '-' : '';
    final halalasStr = halalas.toString().padLeft(2, '0');
    return '$sign$riyals.$halalasStr';
  }
}
