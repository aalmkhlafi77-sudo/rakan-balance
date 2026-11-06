import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state_notifier.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppStateNotifier>();

    return ListView(
      padding: const EdgeInsets.all(16.0),
      children: [
        const Text('الإعدادات العامة والمظاهر', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        ListTile(
          leading: const Icon(Icons.brightness_medium),
          title: const Text('المظهر (الوضع الداكن / الفاتح)'),
          trailing: Switch(
            value: state.themeMode == ThemeMode.dark,
            onChanged: (_) => state.toggleThemeMode(),
          ),
        ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.lock_outline),
          title: const Text('رمز الحماية PIN'),
          subtitle: Text(state.hasPin ? 'رمز الحماية مفعّل' : 'رمز الحماية غير مفعّل'),
          onTap: () {
            _showSetPinDialog(context, state);
          },
        ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.swap_horiz),
          title: const Text('مساحة العمل الحالية'),
          subtitle: Text(state.activeScope == 'real' ? 'البيانات الحقيقية' : 'المساحة التجريبية المعزولة'),
          trailing: ElevatedButton(
            onPressed: () {
              state.toggleScope(state.activeScope == 'real' ? 'demo' : 'real');
            },
            child: Text(state.activeScope == 'real' ? 'التبديل للتجريبي' : 'التبديل للحقيقي'),
          ),
        ),
      ],
    );
  }

  void _showSetPinDialog(BuildContext context, AppStateNotifier state) {
    final pinController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('تعيين رمز الحماية PIN'),
          content: TextField(
            controller: pinController,
            keyboardType: TextInputType.number,
            obscureText: true,
            maxLength: 4,
            decoration: const InputDecoration(labelText: 'رمز من 4 أرقام'),
          ),
          actions: [
            TextButton(
              onPressed: () {
                state.setPin(null);
                Navigator.pop(ctx);
              },
              child: const Text('إلغاء التفعيل'),
            ),
            ElevatedButton(
              onPressed: () {
                if (pinController.text.length == 4) {
                  state.setPin(pinController.text);
                  Navigator.pop(ctx);
                }
              },
              child: const Text('حفظ الرمز'),
            ),
          ],
        );
      },
    );
  }
}
