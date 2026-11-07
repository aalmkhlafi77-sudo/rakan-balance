import 'package:flutter_test/flutter_test.dart';
import 'package:rakan_balance_mobile/platform/security/pin_security_service.dart';

class _MemoryCredentialStore implements PinCredentialStore {
  final values = <String, String>{};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    values.remove(key);
  }
}

void main() {
  test('PIN verifier survives service restart without retaining raw PIN', () async {
    final store = _MemoryCredentialStore();
    final service = PinSecurityService(store, iterations: 100);
    expect(await service.hasPin(), false);
    await service.setPin('1234');
    expect(await service.hasPin(), true);
    expect(store.values.values.contains('1234'), false);

    final restartedService = PinSecurityService(store, iterations: 100);
    expect(await restartedService.hasPin(), true);
    expect(await restartedService.verifyPin('1234'), true);
    expect(await restartedService.verifyPin('0000'), false);
  });

  test('PIN change or disable requires current verifier', () async {
    final store = _MemoryCredentialStore();
    final service = PinSecurityService(store, iterations: 100);
    await service.setPin('1111');

    await expectLater(service.setPin('2222', previousPin: '0000'), throwsStateError);
    expect(await service.verifyPin('1111'), true);

    await service.setPin('2222', previousPin: '1111');
    expect(await service.verifyPin('1111'), false);
    expect(await service.verifyPin('2222'), true);

    await expectLater(service.disablePin('1111'), throwsStateError);
    expect(await service.hasPin(), true);
    await service.disablePin('2222');
    expect(await service.hasPin(), false);
  });

  test('failed PIN attempts trigger durable lockout and clear after expiry', () async {
    final store = _MemoryCredentialStore();
    var now = DateTime.utc(2026, 11, 7);
    final service = PinSecurityService(
      store, iterations: 100, now: () => now);
    await service.setPin('1234');
    for (var i = 0; i < PinSecurityService.maxFailures; i++) {
      expect(await service.verifyPin('9999'), false);
    }
    expect(await service.lockoutSecondsRemaining(), greaterThan(0));
    expect(await service.verifyPin('1234'), false);
    now = now.add(const Duration(seconds: 61));
    expect(await service.verifyPin('1234'), true);
    expect(await service.lockoutSecondsRemaining(), 0);
  });

  test('invalid non-numeric or short PIN is rejected', () async {
    final service = PinSecurityService(_MemoryCredentialStore(), iterations: 100);
    await expectLater(service.setPin('123'), throwsArgumentError);
    await expectLater(service.setPin('12a4'), throwsArgumentError);
  });
}
