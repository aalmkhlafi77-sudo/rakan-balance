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

  Future<void> _showSetPinDialog(BuildContext context, AppStateNotifier state) async {
    final currentController = TextEditingController();
    final newController = TextEditingController();
    String? error;
    var saving = false;
    await showDialog<void>(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (ctx, refresh) => AlertDialog(
          title: Text(state.hasPin ? 'تغيير رمز الحماية' : 'تفعيل رمز الحماية'),
          content: SingleChildScrollView(child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (state.hasPin) TextField(
                controller: currentController,
                keyboardType: TextInputType.number,
                obscureText: true,
                maxLength: 4,
                decoration: const InputDecoration(labelText: 'الرمز الحالي *'),
              ),
              TextField(
                controller: newController,
                keyboardType: TextInputType.number,
                obscureText: true,
                maxLength: 4,
                decoration: const InputDecoration(labelText: 'الرمز الجديد من 4 أرقام'),
              ),
              if (error != null)
                Text(error!, style: const TextStyle(color: Colors.red)),
            ],
          )),
          actions: [
            TextButton(onPressed: saving ? null : () => Navigator.pop(ctx),
              child: const Text('إلغاء')),
            if (state.hasPin) TextButton(
              onPressed: saving ? null : () async {
                refresh(() { saving = true; error = null; });
                try {
                  await state.setPin(null, currentPin: currentController.text);
                  if (ctx.mounted) Navigator.pop(ctx);
                } catch (e) {
                  if (ctx.mounted) refresh(() => error = e.toString());
                } finally {
                  if (ctx.mounted) refresh(() => saving = false);
                }
              },
              child: const Text('إلغاء تفعيل الحماية'),
            ),
            FilledButton(onPressed: saving ? null : () async {
              refresh(() { saving = true; error = null; });
              try {
                await state.setPin(newController.text,
                  currentPin: state.hasPin ? currentController.text : null);
                if (ctx.mounted) Navigator.pop(ctx);
              } catch (e) {
                if (ctx.mounted) refresh(() => error = e.toString());
              } finally {
                if (ctx.mounted) refresh(() => saving = false);
              }
            }, child: const Text('حفظ الرمز')),
          ],
        ),
      ),
    );
    currentController.dispose();
    newController.dispose();
  }
}
