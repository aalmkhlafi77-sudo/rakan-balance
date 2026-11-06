import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state_notifier.dart';

class PinLockScreen extends StatefulWidget {
  const PinLockScreen({super.key});

  @override
  State<PinLockScreen> createState() => _PinLockScreenState();
}

class _PinLockScreenState extends State<PinLockScreen> {
  final _pinController = TextEditingController();
  String? _error;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppStateNotifier>();

    return Scaffold(
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(Icons.lock, size: 64, color: Colors.emerald),
            const SizedBox(height: 16),
            const Text(
              'راكان بلانس | RAKAN BALANCE',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text(
              'أدخل رمز الحماية PIN لفتح التطبيق',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey),
            ),
            const SizedBox(height: 24),

            if (_error != null)
              Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.red)),

            TextField(
              controller: _pinController,
              keyboardType: TextInputType.number,
              obscureText: true,
              maxLength: 4,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 24, letterSpacing: 8),
              decoration: const InputDecoration(hintText: '••••'),
              onChanged: (val) {
                if (val.length == 4) {
                  final ok = state.unlockWithPin(val);
                  if (!ok) {
                    setState(() {
                      _error = 'رمز الحماية خاطئ.';
                      _pinController.clear();
                    });
                  }
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}
