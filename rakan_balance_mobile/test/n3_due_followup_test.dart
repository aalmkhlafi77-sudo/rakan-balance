import 'package:flutter_test/flutter_test.dart';
import 'package:rakan_balance_mobile/domain/financial/due_followup_calculator.dart';
import 'package:rakan_balance_mobile/domain/models/account_model.dart';
import 'package:rakan_balance_mobile/domain/models/due_item_model.dart';
import 'package:rakan_balance_mobile/domain/models/transaction_model.dart';

DueItemModel due({
  required String id,
  required String dueDate,
  required EntryType entryType,
  int original = 10000,
  int settled = 0,
  String status = 'pending',
}) =>
    DueItemModel(
      id: id,
      accountId: 'acc',
      entryType: entryType,
      dueDate: dueDate,
      originalAmountMinor: original,
      settledAmountMinor: settled,
      status: status,
      createdAt: '',
      updatedAt: '',
    );

void main() {
  final today = DateTime.utc(2026, 11, 7);

  test('classifies overdue aging buckets and near dates deterministically', () {
    expect(
      DueFollowUpCalculator.classify(
        due(
          id: 'a',
          dueDate: '2026-11-06',
          entryType: EntryType.owedByAccount,
        ),
        today: today,
      ).agingLabel,
      'متأخر 1–30 يوم',
    );
    expect(
      DueFollowUpCalculator.classify(
        due(
          id: 'b',
          dueDate: '2026-10-01',
          entryType: EntryType.owedByAccount,
        ),
        today: today,
      ).agingLabel,
      'متأخر 31–60 يوم',
    );
    expect(
      DueFollowUpCalculator.classify(
        due(
          id: 'c',
          dueDate: '2026-08-20',
          entryType: EntryType.owedByAccount,
        ),
        today: today,
      ).agingLabel,
      'متأخر 61–90 يوم',
    );
    expect(
      DueFollowUpCalculator.classify(
        due(
          id: 'd',
          dueDate: '2026-07-01',
          entryType: EntryType.owedByAccount,
        ),
        today: today,
      ).agingLabel,
      'متأخر أكثر من 90 يوم',
    );
    expect(
      DueFollowUpCalculator.classify(
        due(
          id: 'today',
          dueDate: '2026-11-07',
          entryType: EntryType.owedByAccount,
        ),
        today: today,
      ).urgency,
      DueUrgency.dueToday,
    );
    expect(
      DueFollowUpCalculator.classify(
        due(
          id: 'soon',
          dueDate: '2026-11-12',
          entryType: EntryType.owedByAccount,
        ),
        today: today,
      ).urgency,
      DueUrgency.dueSoon,
    );
    expect(
      DueFollowUpCalculator.classify(
        due(
          id: 'later',
          dueDate: '2026-11-20',
          entryType: EntryType.owedByAccount,
        ),
        today: today,
      ).urgency,
      DueUrgency.later,
    );
  });

  test('summary separates receivable/payable follow-up without netting balances', () {
    final summary = DueFollowUpCalculator.summarize(
      [
        due(
          id: 'overdue-receivable',
          dueDate: '2026-11-01',
          entryType: EntryType.owedByAccount,
          original: 12000,
          settled: 2000,
          status: 'partially_settled',
        ),
        due(
          id: 'today-payable',
          dueDate: '2026-11-07',
          entryType: EntryType.owedToAccount,
          original: 7000,
        ),
        due(
          id: 'soon-receivable',
          dueDate: '2026-11-10',
          entryType: EntryType.owedByAccount,
          original: 3000,
        ),
        due(
          id: 'settled',
          dueDate: '2026-10-01',
          entryType: EntryType.owedToAccount,
          original: 9999,
          settled: 9999,
          status: 'settled',
        ),
      ],
      today: today,
    );

    expect(summary.openCount, 3);
    expect(summary.overdueCount, 1);
    expect(summary.dueTodayCount, 1);
    expect(summary.dueSoonCount, 1);
    expect(summary.receivableRemainingMinor, 13000);
    expect(summary.payableRemainingMinor, 7000);
    expect(summary.overdueReceivableMinor, 10000);
    expect(summary.overduePayableMinor, 0);
  });

  test('settled dues sort after open dues', () {
    final items = DueFollowUpCalculator.buildItems(
      [
        due(
          id: 'settled',
          dueDate: '2026-01-01',
          entryType: EntryType.owedByAccount,
          original: 100,
          settled: 100,
          status: 'settled',
        ),
        due(
          id: 'open',
          dueDate: '2026-12-01',
          entryType: EntryType.owedByAccount,
        ),
      ],
      today: today,
    );

    expect(items.first.due.id, 'open');
    expect(items.last.due.id, 'settled');
  });

  test('reminder templates use exact minor-unit formatting and account context', () {
    final account = AccountModel(
      id: 'acc',
      name: 'أحمد',
      categoryId: 'c',
      openingBalanceMinor: 0,
      createdAt: '',
      updatedAt: '',
    );
    final item = due(
      id: 'due',
      dueDate: '2026-11-15',
      entryType: EntryType.owedByAccount,
      original: 12550,
      settled: 50,
      status: 'partially_settled',
    );

    final text = DueFollowUpCalculator.reminderTemplate(
      template: 'friendly',
      due: item,
      account: account,
    );

    expect(text, contains('أحمد'));
    expect(text, contains('125.00 ر.س'));
    expect(text, contains('2026-11-15'));
  });

  test('invalid calendar dates are rejected instead of normalized', () {
    expect(
      () => DueFollowUpCalculator.classify(
        due(
          id: 'bad',
          dueDate: '2026-02-31',
          entryType: EntryType.owedByAccount,
        ),
        today: today,
      ),
      throwsFormatException,
    );
  });
}
