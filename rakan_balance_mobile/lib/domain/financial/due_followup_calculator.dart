import 'money_utils.dart';
import '../models/account_model.dart';
import '../models/due_item_model.dart';
import '../models/transaction_model.dart';

enum DueUrgency {
  settled,
  overdue,
  dueToday,
  dueSoon,
  later,
}

class DueFollowUpItem {
  final DueItemModel due;
  final DueUrgency urgency;
  final int daysFromToday;
  final String agingLabel;

  const DueFollowUpItem({
    required this.due,
    required this.urgency,
    required this.daysFromToday,
    required this.agingLabel,
  });

  bool get isOpen => due.remainingAmountMinor > 0;
  bool get isOverdue => urgency == DueUrgency.overdue;
}

class DueFollowUpSummary {
  final int openCount;
  final int overdueCount;
  final int dueTodayCount;
  final int dueSoonCount;
  final int receivableRemainingMinor;
  final int payableRemainingMinor;
  final int overdueReceivableMinor;
  final int overduePayableMinor;

  const DueFollowUpSummary({
    required this.openCount,
    required this.overdueCount,
    required this.dueTodayCount,
    required this.dueSoonCount,
    required this.receivableRemainingMinor,
    required this.payableRemainingMinor,
    required this.overdueReceivableMinor,
    required this.overduePayableMinor,
  });
}

class DueFollowUpCalculator {
  static DateTime _dateOnly(DateTime date) =>
      DateTime.utc(date.year, date.month, date.day);

  static DateTime _parseDate(String date) {
    final parts = date.split('-');
    if (parts.length != 3) {
      throw FormatException('تاريخ الاستحقاق غير صالح: $date');
    }
    return DateTime.utc(
      int.parse(parts[0]),
      int.parse(parts[1]),
      int.parse(parts[2]),
    );
  }

  static DueFollowUpItem classify(
    DueItemModel due, {
    required DateTime today,
    int soonDays = 7,
  }) {
    if (due.remainingAmountMinor <= 0 || due.status == 'settled') {
      return DueFollowUpItem(
        due: due,
        urgency: DueUrgency.settled,
        daysFromToday: 0,
        agingLabel: 'مسدد',
      );
    }

    final base = _dateOnly(today);
    final dueDate = _parseDate(due.dueDate);
    final delta = dueDate.difference(base).inDays;

    if (delta < 0) {
      final overdueDays = -delta;
      final label = overdueDays <= 30
          ? 'متأخر 1–30 يوم'
          : overdueDays <= 60
              ? 'متأخر 31–60 يوم'
              : overdueDays <= 90
                  ? 'متأخر 61–90 يوم'
                  : 'متأخر أكثر من 90 يوم';
      return DueFollowUpItem(
        due: due,
        urgency: DueUrgency.overdue,
        daysFromToday: delta,
        agingLabel: label,
      );
    }

    if (delta == 0) {
      return DueFollowUpItem(
        due: due,
        urgency: DueUrgency.dueToday,
        daysFromToday: 0,
        agingLabel: 'مستحق اليوم',
      );
    }

    if (delta <= soonDays) {
      return DueFollowUpItem(
        due: due,
        urgency: DueUrgency.dueSoon,
        daysFromToday: delta,
        agingLabel: 'قريب خلال $delta يوم',
      );
    }

    return DueFollowUpItem(
      due: due,
      urgency: DueUrgency.later,
      daysFromToday: delta,
      agingLabel: 'لاحق بعد $delta يوم',
    );
  }

  static List<DueFollowUpItem> buildItems(
    Iterable<DueItemModel> dues, {
    required DateTime today,
    int soonDays = 7,
  }) {
    final items = dues
        .map((due) => classify(due, today: today, soonDays: soonDays))
        .toList();
    items.sort((a, b) {
      if (a.urgency == DueUrgency.settled &&
          b.urgency != DueUrgency.settled) {
        return 1;
      }
      if (b.urgency == DueUrgency.settled &&
          a.urgency != DueUrgency.settled) {
        return -1;
      }
      final byDate = a.due.dueDate.compareTo(b.due.dueDate);
      if (byDate != 0) return byDate;
      return a.due.id.compareTo(b.due.id);
    });
    return items;
  }

  static DueFollowUpSummary summarize(
    Iterable<DueItemModel> dues, {
    required DateTime today,
    int soonDays = 7,
  }) {
    var openCount = 0;
    var overdueCount = 0;
    var dueTodayCount = 0;
    var dueSoonCount = 0;
    var receivable = 0;
    var payable = 0;
    var overdueReceivable = 0;
    var overduePayable = 0;

    for (final due in dues) {
      final item = classify(due, today: today, soonDays: soonDays);
      if (!item.isOpen) continue;
      openCount++;
      final amount = due.remainingAmountMinor;
      if (due.entryType == EntryType.owedByAccount) {
        receivable += amount;
      } else {
        payable += amount;
      }
      if (item.urgency == DueUrgency.overdue) {
        overdueCount++;
        if (due.entryType == EntryType.owedByAccount) {
          overdueReceivable += amount;
        } else {
          overduePayable += amount;
        }
      } else if (item.urgency == DueUrgency.dueToday) {
        dueTodayCount++;
      } else if (item.urgency == DueUrgency.dueSoon) {
        dueSoonCount++;
      }
    }

    return DueFollowUpSummary(
      openCount: openCount,
      overdueCount: overdueCount,
      dueTodayCount: dueTodayCount,
      dueSoonCount: dueSoonCount,
      receivableRemainingMinor: receivable,
      payableRemainingMinor: payable,
      overdueReceivableMinor: overdueReceivable,
      overduePayableMinor: overduePayable,
    );
  }

  static String reminderTemplate({
    required String template,
    required DueItemModel due,
    required AccountModel? account,
  }) {
    final name = account?.name ?? 'الحساب';
    final riyals = MoneyUtils.formatMinorAmount(due.remainingAmountMinor);
    final direction = due.entryType == EntryType.owedByAccount
        ? 'المستحق لنا'
        : 'المستحق علينا';

    switch (template) {
      case 'friendly':
        return 'تذكير ودي بشأن $direction على $name بمبلغ $riyals ر.س، '
            'موعد الاستحقاق ${due.dueDate}.';
      case 'dueDate':
        return 'تذكير بموعد الاستحقاق ${due.dueDate} للحساب $name، '
            'والمبلغ المتبقي $riyals ر.س.';
      case 'settlement':
        return 'متابعة سداد الاستحقاق للحساب $name. '
            'المتبقي $riyals ر.س من استحقاق بتاريخ ${due.dueDate}.';
      default:
        throw ArgumentError('قالب التذكير غير معروف.');
    }
  }
}
