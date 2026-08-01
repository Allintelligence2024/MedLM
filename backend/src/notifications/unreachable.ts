/// Détection des appareils devenus injoignables (audit P1-3).
///
/// Quand un utilisateur désinstalle l'application, son jeton reste dans
/// le registre. FCM et APNs le signalent — mais avec des codes
/// différents, et personne ne les interprétait : `markUnreachable()`
/// existait sans appelant. Conséquence : on retenterait indéfiniment
/// des envois vers des appareils morts, en gonflant les compteurs
/// d'échec et en masquant les vraies pannes.
///
/// Distinction essentielle :
///   * **permanent** — le jeton ne sera plus jamais valide
///     (désinstallation, jeton malformé) → désactiver ;
///   * **transitoire** — panne réseau, 429, 5xx → NE PAS désactiver,
///     l'appareil est toujours là et retentera plus tard.
///
/// Se tromper de côté est coûteux dans les deux sens : désactiver un
/// appareil vivant le prive de notifications jusqu'à sa prochaine
/// ouverture de l'app ; garder un appareil mort pollue les métriques.
///
/// Fonctions pures — testées sans réseau (`test/unit/unreachable.test.ts`).

/// Motif de désactivation, tel qu'il est consigné en base.
export type UnreachableReason =
  | 'unregistered' // application désinstallée
  | 'invalid_token' // jeton malformé / mauvais projet
  | null; // pas de raison de désactiver

/// FCM v1 : 404 NOT_FOUND et 403 SENDER_ID_MISMATCH sont définitifs.
/// 400 INVALID_ARGUMENT l'est aussi quand il porte sur le jeton.
/// 429 et 5xx sont transitoires (retry avec backoff côté appelant).
export function fcmUnreachableReason(
  status: number,
  body?: string,
): UnreachableReason {
  if (status === 404) return 'unregistered';
  if (status === 403) return 'invalid_token';
  if (status === 400) {
    const b = (body ?? '').toUpperCase();
    // Un 400 générique peut venir d'un payload fautif : dans le doute,
    // on ne désactive PAS l'appareil (le corriger est notre travail,
    // pas le sien).
    return b.includes('INVALID_ARGUMENT') && b.includes('TOKEN')
      ? 'invalid_token'
      : null;
  }
  return null;
}

/// APNs : 410 Gone signifie « l'app n'est plus installée » ; le corps
/// porte `BadDeviceToken` ou `Unregistered` selon le cas.
export function apnsUnreachableReason(
  status: number,
  body?: string,
): UnreachableReason {
  if (status === 410) return 'unregistered';
  if (status === 400) {
    const b = body ?? '';
    if (b.includes('BadDeviceToken') || b.includes('DeviceTokenNotForTopic')) {
      return 'invalid_token';
    }
    return null;
  }
  return null;
}

/// Interprète le `reason` renvoyé par nos providers
/// (`fcm_404`, `apns_410`, `fcm_exception`…).
///
/// C'est le point d'entrée pratique : `NotificationsService` ne voit que
/// cette chaîne, pas le statut HTTP brut.
export function reasonToUnreachable(
  providerReason: string | undefined,
  body?: string,
): UnreachableReason {
  if (!providerReason) return null;
  const match = /^(fcm|apns)_(\d{3})$/.exec(providerReason);
  if (!match) return null;
  const status = Number(match[2]);
  return match[1] === 'apns'
    ? apnsUnreachableReason(status, body)
    : fcmUnreachableReason(status, body);
}

/// L'échec justifie-t-il une nouvelle tentative ?
///
/// Utile à l'ordonnanceur : inutile de replanifier un envoi vers un
/// appareil désinstallé.
export function isRetryable(providerReason: string | undefined): boolean {
  if (!providerReason) return false;
  if (reasonToUnreachable(providerReason) !== null) return false;
  const match = /^(fcm|apns)_(\d{3})$/.exec(providerReason);
  if (!match) {
    // `fcm_exception`, `apns_exception`, `fcm_disabled`… : seules les
    // exceptions réseau méritent une nouvelle tentative.
    return providerReason.endsWith('_exception');
  }
  const status = Number(match[2]);
  return status === 429 || status >= 500;
}
