import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../domain/financial/analytics_report.dart';
import '../../domain/financial/money_utils.dart';
import '../state/app_state_notifier.dart';

class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  int _monthCount = 12;
  bool _saving = false;

  Widget _metric(String label, int value, {String? helper}) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(fontSize: 11, color: Colors.grey)),
            const SizedBox(height: 4),
            Text(
              '${MoneyUtils.formatMinorAmount(value)} ر.س',
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            if (helper != null)
              Text(
                helper,
                style: const TextStyle(fontSize: 10, color: Colors.grey),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _exportCsv(
    BuildContext context,
    AnalyticsReport report,
  ) async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      final csv = AnalyticsReportBuilder.buildCsv(report);
      final output = await FilePicker.platform.saveFile(
        dialogTitle: 'حفظ التقرير التحليلي',
        fileName: 'rakan_analytics_${_monthCount}m.csv',
        type: FileType.custom,
        allowedExtensions: const ['csv'],
        bytes: Uint8List.fromList(utf8.encode(csv)),
      );
      if (context.mounted && output != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تم حفظ التقرير: $output')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تعذر تصدير التقرير: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppStateNotifier>();
    final report = AnalyticsReportBuilder.build(
      accounts: state.accounts,
      transactions: state.transactions,
      categoryNames: state.categoryNames,
      throughDate: DateTime.now(),
      monthCount: _monthCount,
    );

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'التقارير والتحليلات',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  Text(
                    'المركز الشهري يُحسب من الأرصدة الختامية الفعلية لكل حساب.',
                    style: TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                ],
              ),
            ),
            IconButton(
              tooltip: 'تصدير CSV',
              onPressed: _saving ? null : () => _exportCsv(context, report),
              icon: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.download_outlined),
            ),
          ],
        ),
        const SizedBox(height: 12),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 6, label: Text('6 أشهر')),
              ButtonSegment(value: 12, label: Text('12 شهرًا')),
              ButtonSegment(value: 24, label: Text('24 شهرًا')),
            ],
            selected: {_monthCount},
            onSelectionChanged: (values) {
              setState(() => _monthCount = values.first);
            },
          ),
        ),
        const SizedBox(height: 12),
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 2,
          childAspectRatio: 2.0,
          children: [
            _metric('إجمالي لك', report.totalReceivableMinor),
            _metric('إجمالي عليك', report.totalPayableMinor),
            _metric('الصافي', report.netMinor),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'الحسابات النشطة',
                      style: TextStyle(fontSize: 11, color: Colors.grey),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${report.activeAccountCount}',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        const Text(
          'التصنيفات',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
        const SizedBox(height: 6),
        if (report.categories.isEmpty)
          const Text('لا توجد تصنيفات بها حسابات نشطة.')
        else
          ...report.categories.map(
            (row) => Card(
              child: ListTile(
                title: Text(row.categoryName),
                subtitle: Text(
                  '${row.accountCount} حساب • '
                  'لك ${MoneyUtils.formatMinorAmount(row.receivableMinor)} • '
                  'عليك ${MoneyUtils.formatMinorAmount(row.payableMinor)} ر.س',
                ),
                trailing: Text(
                  '${MoneyUtils.formatMinorAmount(row.netMinor)} ر.س',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ),
        const SizedBox(height: 16),
        const Text(
          'المركز المالي حسب الشهر',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
        const Text(
          'لك/عليك هنا أرصدة ختامية، وليست مجموع حركات الشهر.',
          style: TextStyle(fontSize: 11, color: Colors.grey),
        ),
        const SizedBox(height: 6),
        ...report.monthly.reversed.map(
          (row) => Card(
            child: ListTile(
              leading: const Icon(Icons.calendar_month_outlined),
              title: Text(row.month),
              subtitle: Text(
                'ختامي لك: ${MoneyUtils.formatMinorAmount(row.receivableMinor)} • '
                'ختامي عليك: ${MoneyUtils.formatMinorAmount(row.payableMinor)} ر.س\n'
                'حركات الشهر — لك: '
                '${MoneyUtils.formatMinorAmount(row.movementOwedByMinor)} • '
                'عليك: ${MoneyUtils.formatMinorAmount(row.movementOwedToMinor)} ر.س',
              ),
              isThreeLine: true,
              trailing: Text(
                '${MoneyUtils.formatMinorAmount(row.netMinor)}',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        const Text(
          'أكبر الحسابات حسب الرصيد المطلق',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
        const SizedBox(height: 6),
        if (report.accounts.isEmpty)
          const Text('لا توجد حسابات نشطة.')
        else
          ...report.accounts.take(10).map(
            (row) => Card(
              child: ListTile(
                title: Text(row.name),
                subtitle: Text(
                  '${row.categoryName} • ${row.transactionCount} حركة'
                  '${row.lastActivityDate == null ? '' : ' • آخر نشاط ${row.lastActivityDate}'}',
                ),
                trailing: Text(
                  '${MoneyUtils.formatMinorAmount(row.balanceMinor)} ر.س',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: row.balanceMinor > 0
                        ? Colors.green.shade700
                        : row.balanceMinor < 0
                            ? Colors.red.shade700
                            : Colors.grey.shade700,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
