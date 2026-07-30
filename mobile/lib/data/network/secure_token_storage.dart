// SecureTokenStorage — wrapper sur flutter_secure_storage.
//
// Tokens persistés :
//   * access_token  : JWT d'accès, TTL 15 min
//   * refresh_token : secret opaque, TTL 30 j
//   * device_id     : UUID v4 généré à la première ouverture
//   * entitlement_jwt : JWT signé par le serveur, TTL 24 h
//
// Toutes les écritures passent par le secure storage du système
// (Android Keystore / iOS Keychain). On ne fait JAMAIS de cache
// mémoire entre deux sessions pour ces secrets.
library;

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

class SecureTokenStorage {
  SecureTokenStorage({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  final FlutterSecureStorage _storage;
  static const _kAccess = 'access_token';
  static const _kRefresh = 'refresh_token';
  static const _kDevice = 'device_id';
  static const _kEntitlement = 'entitlement_jwt';
  static const _kUserId = 'user_id';

  Future<String?> readAccessToken() => _storage.read(key: _kAccess);
  Future<String?> readRefreshToken() => _storage.read(key: _kRefresh);
  Future<String?> readEntitlementJwt() => _storage.read(key: _kEntitlement);
  Future<String?> readUserId() => _storage.read(key: _kUserId);

  Future<void> writeAccessToken(String v) => _storage.write(key: _kAccess, value: v);
  Future<void> writeRefreshToken(String v) => _storage.write(key: _kRefresh, value: v);
  Future<void> writeEntitlementJwt(String? v) async {
    if (v == null) {
      await _storage.delete(key: _kEntitlement);
    } else {
      await _storage.write(key: _kEntitlement, value: v);
    }
  }
  Future<void> writeUserId(String v) => _storage.write(key: _kUserId, value: v);

  /// Lit ou génère un device_id stable.
  Future<String> getOrCreateDeviceId() async {
    final existing = await _storage.read(key: _kDevice);
    if (existing != null) return existing;
    final id = const Uuid().v4();
    await _storage.write(key: _kDevice, value: id);
    return id;
  }

  Future<void> clear() async {
    await _storage.delete(key: _kAccess);
    await _storage.delete(key: _kRefresh);
    await _storage.delete(key: _kEntitlement);
    await _storage.delete(key: _kUserId);
  }
}
