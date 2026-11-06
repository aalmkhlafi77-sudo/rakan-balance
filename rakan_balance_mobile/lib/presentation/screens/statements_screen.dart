import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../domain/financial/money_utils.dart';
import '../state/app_state_notifier.dart';

class StatementsScreen extends StatefulWidget {
  const StatementsScreen({super.key});

  @override
  State<StatementsScreen> createState() => _StatementsScreenState();
}

class _StatementsScreenState extends State<StatementsScreen> {
  String? _selectedAccountId;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppStateNotifier>();

    final selectedAcc = state.accounts.firstWhere(
      (a) => a.id == _selectedAccountId,
      orElse: () => AccountModelStub.dummy,
    );

    final accTxs = state.transactions.where((t) => t.accountId == _selectedAccountId).toList();

    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('كشف الحساب والتقارير التفصيلية', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            decoration: const InputDecoration(labelText: 'اختر الحساب لاستعراض كشف الحساب'),
            value: _selectedAccountId,
            items: state.accounts.map((a) {
              return DropdownMenuItem(value: a.id, child: Text(a.name));
            }).toList(),
            onChanged: (val) => setState(() => _selectedAccountId = val),
          ),
          const SizedBox(height: 16),
          if (_selectedAccountId != null && selectedAcc.id.isNotEmpty) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12.0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('الرصيد الحالي:', style: TextStyle(fontWeight: FontWeight.bold)),
                    Text(
                      '${MoneyUtils.formatMinorAmount(state.getAccountBalance(selectedAcc.id))} ر.س',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Colors.blue),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: accTxs.isEmpty
                  ? const Center(child: Text('لا توجد حركات مسجلة لهذا الحساب'))
                  : ListView.builder(
                      itemCount: accTxs.length,
                      itemBuilder: (context, index) {
                        final tx = accTxs[index];
                        final isOwedBy = tx.signedAmountMinor > 0;
                        return Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: ListTile(
                            title: Text(tx.description),
                            subtitle: Text(tx.date),
                            trailing: Text(
                              '${isOwedBy ? '+' : ''}${MoneyUtils.formatMinorAmount(tx.signedAmountMinor)} ر.س',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: isOwedBy ? Colors.green : Colors.red,
                              ),
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ],
      ),
    );
  }
}

class AccountModelStub {
  static final dummy = AccountModelStub();
  final String id = '';
}
