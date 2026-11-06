import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../domain/financial/money_utils.dart';
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
  String _dueDate = DateTime.now().toIso8601String().split('T')[0];
  final _notesController = TextEditingController();
  String? _error;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppStateNotifier>();

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
                    value: _selectedAccountId,
                    items: state.accounts.where((a) => a.status == 'active').map((a) {
                      return DropdownMenuItem(value: a.id, child: Text(a.name));
                    }).toList(),
                    onChanged: (val) => setState(() => _selectedAccountId = val),
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<EntryType>(
                    decoration: const InputDecoration(labelText: 'نوع الاستحقاق'),
                    value: _entryType,
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
                    controller: TextEditingController(text: _dueDate),
                    onChanged: (val) => _dueDate = val,
                  ),
                  const SizedBox(height: 12),
                  ElevatedButton(
                    onPressed: () async {
                      setState(() => _error = null);
                      final parseRes = MoneyUtils.toMinorUnits(_amountController.text);
                      if (!parseRes.success || _selectedAccountId == null) {
                        setState(() => _error = parseRes.error ?? 'اختر حساباً ومبلغاً صالحاً.');
                        return;
                      }

                      try {
                        await state.createDue(
                          accountId: _selectedAccountId!,
                          entryType: _entryType,
                          dueDate: _dueDate,
                          amountMinor: parseRes.minor,
                          notes: _notesController.text,
                        );
                        _amountController.clear();
                        _notesController.clear();
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
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
          const Text('سجل الاستحقاقات القائمة', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 8),
          if (state.dues.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 20.0),
              child: Center(child: Text('لا توجد استحقاقات مسجلة')),
            )
          else
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: state.dues.length,
              itemBuilder: (context, index) {
                final due = state.dues[index];
                final acc = state.accounts.firstWhere((a) => a.id == due.accountId, orElse: () => state.accounts.first);

                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text('${acc.name} — ${due.dueDate}'),
                    subtitle: Text(
                      'الأصل: ${MoneyUtils.formatMinorAmount(due.originalAmountMinor)} | المتبقي: ${MoneyUtils.formatMinorAmount(due.remainingAmountMinor)} ر.س',
                    ),
                    trailing: due.remainingAmountMinor == 0
                        ? const Chip(label: Text('مسدد'), backgroundColor: Colors.greenAccent)
                        : TextButton(
                            onPressed: () => _showSettleModal(context, due.id, due.remainingAmountMinor),
                            child: const Text('تسجيل سداد'),
                          ),
                  ),
                );
              },
            ),
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
                if (!res.success || res.minor > maxMinor) {
                  ScaffoldMessenger.of(context).showSnackBar(
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
                if (mounted) {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
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
}
