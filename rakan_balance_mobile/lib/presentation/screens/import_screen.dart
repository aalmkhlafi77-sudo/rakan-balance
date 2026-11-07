import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../domain/financial/money_utils.dart';
import '../../domain/importing/ledger_import_service.dart';
import '../state/app_state_notifier.dart';

class ImportScreen extends StatefulWidget {
  const ImportScreen({super.key});

  @override
  State<ImportScreen> createState() => _ImportScreenState();
}

class _ImportScreenState extends State<ImportScreen> {
  LedgerImportPreview? _preview;
  LedgerImportPreview? _lastCommittedPreview;
  LedgerImportCommitResult? _lastResult;
  bool _busy = false;
  String? _status;
  bool _success = false;

  void _setStatus(String message, {bool success = false}) {
    if (!mounted) return;
    setState(() {
      _status = message;
      _success = success;
    });
  }

  Future<Uint8List?> _pickedBytes(PlatformFile file) async {
    if (file.bytes != null) return file.bytes;
    if (file.path == null) return null;
    return File(file.path!).readAsBytes();
  }

  Future<void> _pickAndPreview(AppStateNotifier state) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _status = null;
      _preview = null;
      _lastCommittedPreview = null;
      _lastResult = null;
    });
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['csv', 'xlsx'],
        allowMultiple: false,
        withData: true,
      );
      if (result == null || result.files.isEmpty) return;

      final file = result.files.single;
      if (file.size > 15 * 1024 * 1024) {
        _setStatus('حجم ملف الاستيراد يتجاوز 15 ميغابايت.');
        return;
      }
      final bytes = await _pickedBytes(file);
      if (bytes == null) {
        _setStatus('تعذر قراءة ملف الاستيراد المحدد.');
        return;
      }

      final preview = await LedgerImportService.previewFile(
        bytes: bytes,
        fileName: file.name,
        existingAccounts: state.accounts,
        existingTransactions: state.transactions,
      );
      if (!mounted) return;
      setState(() => _preview = preview);
      if (preview.blockingIssues.isNotEmpty) {
        _setStatus(
          'المعاينة اكتملت مع ${preview.blockingIssues.length} خطأ مانع. '
          'لن يتم تعديل قاعدة البيانات.',
        );
      } else {
        _setStatus(
          'المعاينة جاهزة: ${preview.importableAccounts} حساب جديد و'
          '${preview.importableTransactions} حركة جديدة.',
          success: true,
        );
      }
    } on FormatException catch (e) {
      _setStatus(e.message);
    } catch (e) {
      _setStatus('تعذر تحليل ملف الاستيراد: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _commit(
    BuildContext context,
    AppStateNotifier state,
    LedgerImportPreview preview,
  ) async {
    if (_busy || !preview.canCommit) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('تأكيد الاستيراد الذري'),
        content: Text(
          'سيتم إدخال ${preview.importableAccounts} حسابًا و'
          '${preview.importableTransactions} حركة في عملية واحدة.\n\n'
          'سيتم تجاهل ${preview.duplicateAccounts} حساب مكرر و'
          '${preview.duplicateTransactions} حركة مكررة.\n\n'
          'إذا فشل أي إدخال فلن تُعتمد الدفعة جزئيًا.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('تنفيذ الاستيراد'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _busy = true);
    try {
      final result = await state.importLedger(preview);
      _setStatus(
        'تم الاستيراد: ${result.importedAccounts} حساب و'
        '${result.importedTransactions} حركة. '
        'تم تجاهل ${result.skippedAccounts + result.skippedTransactions} سجل مكرر.',
        success: true,
      );
      if (mounted) {
        setState(() {
          _lastCommittedPreview = preview;
          _lastResult = result;
          _preview = null;
        });
      }
    } catch (e) {
      _setStatus(
        'فشل الاستيراد وأُلغيت الدفعة ذريًا دون اعتماد جزئي: $e',
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _saveBytes({
    required String dialogTitle,
    required String fileName,
    required String extension,
    required Uint8List bytes,
    required String successLabel,
  }) async {
    final path = await FilePicker.platform.saveFile(
      dialogTitle: dialogTitle,
      fileName: fileName,
      type: FileType.custom,
      allowedExtensions: [extension],
      bytes: bytes,
    );
    if (path != null) {
      _setStatus('$successLabel: $path', success: true);
    }
  }

  Future<void> _saveTemplate({
    required String fileName,
    required String content,
  }) =>
      _saveBytes(
        dialogTitle: 'حفظ قالب الاستيراد',
        fileName: fileName,
        extension: 'csv',
        bytes: Uint8List.fromList(utf8.encode('\uFEFF$content')),
        successLabel: 'تم حفظ القالب',
      );

  Future<void> _saveXlsxTemplate() async {
    try {
      final bytes = LedgerImportService.buildXlsxTemplate();
      await _saveBytes(
        dialogTitle: 'حفظ قالب Excel',
        fileName: 'rakan_import_template.xlsx',
        extension: 'xlsx',
        bytes: bytes,
        successLabel: 'تم حفظ قالب Excel',
      );
    } catch (e) {
      _setStatus('تعذر إنشاء قالب Excel: $e');
    }
  }

  Future<void> _saveIssuesReport(LedgerImportPreview preview) =>
      _saveBytes(
        dialogTitle: 'حفظ تقرير التحقق',
        fileName: 'rakan_import_validation_report.csv',
        extension: 'csv',
        bytes: Uint8List.fromList(
          utf8.encode(LedgerImportService.buildIssuesCsv(preview)),
        ),
        successLabel: 'تم حفظ تقرير التحقق',
      );

  Future<void> _saveCommitReport(
    LedgerImportPreview preview,
    LedgerImportCommitResult result,
  ) =>
      _saveBytes(
        dialogTitle: 'حفظ تقرير نتيجة الاستيراد',
        fileName: 'rakan_import_result_report.csv',
        extension: 'csv',
        bytes: Uint8List.fromList(
          utf8.encode(
            LedgerImportService.buildCommitReportCsv(
              preview: preview,
              result: result,
            ),
          ),
        ),
        successLabel: 'تم حفظ تقرير نتيجة الاستيراد',
      );

  Widget _summaryCard(String label, String value) {
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
                value,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _issues(LedgerImportPreview preview) {
    if (preview.issues.isEmpty) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(12),
          child: Text('لا توجد أخطاء أو تكرارات في الملف.'),
        ),
      );
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'نتيجة التحقق',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            for (final issue in preview.issues.take(30))
              Padding(
                padding: const EdgeInsets.only(bottom: 5),
                child: Text(
                  '${issue.blocking ? 'خطأ' : 'تنبيه'} · '
                  '${issue.section} · صف ${issue.rowNumber}: ${issue.message}',
                  style: TextStyle(
                    color: issue.blocking ? Colors.red : Colors.orange.shade800,
                    fontSize: 12,
                  ),
                ),
              ),
            if (preview.issues.length > 30)
              Text(
                'يوجد ${preview.issues.length - 30} ملاحظة إضافية.',
                style: const TextStyle(fontSize: 12, color: Colors.grey),
              ),
          ],
        ),
      ),
    );
  }

  Widget _previewRows(LedgerImportPreview preview) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'معاينة السجلات',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            if (preview.accounts.isNotEmpty) ...[
              const Text('الحسابات', style: TextStyle(fontWeight: FontWeight.w600)),
              for (final row in preview.accounts.take(5))
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text(row.name),
                  subtitle: Text(
                    '${row.categoryName} · '
                    'افتتاحي ${MoneyUtils.formatMinorAmount(row.openingBalanceMinor)} ر.س',
                  ),
                  trailing: row.duplicate
                      ? const Chip(label: Text('مكرر'))
                      : const Chip(label: Text('جديد')),
                ),
            ],
            if (preview.transactions.isNotEmpty) ...[
              const Divider(),
              const Text('الحركات', style: TextStyle(fontWeight: FontWeight.w600)),
              for (final row in preview.transactions.take(5))
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text(row.description),
                  subtitle: Text(
                    '${row.accountRef} · ${row.date} · '
                    '${row.entryType.name == 'owedByAccount' ? 'لك' : 'عليك'}',
                  ),
                  trailing: Text(
                    '${MoneyUtils.formatMinorAmount(row.amountMinor)} ر.س',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppStateNotifier>();
    final preview = _preview;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'استيراد الحسابات والحركات',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 6),
        const Text(
          'المعاينة لا تغيّر البيانات. التنفيذ النهائي ذري: إما تُعتمد الدفعة كاملة '
          'أو تُلغى عند أي خطأ.',
          style: TextStyle(color: Colors.grey),
        ),
        const SizedBox(height: 12),
        if (state.activeScope != 'real')
          const Card(
            child: Padding(
              padding: EdgeInsets.all(12),
              child: Text(
                'أنت في المساحة التجريبية. يمكن معاينة الملفات هنا، '
                'لكن التنفيذ متاح للبيانات الحقيقية فقط.',
              ),
            ),
          ),
        if (_status != null)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                _status!,
                style: TextStyle(
                  color: _success ? Colors.green.shade700 : Colors.red.shade700,
                ),
              ),
            ),
          ),
        FilledButton.icon(
          onPressed: _busy ? null : () => _pickAndPreview(state),
          icon: _busy
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.upload_file),
          label: const Text('اختيار CSV أو XLSX للمعاينة'),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: _busy
                  ? null
                  : () => _saveTemplate(
                        fileName: 'rakan_accounts_template.csv',
                        content:
                            'externalRef,name,category,openingBalance,phone,notes\n'
                            'A-001,أحمد,أفراد,0.00,0500000000,',
                      ),
              icon: const Icon(Icons.table_chart_outlined),
              label: const Text('قالب الحسابات CSV'),
            ),
            OutlinedButton.icon(
              onPressed: _busy
                  ? null
                  : () => _saveTemplate(
                        fileName: 'rakan_transactions_template.csv',
                        content:
                            'accountRef,entryType,amount,date,description,notes\n'
                            'A-001,لك,125.50,2026-11-07,مثال حركة,',
                      ),
              icon: const Icon(Icons.receipt_long_outlined),
              label: const Text('قالب الحركات CSV'),
            ),
            OutlinedButton.icon(
              onPressed: _busy ? null : _saveXlsxTemplate,
              icon: const Icon(Icons.grid_on_outlined),
              label: const Text('قالب Excel شامل'),
            ),
          ],
        ),
        if (_lastCommittedPreview != null && _lastResult != null) ...[
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'اكتمل الاستيراد ويمكن حفظ تقرير النتيجة للمراجعة.',
                    ),
                  ),
                  OutlinedButton.icon(
                    onPressed: _busy
                        ? null
                        : () => _saveCommitReport(
                              _lastCommittedPreview!,
                              _lastResult!,
                            ),
                    icon: const Icon(Icons.download_done_outlined),
                    label: const Text('تقرير النتيجة'),
                  ),
                ],
              ),
            ),
          ),
        ],
        if (preview != null) ...[
          const SizedBox(height: 12),
          Row(
            children: [
              _summaryCard('حسابات جديدة', '${preview.importableAccounts}'),
              _summaryCard('حركات جديدة', '${preview.importableTransactions}'),
            ],
          ),
          Row(
            children: [
              _summaryCard(
                'مكررات',
                '${preview.duplicateAccounts + preview.duplicateTransactions}',
              ),
              _summaryCard('أخطاء مانعة', '${preview.blockingIssues.length}'),
            ],
          ),
          _issues(preview),
          Align(
            alignment: Alignment.centerRight,
            child: OutlinedButton.icon(
              onPressed: _busy ? null : () => _saveIssuesReport(preview),
              icon: const Icon(Icons.download_outlined),
              label: const Text('تنزيل تقرير التحقق CSV'),
            ),
          ),
          _previewRows(preview),
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: _busy ||
                    state.activeScope != 'real' ||
                    !preview.canCommit
                ? null
                : () => _commit(context, state, preview),
            icon: const Icon(Icons.check_circle_outline),
            label: const Text('تنفيذ الاستيراد بعد التحقق'),
          ),
        ],
      ],
    );
  }
}
