import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../domain/financial/inter_account_transfer_engine.dart';
import '../../domain/financial/money_utils.dart';
import '../../domain/models/transfer_model.dart';
import '../state/app_state_notifier.dart';
import '../../app/theme/app_colors.dart';

class TransferScreen extends StatefulWidget {
  const TransferScreen({super.key});

  @override
  State<TransferScreen> createState() => _TransferScreenState();
}

class _TransferScreenState extends State<TransferScreen> {
  String? _sourceAccountId;
  String? _destinationAccountId;
  final _amountController = TextEditingController();
  final _descController = TextEditingController();
  String _date = DateTime.now().toIso8601String().split('T')[0];
  String? _error;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppStateNotifier>();

    final activeAccounts = state.accounts.where((a) => a.status == 'active').toList();

    int? parsedMinor;
    if (_amountController.text.isNotEmpty) {
      final res = MoneyUtils.toMinorUnits(_amountController.text);
      if (res.success) parsedMinor = res.minor;
    }

    int? srcBalanceBefore;
    int? srcBalanceAfter;
    int? dstBalanceBefore;
    int? dstBalanceAfter;

    if (_sourceAccountId != null) {
      srcBalanceBefore = state.getAccountBalance(_sourceAccountId!);
      if (parsedMinor != null) {
        srcBalanceAfter = srcBalanceBefore - parsedMinor;
      }
    }

    if (_destinationAccountId != null) {
      dstBalanceBefore = state.getAccountBalance(_destinationAccountId!);
      if (parsedMinor != null) {
        dstBalanceAfter = dstBalanceBefore + parsedMinor;
      }
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'حركة بينية — نقل مديونية بين حسابين',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 4),
          const Text(
            'تحويل مديونية من حساب إلى آخر دون تغيير صافي المركز المالي للنظام.',
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

          // Source Account
          DropdownButtonFormField<String>(
            decoration: const InputDecoration(labelText: 'الحساب المصدر (الذي ينقل المديونية منه)'),
            initialValue: _sourceAccountId,
            items: activeAccounts.map((a) {
              return DropdownMenuItem(
                value: a.id,
                child: Text('${a.name} (${MoneyUtils.formatMinorAmount(state.getAccountBalance(a.id))} ر.س)'),
              );
            }).toList(),
            onChanged: (val) => setState(() => _sourceAccountId = val),
          ),
          const SizedBox(height: 12),

          // Destination Account
          DropdownButtonFormField<String>(
            decoration: const InputDecoration(labelText: 'الحساب الوجهة (الذي يُنقل المديونية إليه)'),
            initialValue: _destinationAccountId,
            items: activeAccounts.map((a) {
              return DropdownMenuItem(
                value: a.id,
                child: Text('${a.name} (${MoneyUtils.formatMinorAmount(state.getAccountBalance(a.id))} ر.س)'),
              );
            }).toList(),
            onChanged: (val) => setState(() => _destinationAccountId = val),
          ),
          const SizedBox(height: 12),

          // Amount
          TextField(
            controller: _amountController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'المبلغ المراد تحويله (بالريال)'),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 12),

          // Date
          TextField(
            decoration: const InputDecoration(labelText: 'تاريخ الحركة (YYYY-MM-DD)'),
            controller: TextEditingController(text: _date),
            onChanged: (val) => _date = val,
          ),
          const SizedBox(height: 12),

          // Description
          TextField(
            controller: _descController,
            decoration: const InputDecoration(labelText: 'وصف الحركة (اختياري)'),
          ),
          const SizedBox(height: 20),

          // Real-time Preview Box
          if (srcBalanceBefore != null && dstBalanceBefore != null && parsedMinor != null)
            Card(
              color: Colors.blue.shade50,
              child: Padding(
                padding: const EdgeInsets.all(12.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('معاينة أثر الحركة البينية:', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.blue)),
                    const SizedBox(height: 4),
                    Text('المصدر: ${MoneyUtils.formatMinorAmount(srcBalanceBefore)} → ${MoneyUtils.formatMinorAmount(srcBalanceAfter!)} ر.س'),
                    Text('الوجهة: ${MoneyUtils.formatMinorAmount(dstBalanceBefore)} → ${MoneyUtils.formatMinorAmount(dstBalanceAfter!)} ر.س'),
                    const Divider(),
                    const Text('أثر النظام الكلي: 0.00 ر.س (توازن تام)', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.green)),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 20),

          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.emerald600,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            onPressed: () async {
              setState(() => _error = null);
              final amountRes = MoneyUtils.toMinorUnits(_amountController.text);
              if (!amountRes.success) {
                setState(() => _error = amountRes.error);
                return;
              }

              final input = InterAccountTransferInput(
                sourceAccountId: _sourceAccountId ?? '',
                destinationAccountId: _destinationAccountId ?? '',
                amountMinor: amountRes.minor,
                date: _date,
                description: _descController.text,
              );

              final val = InterAccountTransferEngine.validateTransfer(
                input: input,
                accounts: state.accounts,
              );

              if (!val.isValid) {
                setState(() => _error = val.error);
                return;
              }

              try {
                await state.createTransfer(input);
                if (mounted) {
                  ScaffoldMessenger.of(this.context).showSnackBar(
                    const SnackBar(content: Text('تم تنفيذ الحركة البينية بنجاح في قاعدة البيانات.')),
                  );
                  _amountController.clear();
                  _descController.clear();
                }
              } catch (e) {
                setState(() => _error = e.toString());
              }
            },
            child: const Text('تأكيد تنفيذ الحركة البينية الذرية', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }
}
