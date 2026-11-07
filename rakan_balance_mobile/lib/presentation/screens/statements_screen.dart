import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../domain/financial/account_statement_csv.dart';
import '../../domain/financial/account_statement_pdf.dart';
import '../../domain/financial/balance_calculator.dart';
import '../../domain/financial/money_utils.dart';
import '../../domain/models/account_model.dart';
import '../state/app_state_notifier.dart';

class StatementsScreen extends StatefulWidget {
  const StatementsScreen({super.key});

  @override
  State<StatementsScreen> createState() => _StatementsScreenState();
}

class _StatementsScreenState extends State<StatementsScreen> {
  String? _selectedAccountId;
  String? _fromDate;
  String? _toDate;
  bool _pdfBusy = false;

  String _iso(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-'
      '${value.month.toString().padLeft(2, '0')}-'
      '${value.day.toString().padLeft(2, '0')}';

  Future<void> _pickDate({required bool from}) async {
    final current = from ? _fromDate : _toDate;
    final initial = current == null ? DateTime.now() : DateTime.parse(current);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    setState(() {
      final value = _iso(picked);
      if (from) {
        _fromDate = value;
      } else {
        _toDate = value;
      }
    });
  }

  void _applyPreset(String preset) {
    final now = DateTime.now();
    setState(() {
      if (preset == 'all') {
        _fromDate = null;
        _toDate = null;
      } else if (preset == 'month') {
        _fromDate = _iso(DateTime(now.year, now.month, 1));
        _toDate = _iso(now);
      } else {
        _fromDate = _iso(now.subtract(const Duration(days: 30)));
        _toDate = _iso(now);
      }
    });
  }

  Future<void> _exportCsv(
    BuildContext context,
    AccountModel account,
    AppStateNotifier state,
  ) async {
    try {
      final csv = AccountStatementCsv.build(
        account: account,
        transactions: state.transactions,
        accounts: state.accounts,
        fromDate: _fromDate,
        toDate: _toDate,
      );
      final safeId = account.id.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_');
      final suffix = _fromDate == null && _toDate == null
          ? 'all'
          : '${_fromDate ?? 'start'}_${_toDate ?? 'end'}';
      final output = await FilePicker.platform.saveFile(
        dialogTitle: 'حفظ كشف الحساب',
        fileName: 'rakan_statement_${safeId}_$suffix.csv',
        type: FileType.custom,
        allowedExtensions: const ['csv'],
        bytes: Uint8List.fromList(utf8.encode(csv)),
      );
      if (context.mounted && output != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تم حفظ كشف الحساب: $output')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تعذر تصدير كشف الحساب: $e')),
        );
      }
    }
  }

  Future<void> _runPdfAction(Future<void> Function() action) async {
    if (_pdfBusy) return;
    setState(() => _pdfBusy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'تعذر إنشاء مستند PDF: $e. '
              'قد يلزم اتصال بالإنترنت في أول استخدام لتحميل الخط العربي.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _pdfBusy = false);
    }
  }

  Widget _metric(String label, int minor, {bool signed = true}) {
    final value = MoneyUtils.formatMinorAmount(minor);
    final displayed = signed && minor > 0 ? '+$value' : value;
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(fontSize: 11, color: Colors.grey)),
              const SizedBox(height: 4),
              Text(
                '$displayed ر.س',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppStateNotifier>();
    final matches =
        state.accounts.where((a) => a.id == _selectedAccountId).toList();
    final selected = matches.isEmpty ? null : matches.first;

    final statement = selected == null
        ? null
        : BalanceCalculator.calculateAccountStatement(
            account: selected,
            transactions: state.transactions,
            fromDate: _fromDate,
            toDate: _toDate,
          );

    return Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'كشف الحساب والتقارير التفصيلية',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ),
              if (selected != null) ...[
                IconButton(
                  tooltip: 'تصدير CSV',
                  onPressed: () => _exportCsv(context, selected, state),
                  icon: const Icon(Icons.download_outlined),
                ),
                IconButton(
                  tooltip: 'طباعة كشف PDF',
                  onPressed: _pdfBusy
                      ? null
                      : () => _runPdfAction(
                            () => AccountStatementPdf.printStatement(
                              account: selected,
                              accounts: state.accounts,
                              transactions: state.transactions,
                              fromDate: _fromDate,
                              toDate: _toDate,
                            ),
                          ),
                  icon: const Icon(Icons.print_outlined),
                ),
                IconButton(
                  tooltip: 'مشاركة كشف PDF',
                  onPressed: _pdfBusy
                      ? null
                      : () => _runPdfAction(
                            () => AccountStatementPdf.shareStatement(
                              account: selected,
                              accounts: state.accounts,
                              transactions: state.transactions,
                              fromDate: _fromDate,
                              toDate: _toDate,
                            ),
                          ),
                  icon: _pdfBusy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.picture_as_pdf_outlined),
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            decoration: const InputDecoration(
              labelText: 'اختر الحساب لاستعراض كشف الحساب',
            ),
            initialValue: _selectedAccountId,
            items: state.accounts
                .map((a) => DropdownMenuItem(
                      value: a.id,
                      child: Text(
                        a.status == 'archived' ? '${a.name} (مؤرشف)' : a.name,
                      ),
                    ))
                .toList(),
            onChanged: (value) => setState(() => _selectedAccountId = value),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: selected == null ? null : () => _pickDate(from: true),
                  icon: const Icon(Icons.calendar_today_outlined, size: 16),
                  label: Text(_fromDate == null ? 'من بداية التعامل' : _fromDate!),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: selected == null ? null : () => _pickDate(from: false),
                  icon: const Icon(Icons.event_outlined, size: 16),
                  label: Text(_toDate == null ? 'إلى آخر السجل' : _toDate!),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            children: [
              TextButton(
                onPressed: selected == null ? null : () => _applyPreset('all'),
                child: const Text('كامل المدة'),
              ),
              TextButton(
                onPressed: selected == null ? null : () => _applyPreset('month'),
                child: const Text('هذا الشهر'),
              ),
              TextButton(
                onPressed: selected == null ? null : () => _applyPreset('30'),
                child: const Text('آخر 30 يوماً'),
              ),
            ],
          ),
          const SizedBox(height: 6),
          if (selected == null)
            const Expanded(
              child: Center(child: Text('اختر حساباً لعرض كشفه المالي.')),
            )
          else if (statement != null) ...[
            Row(
              children: [
                _metric('رصيد أول المدة', statement.openingBalanceMinor),
                _metric('عليه خلال الفترة', statement.totalOwedByMinor),
              ],
            ),
            Row(
              children: [
                _metric('له خلال الفترة', -statement.totalOwedToMinor),
                _metric('رصيد آخر المدة', statement.closingBalanceMinor),
              ],
            ),
            const SizedBox(height: 8),
            Expanded(
              child: statement.rows.isEmpty
                  ? Center(
                      child: Text(
                        'لا توجد حركات في الفترة المحددة.\n'
                        'رصيد آخر المدة: '
                        '${MoneyUtils.formatMinorAmount(statement.closingBalanceMinor)} ر.س',
                        textAlign: TextAlign.center,
                      ),
                    )
                  : ListView.builder(
                      itemCount: statement.rows.length,
                      itemBuilder: (context, index) {
                        final row = statement.rows[index];
                        final tx = row.transaction;
                        final isOwedBy = tx.signedAmountMinor > 0;
                        return Card(
                          margin: const EdgeInsets.only(bottom: 7),
                          child: ListTile(
                            leading: CircleAvatar(
                              child: Text('${index + 1}'),
                            ),
                            title: Text(tx.description),
                            subtitle: Text(
                              '${tx.date}\n'
                              'الرصيد بعد الحركة: '
                              '${MoneyUtils.formatMinorAmount(row.runningBalanceMinor)} ر.س',
                            ),
                            isThreeLine: true,
                            trailing: Text(
                              '${isOwedBy ? '+' : '-'}'
                              '${MoneyUtils.formatMinorAmount(tx.amountMinor)} ر.س',
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
