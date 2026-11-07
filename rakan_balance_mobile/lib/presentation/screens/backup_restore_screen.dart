import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../domain/validators/backup_validator.dart';
import '../state/app_state_notifier.dart';

class BackupRestoreScreen extends StatefulWidget {
  const BackupRestoreScreen({super.key});

  @override
  State<BackupRestoreScreen> createState() => _BackupRestoreScreenState();
}

class _BackupRestoreScreenState extends State<BackupRestoreScreen> {
  final _jsonController = TextEditingController();
  String? _statusMessage;
  bool _isSuccess = false;
  bool _busy = false;

  void _status(String message, {bool success = false}) {
    if (!mounted) return;
    setState(() { _statusMessage = message; _isSuccess = success; });
  }

  Future<void> _chooseBackup() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom, allowedExtensions: ['json'],
        withData: true, allowMultiple: false);
      if (result == null || result.files.isEmpty) return;
      final picked = result.files.single;
      if (picked.size > 25 * 1024 * 1024) {
        _status('حجم الملف يتجاوز 25 ميغابايت. لم يُقرأ الملف.');
        return;
      }
      final bytes = picked.bytes ??
          (picked.path != null ? await File(picked.path!).readAsBytes() : null);
      if (bytes == null) {
        _status('تعذر قراءة ملف النسخة الاحتياطية المحدد.');
        return;
      }
      final text = utf8.decode(bytes);
      final valid = BackupValidator.validateBackupJson(text);
      _jsonController.text = text;
      _status(valid.isValid
          ? 'تم اختيار الملف وفحص سلامته. الاستعادة تتطلب تأكيدًا منفصلًا.'
          : (valid.error ?? 'ملف غير صالح.'), success: valid.isValid);
    } catch (e) {
      _status('فشل اختيار ملف النسخة الاحتياطية: $e');
    }
  }

  Future<void> _exportBackup(AppStateNotifier state) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final json = await state.exportBackupJson();
      final name = 'rakan_balance_backup_${DateTime.now().toUtc().toIso8601String().split('T').first}.json';
      final output = await FilePicker.platform.saveFile(
        dialogTitle: 'حفظ النسخة الاحتياطية',
        fileName: name,
        type: FileType.custom,
        allowedExtensions: ['json'],
        bytes: Uint8List.fromList(utf8.encode(json)),
      );
      if (output == null) {
        _status('أُلغيت عملية حفظ النسخة الاحتياطية.');
      } else {
        _status('تم إنشاء نسخة احتياطية والتحقق من بصمتها. الملف: $output',
          success: true);
      }
    } catch (e) {
      _status('تعذر تصدير النسخة الاحتياطية: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _restore(AppStateNotifier state) async {
    if (_busy) return;
    final source = _jsonController.text.trim();
    final result = BackupValidator.validateBackupJson(source);
    if (!result.isValid) {
      _status(result.error ?? 'النسخة الاحتياطية غير صالحة.');
      return;
    }
    final counts = result.parsedBundle!['manifest']['recordCounts'] as Map;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('تأكيد استبدال البيانات الحقيقية'),
        content: Text('سيتم استبدال بيانات الحسابات والحركات الحقيقية الموجودة. '
          'تحتوي النسخة على ${counts['accounts']} حسابًا و'
          '${counts['transactions']} حركة مالية. '
          'البيانات التجريبية لن تتغير. هل تريد الاستمرار؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false),
            child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true),
            child: const Text('تأكيد الاستعادة')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await state.restoreBackupJson(source);
      _jsonController.clear();
      _status('تم التحقق والاستعادة بنجاح مع حفظ العلاقات والسجلات.', success: true);
    } catch (e) {
      _status('أُلغيت الاستعادة واستُعيدت البيانات السابقة تلقائيًا عند فشل SQL: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppStateNotifier>();
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('النسخ الاحتياطي والاستعادة',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        const Text('نسخ محلية بصيغة JSON متوافقة مع الويب. '
          'لا تتضمن كلمات مرور أو رمز PIN. الاستعادة تستبدل البيانات الحقيقية فقط.'),
        const SizedBox(height: 16),
        if (_statusMessage != null)
          Card(child: Padding(padding: const EdgeInsets.all(12),
            child: Text(_statusMessage!, style: TextStyle(
              color: _isSuccess ? Colors.green.shade700 : Colors.red.shade700)))),
        FilledButton.icon(
          onPressed: _busy ? null : () => _exportBackup(state),
          icon: const Icon(Icons.download),
          label: const Text('تصدير نسخة احتياطية JSON'),
        ),
        const SizedBox(height: 16),
        const Divider(),
        OutlinedButton.icon(
          onPressed: _busy ? null : _chooseBackup,
          icon: const Icon(Icons.upload_file),
          label: const Text('اختيار ملف نسخة احتياطية'),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _jsonController,
          maxLines: 5,
          decoration: const InputDecoration(
            labelText: 'محتوى JSON (أو اختر ملفًا أعلاه)',
            border: OutlineInputBorder()),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: _busy ? null : () => _restore(state),
          icon: const Icon(Icons.restore),
          label: const Text('فحص الملف ثم تأكيد الاستعادة'),
        ),
        const SizedBox(height: 8),
        const Text('مهم: احتفظ بنسخة سابقة قبل الاستعادة. '
          'يتم تطبيق التغييرات داخل معاملة SQLite ذرية.',
          style: TextStyle(fontSize: 12, color: Colors.grey)),
      ]),
    );
  }

  @override
  void dispose() {
    _jsonController.dispose();
    super.dispose();
  }
}
