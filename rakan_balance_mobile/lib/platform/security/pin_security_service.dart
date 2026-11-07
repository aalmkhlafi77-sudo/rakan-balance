import 'dart:convert';
import 'dart:isolate';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract class PinCredentialStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

/// Android Keystore / iOS Keychain-backed storage; no raw PIN is persisted.
class SecurePinCredentialStore implements PinCredentialStore {
  final FlutterSecureStorage _secure = const FlutterSecureStorage();

  @override
  Future<String?> read(String key) => _secure.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _secure.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _secure.delete(key: key);
}

/// PIN verifier stored as salted PBKDF2-HMAC-SHA256.
/// A PIN is only an app access gate, not encryption of the SQLite file.
class PinSecurityService {
  final PinCredentialStore _store;
  final int iterations;
  final DateTime Function() _now;

  static const _saltKey = 'rakan_pin_salt_v1';
  static const _verifierKey = 'rakan_pin_verifier_v1';
  static const _attemptsKey = 'rakan_pin_attempts_v1';
  static const _lockUntilKey = 'rakan_pin_lock_until_v1';
  static const _iterationsKey = 'rakan_pin_iterations_v1';
  static const maxFailures = 5;
  static const lockoutSeconds = 60;

  PinSecurityService(PinCredentialStore store, {
    this.iterations = 120000,
    DateTime Function()? now,
  }) : _store = store, _now = now ?? DateTime.now;

  Future<bool> hasPin() async {
    final verifier = await _store.read(_verifierKey);
    final salt = await _store.read(_saltKey);
    return verifier != null && salt != null;
  }

  Future<int> lockoutSecondsRemaining() async {
    final until = int.tryParse(await _store.read(_lockUntilKey) ?? '');
    if (until == null) return 0;
    final seconds = ((until - _now().millisecondsSinceEpoch) / 1000).ceil();
    return seconds > 0 ? seconds : 0;
  }

  Future<void> setPin(String pin, {String? previousPin}) async {
    if (!RegExp(r'^\d{4}$').hasMatch(pin)) {
      throw ArgumentError('رمز الحماية يجب أن يكون أربعة أرقام.');
    }
    if (await hasPin()) {
      if (previousPin == null || !await verifyPin(previousPin)) {
        throw StateError('رمز الحماية الحالي غير صحيح.');
      }
    }

    final random = Random.secure();
    final salt = List<int>.generate(16, (_) => random.nextInt(256));
    final iterationsValue = iterations;
    final digest = await Isolate.run(() => _derivePin(pin, salt, iterationsValue));
    await _store.write(_saltKey, base64Encode(salt));
    await _store.write(_verifierKey, base64Encode(digest));
    await _store.write(_iterationsKey, '$iterationsValue');
    await _resetFailures();
  }

  Future<void> disablePin(String currentPin) async {
    if (!await hasPin()) return;
    if (!await verifyPin(currentPin)) {
      throw StateError('رمز الحماية الحالي غير صحيح.');
    }
    await _store.delete(_verifierKey);
    await _store.delete(_saltKey);
    await _store.delete(_iterationsKey);
    await _resetFailures();
  }

  Future<bool> verifyPin(String candidate) async {
    if (await lockoutSecondsRemaining() > 0) return false;
    if (!RegExp(r'^\d{4}$').hasMatch(candidate)) return false;
    final saltText = await _store.read(_saltKey);
    final expectedText = await _store.read(_verifierKey);
    if (saltText == null || expectedText == null) return false;
    final salt = base64Decode(saltText);
    final expected = base64Decode(expectedText);
    final rounds = int.tryParse(await _store.read(_iterationsKey) ?? '')
        ?? iterations;
    if (rounds < 1 || rounds > 1000000) return false;

    final derived = await Isolate.run(() => _derivePin(candidate, salt, rounds));
    if (_constantTimeEquals(expected, derived)) {
      await _resetFailures();
      return true;
    }

    final attempts = (int.tryParse(await _store.read(_attemptsKey) ?? '') ?? 0) + 1;
    if (attempts >= maxFailures) {
      await _store.write(_lockUntilKey,
          '${_now().add(const Duration(seconds: lockoutSeconds)).millisecondsSinceEpoch}');
      await _store.write(_attemptsKey, '0');
    } else {
      await _store.write(_attemptsKey, '$attempts');
    }
    return false;
  }

  Future<void> _resetFailures() async {
    await _store.delete(_attemptsKey);
    await _store.delete(_lockUntilKey);
  }

  static bool _constantTimeEquals(List<int> a, List<int> b) {
    if (a.length != b.length) return false;
    var difference = 0;
    for (var i = 0; i < a.length; i++) {
      difference |= a[i] ^ b[i];
    }
    return difference == 0;
  }

  static List<int> _derivePin(String pin, List<int> salt, int iterations) {
    final hmac = Hmac(sha256, utf8.encode(pin));
    var u = hmac.convert([...salt, 0, 0, 0, 1]).bytes;
    final result = List<int>.from(u);
    for (var iteration = 1; iteration < iterations; iteration++) {
      u = hmac.convert(u).bytes;
      for (var i = 0; i < result.length; i++) {
        result[i] ^= u[i];
      }
    }
    return result;
  }
}
