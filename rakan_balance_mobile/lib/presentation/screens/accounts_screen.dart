import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../domain/financial/money_utils.dart';
import '../../domain/models/account_model.dart';
import '../state/app_state_notifier.dart';

class AccountsScreen extends StatefulWidget {
  const AccountsScreen({super.key});

  @override
  State<AccountsScreen> createState() => _AccountsScreenState();
}

class _AccountsScreenState extends State<AccountsScreen> {
  String _searchQuery = '';

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppStateNotifier>();

    // Public Account Search: STRICTLY EXCLUDES AccountModel.notes from search query matching
    final filteredAccounts = state.accounts.where((acc) {
      if (_searchQuery.trim().isEmpty) return true;
      final q = _searchQuery.trim().toLowerCase();
      return acc.name.toLowerCase().contains(q); // Private notes intentionally excluded
    }).toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12.0),
          child: TextField(
            decoration: InputDecoration(
              hintText: 'بحث في أصحاب الحسابات...',
              prefixIcon: const Icon(Icons.search),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
            onChanged: (val) => setState(() => _searchQuery = val),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(children: [
            Expanded(child: FilledButton.icon(
              icon: const Icon(Icons.person_add_alt_1),
              label: const Text('إضافة حساب جديد'),
              onPressed: () => _showCreateAccountDialog(context),
            )),
          ]),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: filteredAccounts.isEmpty
              ? const Center(child: Text('لا توجد حسابات مطابقة'))
              : ListView.builder(
                  itemCount: filteredAccounts.length,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  itemBuilder: (context, index) {
                    final acc = filteredAccounts[index];
                    final balance = state.getAccountBalance(acc.id);
                    final isPositive = balance > 0;

                    return Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        title: Text(acc.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text(
                          acc.status == 'archived' ? 'مؤرشف' : 'نشط',
                          style: TextStyle(
                            color: acc.status == 'archived' ? Colors.grey : Colors.green,
                            fontSize: 12,
                          ),
                        ),
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              '${MoneyUtils.formatMinorAmount(balance)} ر.س',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                                color: balance == 0
                                    ? Colors.black
                                    : (isPositive ? Colors.green.shade700 : Colors.red.shade700),
                              ),
                            ),
                            Text(
                              balance > 0 ? 'لك' : (balance < 0 ? 'عليك' : 'متوازن'),
                              style: const TextStyle(fontSize: 11, color: Colors.grey),
                            ),
                          ],
                        ),
                        onTap: () => _showAccountDetailsModal(context, acc),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Future<void> _showCreateAccountDialog(BuildContext context) async {
    final state = context.read<AppStateNotifier>();
    final name = TextEditingController();
    final category = TextEditingController(text: 'عام');
    final opening = TextEditingController(text: '0.00');
    final notes = TextEditingController();
    var saving = false;
    String? error;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (ctx, refresh) => AlertDialog(
          title: const Text('إضافة حساب'),
          content: SingleChildScrollView(child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: name, decoration: const InputDecoration(labelText: 'اسم الحساب *')),
              TextField(controller: category, decoration: const InputDecoration(labelText: 'التصنيف *')),
              TextField(controller: opening, keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                decoration: const InputDecoration(labelText: 'الرصيد الافتتاحي بالريال')),
              TextField(controller: notes, maxLines: 2,
                decoration: const InputDecoration(labelText: 'ملاحظات خاصة')),
              if (error != null) Text(error!, style: const TextStyle(color: Colors.red)),
            ],
          )),
          actions: [
            TextButton(onPressed: saving ? null : () => Navigator.pop(ctx),
              child: const Text('إلغاء')),
            FilledButton(onPressed: saving ? null : () async {
              final parsed = MoneyUtils.toMinorUnits(opening.text);
              if (!parsed.success) { refresh(() => error = parsed.error); return; }
              refresh(() { saving = true; error = null; });
              try {
                await state.createAccount(name: name.text, categoryName: category.text,
                  openingBalanceMinor: parsed.minor, privateNotes: notes.text);
                if (ctx.mounted) Navigator.pop(ctx);
              } catch (e) {
                refresh(() => error = e.toString());
              } finally {
                refresh(() => saving = false);
              }
            }, child: const Text('حفظ')),
          ],
        ),
      ),
    );
    name.dispose();
    category.dispose();
    opening.dispose();
    notes.dispose();
  }

  void _showAccountDetailsModal(BuildContext context, AccountModel account) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            top: 20,
            left: 20,
            right: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'تفاصيل الحساب والملاحظات الخاصة: ${account.name}',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              const Text(
                'ملاحظات خاصة مكتومة (محفوظة محلياً وفي النسخ الاحتياطية ومستثناة تماماً من التقارير وكشوف الحسابات):',
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey.shade300),
                ),
                child: Text(
                  account.notes != null && account.notes!.isNotEmpty
                      ? account.notes!
                      : 'لا توجد ملاحظات خاصة لهذا الحساب.',
                ),
              ),
              const SizedBox(height: 16),
              Wrap(spacing: 8, children: [
                OutlinedButton.icon(
                  onPressed: () async {
                    Navigator.pop(ctx);
                    await _showEditAccountDialog(context, account);
                  },
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('تعديل'),
                ),
                OutlinedButton.icon(
                  onPressed: () async {
                    Navigator.pop(ctx);
                    try {
                      await context.read<AppStateNotifier>().setAccountArchived(
                        account.id, account.status != 'archived');
                    } catch (e) {
                      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(e.toString())));
                    }
                  },
                  icon: Icon(account.status == 'archived' ? Icons.unarchive : Icons.archive_outlined),
                  label: Text(account.status == 'archived' ? 'إلغاء الأرشفة' : 'أرشفة'),
                ),
                TextButton(onPressed: () => Navigator.pop(ctx),
                  child: const Text('إغلاق')),
              ]),
            ],
          ),
        );
      },
    );
  }  Future<void> _showEditAccountDialog(BuildContext context, AccountModel account) async {
    final state = context.read<AppStateNotifier>();
    final name = TextEditingController(text: account.name);
    final notes = TextEditingController(text: account.notes ?? '');
    String? error;
    var saving = false;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (ctx, refresh) => AlertDialog(
          title: const Text('تعديل الحساب والملاحظات الخاصة'),
          content: SingleChildScrollView(child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: name,
                decoration: const InputDecoration(labelText: 'اسم الحساب')),
              TextField(controller: notes, maxLines: 4,
                decoration: const InputDecoration(labelText: 'الملاحظات الخاصة')),
              if (error != null) Text(error!, style: const TextStyle(color: Colors.red)),
            ],
          )),
          actions: [
            TextButton(onPressed: saving ? null : () => Navigator.pop(ctx),
              child: const Text('إلغاء')),
            FilledButton(onPressed: saving ? null : () async {
              refresh(() { saving = true; error = null; });
              try {
                await state.updateAccount(accountId: account.id,
                  name: name.text, privateNotes: notes.text);
                if (ctx.mounted) Navigator.pop(ctx);
              } catch (e) {
                refresh(() => error = e.toString());
              } finally {
                refresh(() => saving = false);
              }
            }, child: const Text('حفظ')),
          ],
        ),
      ),
    );
    name.dispose();
    notes.dispose();
  }

}
