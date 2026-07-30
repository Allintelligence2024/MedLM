// ConnectivityAware — utilitaire pour savoir si on est online.
//
// v2 §3 (boucle d'étude offline-first) : l'app doit pouvoir
// fonctionner **sans réseau**. On distingue :
//   * en ligne (Wifi ou cellulaire) → on peut sync.
//   * en mode avion → on lit le cache local uniquement.
//   * connexion partielle → on tente l'appel mais on tolère
//     l'échec (queue d'outbox).
library;

import 'package:connectivity_plus/connectivity_plus.dart';

enum NetworkState { online, offline, unknown }

class ConnectivityAware {
  ConnectivityAware({Connectivity? connectivity})
      : _connectivity = connectivity ?? Connectivity();
  final Connectivity _connectivity;

  /// Vérifie l'état réseau courant. `unknown` si l'OS ne peut pas
  /// répondre (rare, mais on le tolère).
  Future<NetworkState> current() async {
    final results = await _connectivity.checkConnectivity();
    if (results.contains(ConnectivityResult.wifi) ||
        results.contains(ConnectivityResult.mobile) ||
        results.contains(ConnectivityResult.ethernet) ||
        results.contains(ConnectivityResult.vpn)) {
      return NetworkState.online;
    }
    if (results.contains(ConnectivityResult.none) ||
        results.isEmpty) {
      return NetworkState.offline;
    }
    return NetworkState.unknown;
  }

  /// Observable : émet à chaque changement d'état réseau.
  Stream<NetworkState> watch() {
    return _connectivity.onConnectivityChanged.map((results) {
      if (results.contains(ConnectivityResult.wifi) ||
          results.contains(ConnectivityResult.mobile) ||
          results.contains(ConnectivityResult.ethernet) ||
          results.contains(ConnectivityResult.vpn)) {
        return NetworkState.online;
      }
      if (results.contains(ConnectivityResult.none) || results.isEmpty) {
        return NetworkState.offline;
      }
      return NetworkState.unknown;
    });
  }
}
