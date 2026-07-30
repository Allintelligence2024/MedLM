/// Vérifie si l'utilisateur a accès à un contenu (notamment premium).
///
/// La règle (doc v2 §8.1) est :
///   * l'accès est ouvert si le JWT est signé et non expiré ;
///   * une grace period de 14 jours couvre les coupures réseau algériennes ;
///   * le serveur reste la source de vérité : aucune décision de paywall ne
///     peut être prise sur la seule base d'une horloge locale.
library;

import '../repositories/repositories.dart';

class ValidateEntitlementUseCase {
  const ValidateEntitlementUseCase(this._ent);

  final IEntitlementRepository _ent;

  Future<bool> canAccessPremiumAt(int nowMs) async {
    final EntitlementState state = await _ent.current();
    return state.canAccessPremiumAt(nowMs);
  }

  Future<EntitlementState> currentState() => _ent.current();
}
