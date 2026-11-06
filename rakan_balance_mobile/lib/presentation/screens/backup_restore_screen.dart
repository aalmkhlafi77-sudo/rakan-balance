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

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppStateNotifier>();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'النسخ الاحتياطي والاستعادة الذرية',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 4),
          const Text(
            'تصدير واستيراد النسخ الاحتياطية المتوافقة مع نسخة الويب (v2/N2) وبصمة SHA-256.',
            style: TextStyle(color: Colors.grey, fontSize: 12),
          ),
          const SizedBox(height: 16),

          if (_statusMessage != null)
            Container(
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: _isSuccess ? Colors.green.shade50 : Colors.red.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: _isSuccess ? Colors.green : Colors.red),
              ),
              child: Text(
                _statusMessage!,
                style: TextStyle(color: _isSuccess ? Colors.green.shade800 : Colors.red.shade800),
              ),
            ),

          // Import Box
          Card(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('استعادة نسخة احتياطية من ملف JSON', style: TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _jsonController,
                    maxLines: 6,
                    decoration: const InputDecoration(
                      hintText: 'ألصق محتوى ملف النسخة الاحتياطية JSON هنا...',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  ElevatedButton(
                    onPressed: () async {
                      setState(() {
                        _statusMessage = null;
                        _isSuccess = false;
                      });

                      final jsonStr = _jsonController.text.trim();
                      if (jsonStr.isEmpty) {
                        setState(() {
                          _statusMessage = 'يرجى لصق نص ملف النسخة الاحتياطية.';
                          _isSuccess = false;
                        });
                        return;
                      }

                      // Validate backup
                      final val = BackupValidator.validateBackupJson(jsonStr);
                      if (!val.isValid) {
                        setState(() {
                          _statusMessage = val.error;
                          _isSuccess = false;
                        });
                        return;
                      }

                      try {
                        final bundleData = val.parsedBundle!['data'] as Map<String, dynamic>;
                        await state.restoreBackup(bundleData);
                        setState(() {
                          _statusMessage = 'تمت استعادة النسخة الاحتياطية بنجاح واكتمال فحص الأرصدة والسجلات.';
                          _isSuccess = true;
                        });
                        _jsonController.clear();
                      } catch (e) {
                        setState(() {
                          _statusMessage = 'فشل تطبيق الاستعادة الذرية: $e';
                          _isSuccess = false;
                        });
                      }
                    },
                    child: const Text('فحص واستعادة النسخة الاحتياطية'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
