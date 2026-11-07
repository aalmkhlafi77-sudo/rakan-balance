import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../domain/financial/money_utils.dart';
import '../../domain/financial/due_followup_calculator.dart';
import '../../domain/models/transaction_model.dart';
import '../state/app_state_notifier.dart';

class DuesScreen extends StatefulWidget {
  const DuesScreen({super.key});

  @override
  State<DuesScreen> createState() => _DuesScreenState();
}

class _DuesScreenState extends State<DuesScreen> {
  String? _selectedAccountId;
  EntryType _entryType = EntryType.owedByAccount;
  final _amountController = TextEditingController();
  final _dueDateController = TextEditingController(text: DateTime.now().toIso8601String().split('T')[0]);
  final _notesController = TextEditingController();
  String? _error;
  String _dueFilter = 'open';

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppStateNotifier>();
    final today = DateTime.now();
    final followUpItems = DueFollowUpCalculator.buildItems(
      state.dues,
      today: today,
    );
    final followUpSummary = DueFollowUpCalculator.summarize(
      state.dues,
      today: today,
    );
    final visibleDues = followUpItems.where((item) {
      switch (_dueFilter) {
        case 'overdue':
          return item.urgency == DueUrgency.overdue;
        case 'soon':
          return item.urgency == DueUrgency.dueToday ||
              item.urgency == DueUrgency.dueSoon;
        case 'settled':
          return item.urgency == DueUrgency.settled;
        case 'all':
          return true;
        case 'open':
        default:
          return item.isOpen;
      }
    }).toList();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'الاستحقاقات والسداد والتذكيرات',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const Text(
            'إنشاء الاستحقاق أو التذكير هو سجل متابعة ولا يغير الأرصدة المالية.',
            style: TextStyle(color: Colors.grey, fontSize: 12),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'ملخص المتابعة — لا يُضاف إلى الأرصدة المالية',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      Chip(
                        label: Text('قائم: ${followUpSummary.openCount}'),
                      ),
                      Chip(
                        label: Text('متأخر: ${followUpSummary.overdueCount}'),
                      ),
                      Chip(
                        label: Text(
                          'اليوم: ${followUpSummary.dueTodayCount}',
                        ),
                      ),
                      Chip(
                        label: Text(
                          'قريب 7 أيام: ${followUpSummary.dueSoonCount}',
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'متبقي مستحق لك: '
                    '${MoneyUtils.formatMinorAmount(followUpSummary.receivableRemainingMinor)} ر.س'
                    ' • متبقي مستحق عليك: '
                    '${MoneyUtils.formatMinorAmount(followUpSummary.payableRemainingMinor)} ر.س',
                    style: const TextStyle(fontSize: 12),
                  ),
                  if (followUpSummary.overdueCount > 0)
                    Text(
                      'متأخر لك: '
                      '${MoneyUtils.formatMinorAmount(followUpSummary.overdueReceivableMinor)} ر.س'
                      ' • متأخر عليك: '
                      '${MoneyUtils.formatMinorAmount(followUpSummary.overduePayableMinor)} ر.س',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.red.shade700,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          if (_error != null)
            Container(
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(8)),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            ),

          // Create Due Card
          Card(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('إضافة استحقاق قائم للمتابعة', style: TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    decoration: const InputDecoration(labelText: 'الحساب'),
                    initialValue: _selectedAccountId,
                    items: state.accounts.where((a) => a.status == 'active').map((a) {
                      return DropdownMenuItem(value: a.id, child: Text(a.name));
                    }).toList(),
                    onChanged: (val) => setState(() => _selectedAccountId = val),
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<EntryType>(
                    decoration: const InputDecoration(labelText: 'نوع الاستحقاق'),
                    initialValue: _entryType,
                    items: const [
                      DropdownMenuItem(value: EntryType.owedByAccount, child: Text('مستحق لك')),
                      DropdownMenuItem(value: EntryType.owedToAccount, child: Text('مستحق عليك')),
                    ],
                    onChanged: (val) => setState(() => _entryType = val!),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _amountController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(labelText: 'المبلغ (بالريال)'),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    decoration: const InputDecoration(labelText: 'تاريخ الاستحقاق (YYYY-MM-DD)'),
                    controller: _dueDateController,
                  ),
                  const SizedBox(height: 12),
                  ElevatedButton(
                    onPressed: () async {
                      setState(() => _error = null);
                      final parseRes = MoneyUtils.toMinorUnits(_amountController.text);
                      if (!parseRes.success || parseRes.minor <= 0 || _selectedAccountId == null) {
                        setState(() => _error = parseRes.error ?? 'اختر حساباً ومبلغاً صالحاً.');
                        return;
                      }

                      try {
                        await state.createDue(
                          accountId: _selectedAccountId!,
                          entryType: _entryType,
                          dueDate: _dueDateController.text,
                          amountMinor: parseRes.minor,
                          notes: _notesController.text,
                        );
                        _amountController.clear();
                        _notesController.clear();
                        if (mounted) {
                          ScaffoldMessenger.of(this.context).showSnackBar(
                            const SnackBar(content: Text('تم تسجيل الاستحقاق بنجاح دون حركة مالية.')),
                          );
                        }
                      } catch (e) {
                        setState(() => _error = e.toString());
                      }
                    },
                    child: const Text('حفظ الاستحقاق'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Dues List
          const Text('سجل الاستحقاقات', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'open', label: Text('قائم')),
                ButtonSegment(value: 'overdue', label: Text('متأخر')),
                ButtonSegment(value: 'soon', label: Text('قريب')),
                ButtonSegment(value: 'settled', label: Text('مسدد')),
                ButtonSegment(value: 'all', label: Text('الكل')),
              ],
              selected: {_dueFilter},
              onSelectionChanged: (values) {
                setState(() => _dueFilter = values.first);
              },
            ),
          ),
          const SizedBox(height: 8),
          if (visibleDues.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 20.0),
              child: Center(child: Text('لا توجد استحقاقات مسجلة')),
            )
          else
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: visibleDues.length,
              itemBuilder: (context, index) {
                final followUp = visibleDues[index];
                final due = followUp.due;
                final accountMatches = state.accounts.where((a) => a.id == due.accountId);
                final accountName = accountMatches.isEmpty ? 'حساب مفقود' : accountMatches.first.name;

                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text('$accountName — ${due.dueDate}'),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'الأصل: ${MoneyUtils.formatMinorAmount(due.originalAmountMinor)}'
                          ' | المتبقي: ${MoneyUtils.formatMinorAmount(due.remainingAmountMinor)} ر.س',
                        ),
                        const SizedBox(height: 3),
                        Text(
                          followUp.agingLabel,
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            color: followUp.urgency == DueUrgency.overdue
                                ? Colors.red.shade700
                                : followUp.urgency == DueUrgency.dueToday
                                    ? Colors.orange.shade800
                                    : followUp.urgency == DueUrgency.dueSoon
                                        ? Colors.amber.shade800
                                        : Colors.grey.shade700,
                          ),
                        ),
                      ],
                    ),
                    trailing: PopupMenuButton<String>(
                      onSelected: (action) {
                        if (action == 'settle' && due.remainingAmountMinor > 0) {
                          _showSettleModal(context, due.id, due.remainingAmountMinor);
                        }
                        if (action == 'remind') _showReminderDialog(context, due.id);
                        if (action == 'delete' && due.settledAmountMinor == 0) {
                          _deleteUnpaidDue(context, due.id);
                        }
                      },
                      itemBuilder: (_) => [
                        if (due.remainingAmountMinor > 0)
                          const PopupMenuItem(value: 'settle', child: Text('تسجيل سداد')),
                        const PopupMenuItem(value: 'remind', child: Text('إضافة تذكير')),
                        if (due.settledAmountMinor == 0)
                          const PopupMenuItem(value: 'delete', child: Text('حذف الاستحقاق غير المسدد')),
                      ],
                    ),
                  ),
                );
              },
            ),
          const SizedBox(height: 20),
          const Text('التذكيرات اليدوية', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 8),
          if (state.reminders.isEmpty)
            const Text('لا توجد تذكيرات مسجلة')
          else
            ...state.reminders.map((reminder) => Card(
              child: CheckboxListTile(
                title: Text(reminder.templateText),
                subtitle: Text(reminder.remindAt),
                value: reminder.isCompleted,
                secondary: IconButton(
                  icon: const Icon(Icons.delete_outline),
                  tooltip: 'حذف التذكير',
                  onPressed: () async {
                    try { await state.deleteReminder(reminder.id); }
                    catch (e) {
                      if (mounted) {
                        ScaffoldMessenger.of(this.context).showSnackBar(
                          SnackBar(content: Text('تعذر حذف التذكير: $e')));
                      }
                    }
                  },
                ),
                onChanged: (value) async {
                  try { await state.setReminderCompleted(reminder.id, value ?? false); }
                  catch (e) {
                    if (mounted) {
                      ScaffoldMessenger.of(this.context).showSnackBar(
                        SnackBar(content: Text('تعذر تحديث التذكير: $e')));
                    }
                  }
                },
              ),
            )),
        ],
      ),
    );
  }

  void _showSettleModal(BuildContext context, String dueId, int maxMinor) {
    final payController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('تسجيل سداد جزئي أو كامل'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('المتبقي للاستحقاق: ${MoneyUtils.formatMinorAmount(maxMinor)} ر.س'),
              const SizedBox(height: 8),
              TextField(
                controller: payController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'مبلغ الدفعة بالريال'),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
            ElevatedButton(
              onPressed: () async {
                final res = MoneyUtils.toMinorUnits(payController.text);
                if (!res.success || res.minor <= 0 || res.minor > maxMinor) {
                  ScaffoldMessenger.of(this.context).showSnackBar(
                    const SnackBar(content: Text('المبلغ المدخل غير صالح أو يتجاوز المتبقي.')),
                  );
                  return;
                }
                final state = context.read<AppStateNotifier>();
                await state.settleDue(
                  dueId: dueId,
                  amountMinor: res.minor,
                  date: DateTime.now().toIso8601String().split('T')[0],
                );
                if (mounted && ctx.mounted) {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(this.context).showSnackBar(
                    const SnackBar(content: Text('تم تسجيل حركة سداد واحدة بنجاح.')),
                  );
                }
              },
              child: const Text('تأكيد السداد'),
            ),
          ],
        );
      },
    );
  }
  Future<void> _deleteUnpaidDue(BuildContext context, String dueId) async {
    final state = context.read<AppStateNotifier>();
    final accepted = await showDialog<bool>(context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('حذف استحقاق غير مسدد'),
        content: const Text('سيُحذف الاستحقاق وتذكيراته دون تغيير الأرصدة المالية.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('حذف')),
        ]));
    if (accepted != true) return;
    try { await state.deleteUnpaidDue(dueId); }
    catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تعذر الحذف: $e')));
      }
    }
  }

  Future<void> _showReminderDialog(BuildContext context, String dueId) async {
    final state = context.read<AppStateNotifier>();
    final dueMatches = state.dues.where((item) => item.id == dueId).toList();
    if (dueMatches.isEmpty) return;
    final due = dueMatches.single;
    final accountMatches =
        state.accounts.where((account) => account.id == due.accountId).toList();
    final account = accountMatches.isEmpty ? null : accountMatches.single;
    final today = DateTime.now().toIso8601String().split('T').first;
    final initialReminderDate =
        due.dueDate.compareTo(today) >= 0 ? due.dueDate : today;
    final date = TextEditingController(text: initialReminderDate);
    var template = 'friendly';
    final message = TextEditingController(
      text: DueFollowUpCalculator.reminderTemplate(
        template: template,
        due: due,
        account: account,
      ),
    );
    String? error;
    var saving = false;
    await showDialog<void>(context: context,
      builder: (_) => StatefulBuilder(
        builder: (ctx, refresh) => AlertDialog(
          title: const Text('إضافة تذكير يدوي'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              DropdownButtonFormField<String>(
                initialValue: template,
                decoration: const InputDecoration(labelText: 'قالب التذكير'),
                items: const [
                  DropdownMenuItem(
                    value: 'friendly',
                    child: Text('متابعة ودية'),
                  ),
                  DropdownMenuItem(
                    value: 'dueDate',
                    child: Text('تذكير بموعد الاستحقاق'),
                  ),
                  DropdownMenuItem(
                    value: 'settlement',
                    child: Text('متابعة السداد'),
                  ),
                ],
                onChanged: (value) {
                  if (value == null) return;
                  refresh(() {
                    template = value;
                    message.text = DueFollowUpCalculator.reminderTemplate(
                      template: template,
                      due: due,
                      account: account,
                    );
                  });
                },
              ),
              TextField(controller: date,
                decoration: const InputDecoration(labelText: 'تاريخ التذكير YYYY-MM-DD')),
              TextField(
                controller: message,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'نص التذكير قابل للتعديل'),
              ),
              if (error != null) Text(error!, style: const TextStyle(color: Colors.red)),
            ]),
          ),
          actions: [
            TextButton(onPressed: saving ? null : () => Navigator.pop(ctx),
              child: const Text('إلغاء')),
            FilledButton(onPressed: saving ? null : () async {
              refresh(() { saving = true; error = null; });
              try {
                await state.createReminder(dueId: dueId,
                  remindAt: date.text, templateText: message.text);
                if (ctx.mounted) Navigator.pop(ctx);
              } catch (e) {
                if (ctx.mounted) refresh(() => error = e.toString());
              } finally {
                if (ctx.mounted) refresh(() => saving = false);
              }
            }, child: const Text('حفظ')),
          ],
        )));
    date.dispose();
    message.dispose();
  }

  @override
  void dispose() {
    _amountController.dispose();
    _notesController.dispose();
    _dueDateController.dispose();
    super.dispose();
  }

}
