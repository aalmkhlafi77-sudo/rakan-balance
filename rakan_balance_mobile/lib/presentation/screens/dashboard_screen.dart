import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../domain/financial/balance_calculator.dart';
import '../../domain/financial/money_utils.dart';
import '../state/app_state_notifier.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppStateNotifier>();

    if (state.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    final summary = BalanceCalculator.calculateSystemSummary(
      accounts: state.accounts,
      transactions: state.transactions,
    );

    final openDuesCount = state.dues.where((d) => d.remainingAmountMinor > 0).length;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (state.activeScope == 'demo')
            Container(
              margin: const EdgeInsets.only(bottom: 16.0),
              padding: const EdgeInsets.all(12.0),
              decoration: BoxDecoration(
                color: Colors.amber.shade100,
                borderRadius: BorderRadius.circular(12.0),
                border: Border.all(color: Colors.amber.shade700),
              ),
              child: const Row(
                children: [
                  Icon(Icons.science_outlined, color: Colors.amber),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'مساحة تجريبية معزولة عن البيانات الحقيقية',
                      style: TextStyle(fontWeight: FontWeight.bold, color: Colors.amber),
                    ),
                  ),
                ],
              ),
            ),

          // Cards Row
          Card(
            elevation: 2,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                children: [
                  const Text('صافي المركز المالي النهائي', style: TextStyle(color: Colors.grey, fontSize: 14)),
                  const SizedBox(height: 4),
                  Text(
                    '${MoneyUtils.formatMinorAmount(summary.netBalanceMinor)} ر.س',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: summary.netBalanceMinor >= 0 ? Colors.green.shade700 : Colors.red.shade700,
                    ),
                  ),
                  const Divider(height: 24),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      Column(
                        children: [
                          const Text('إجمالي لك (مستحق)', style: TextStyle(fontSize: 12, color: Colors.grey)),
                          const SizedBox(height: 4),
                          Text(
                            '${MoneyUtils.formatMinorAmount(summary.totalOwedByMinor)} ر.س',
                            style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.green),
                          ),
                        ],
                      ),
                      Container(height: 30, width: 1, color: Colors.grey.shade300),
                      Column(
                        children: [
                          const Text('إجمالي عليك (التزام)', style: TextStyle(fontSize: 12, color: Colors.grey)),
                          const SizedBox(height: 4),
                          Text(
                            '${MoneyUtils.formatMinorAmount(summary.totalOwedToMinor)} ر.س',
                            style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.red),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Dues Summary Alert
          Card(
            color: openDuesCount > 0 ? Colors.orange.shade50 : Colors.grey.shade100,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: ListTile(
              leading: const Icon(Icons.event_note, color: Colors.orange),
              title: const Text('متابعة الاستحقاقات والسداد', style: TextStyle(fontWeight: FontWeight.bold)),
              subtitle: Text(
                openDuesCount > 0
                    ? 'يوجد $openDuesCount استحقاق قائم يتطلب المتابعة'
                    : 'لا توجد استحقاقات قائمة حالياً',
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Recent Activity Section
          const Text('أحدث الحركات المالية', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 8),
          if (state.transactions.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24.0),
              child: Center(child: Text('لا توجد حركات مسجلة حالياً', style: TextStyle(color: Colors.grey))),
            )
          else
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: state.transactions.length > 5 ? 5 : state.transactions.length,
              itemBuilder: (context, index) {
                final tx = state.transactions[index];
                final isOwedBy = tx.signedAmountMinor > 0;
                return Card(
                  margin: const EdgeInsets.only(bottom: 8.0),
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: isOwedBy ? Colors.green.shade100 : Colors.red.shade100,
                      child: Icon(
                        isOwedBy ? Icons.arrow_downward : Icons.arrow_upward,
                        color: isOwedBy ? Colors.green : Colors.red,
                      ),
                    ),
                    title: Text(tx.description.isNotEmpty ? tx.description : 'حركة مالية'),
                    subtitle: Text(tx.date),
                    trailing: Text(
                      '${isOwedBy ? '+' : ''}${MoneyUtils.formatMinorAmount(tx.signedAmountMinor)} ر.س',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: isOwedBy ? Colors.green.shade700 : Colors.red.shade700,
                      ),
                    ),
                  ),
                );
              },
            ),
        ],
      ),
    );
  }
}
