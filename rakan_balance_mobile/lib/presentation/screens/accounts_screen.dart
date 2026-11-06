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
              ElevatedButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Center(child: Text('إغلاق')),
              ),
            ],
          ),
        );
      },
    );
  }
}
