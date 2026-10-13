import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/core/security/jwt_verifier.dart';
import 'package:medanki_dz/data/network/api_client.dart';
import 'package:medanki_dz/data/network/api_exceptions.dart';
import 'package:medanki_dz/data/network/secure_token_storage.dart';
import 'package:medanki_dz/data/repositories/rest_entitlement_repository.dart';
import 'package:medanki_dz/domain/domain.dart';

class MemoryStorage extends SecureTokenStorage {
  String? user = 'alice';
  String? token = 'cached';
  @override Future<String?> readUserId() async => user;
  @override Future<String> getOrCreateDeviceId() async => 'device-a';
  @override Future<String?> readEntitlementJwt() async => token;
  @override Future<void> writeEntitlementJwt(String? v) async { token = v; }
  @override Future<void> writeUserId(String v) async { user = v; }
}
class StubApi extends ApiClient {
  StubApi(SecureTokenStorage storage) : super(baseUrl: 'https://example.invalid', tokenStorage: storage);
  Object? failure;
  @override Future<String> fetchEntitlementJwt(String userId) async {
    if (failure != null) throw failure!;
    return 'fresh';
  }
}
class StubVerifier extends JwtVerifier {
  Map<String, dynamic> claims = {
    'kind': 'entitlement', 'user_id': 'alice', 'device_id': 'device-a',
    'plan': 'premium', 'expires_at': 5000, 'grace_until': 7000,
  };
  int tokenExpiry = 6000;
  bool reject = false;
  @override Future<JwtVerified> verify(String jwt, {DateTime? now}) async {
    if (reject) throw JwtVerificationException('invalid token');
    return JwtVerified(payload: claims, expiresAtMs: tokenExpiry);
  }
}
void main() {
  late MemoryStorage storage;
  late StubApi api;
  late StubVerifier verifier;
  late RestEntitlementRepository repository;
  setUp(() {
    storage = MemoryStorage(); api = StubApi(storage); verifier = StubVerifier();
    repository = RestEntitlementRepository(api: api, storage: storage, jwtVerifier: verifier);
  });
  test('refreshes online instead of masking revocation with cache', () async {
    verifier.claims['plan'] = 'free';
    final state = await repository.current();
    expect(storage.token, 'fresh');
    expect(state.canAccessPremiumAt(1000), isFalse);
  });
  test('offline access is capped by JWT expiry, not extended by grace', () async {
    api.failure = const NetworkException('offline');
    final state = await repository.current();
    expect(state.expiresAtMs, 5000);
    expect(state.graceUntilMs, 6000);
    expect(state.canAccessPremiumAt(5500), isTrue);
    expect(state.canAccessPremiumAt(6000), isFalse);
  });
  test('authentication refusal is not treated as an offline incident', () async {
    api.failure = const AuthException('revoked');
    expect((await repository.current()).canAccessPremiumAt(1000), isFalse);
  });
  for (final invalid in [
    {'kind': 'access'}, {'user_id': 'bob'}, {'device_id': 'device-b'},
    {'plan': 'yearly'}, {'expires_at': '5000'},
  ]) {
    test('rejects foreign or malformed claims: $invalid', () async {
      verifier.claims.addAll(invalid);
      expect((await repository.current()).canAccessPremiumAt(1000), isFalse);
    });
  }
  test('a cached token cannot restore an absent session', () async {
    storage.user = null;
    expect((await repository.current()).canAccessPremiumAt(1000), isFalse);
  });
  test('storeToken cannot change the session owner', () async {
    await expectLater(repository.storeToken(userId: 'bob', signedToken: 'foreign', expiresAtMs: 9999), throwsA(isA<JwtVerificationException>()));
    expect(storage.user, 'alice'); expect(storage.token, 'cached');
  });
  test('invalid signature cannot use grace', () async {
    api.failure = const NetworkException('offline'); verifier.reject = true;
    expect((await repository.current()).canAccessPremiumAt(1000), isFalse);
    const invalid = EntitlementState(plan: EntitlementPlan.premium, isValid: false, expiresAtMs: 5000, graceUntilMs: 9000);
    expect(invalid.canAccessPremiumAt(6000), isFalse);
  });
}
