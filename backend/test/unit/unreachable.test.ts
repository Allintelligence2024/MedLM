// Tests audit P1-3 — appareils devenus injoignables.
//
// `DeviceTokensService.markUnreachable()` existait sans aucun appelant :
// FCM et APNs signalent les désinstallations, mais personne
// n'interprétait leurs codes. On retentait donc indéfiniment des envois
// vers des appareils morts — compteurs d'échec gonflés, vraies pannes
// masquées.
//
// L'enjeu de ces tests est la frontière entre PERMANENT et TRANSITOIRE.
// Se tromper coûte dans les deux sens : désactiver un appareil vivant le
// prive de notifications ; garder un appareil mort pollue les métriques.
import { describe, it, expect } from 'vitest';
import {
  apnsUnreachableReason,
  fcmUnreachableReason,
  isRetryable,
  reasonToUnreachable,
} from '../../src/notifications/unreachable';

describe('FCM', () => {
  it('404 NOT_FOUND → application désinstallée', () => {
    expect(fcmUnreachableReason(404)).toBe('unregistered');
  });

  it('403 SENDER_ID_MISMATCH → jeton d\'un autre projet', () => {
    expect(fcmUnreachableReason(403)).toBe('invalid_token');
  });

  it('400 portant sur le jeton → jeton invalide', () => {
    expect(
      fcmUnreachableReason(400, '{"error":{"status":"INVALID_ARGUMENT","message":"Invalid registration token"}}'),
    ).toBe('invalid_token');
  });

  it('400 générique → on ne désactive PAS', () => {
    // Un payload fautif est notre faute, pas celle de l'appareil :
    // le désactiver punirait l'utilisateur pour notre bug.
    expect(fcmUnreachableReason(400, '{"error":"payload too large"}')).toBeNull();
    expect(fcmUnreachableReason(400)).toBeNull();
  });

  it('429 et 5xx sont transitoires', () => {
    for (const status of [429, 500, 502, 503]) {
      expect(fcmUnreachableReason(status)).toBeNull();
    }
  });

  it('200 n\'est évidemment pas un motif de désactivation', () => {
    expect(fcmUnreachableReason(200)).toBeNull();
  });
});

describe('APNs', () => {
  it('410 Gone → application désinstallée', () => {
    expect(apnsUnreachableReason(410)).toBe('unregistered');
  });

  it('400 BadDeviceToken → jeton invalide', () => {
    expect(apnsUnreachableReason(400, '{"reason":"BadDeviceToken"}')).toBe(
      'invalid_token',
    );
  });

  it('400 DeviceTokenNotForTopic → jeton d\'un autre bundle', () => {
    expect(
      apnsUnreachableReason(400, '{"reason":"DeviceTokenNotForTopic"}'),
    ).toBe('invalid_token');
  });

  it('400 PayloadTooLarge → notre faute, appareil conservé', () => {
    expect(apnsUnreachableReason(400, '{"reason":"PayloadTooLarge"}')).toBeNull();
  });

  it('429 TooManyRequests et 503 sont transitoires', () => {
    expect(apnsUnreachableReason(429)).toBeNull();
    expect(apnsUnreachableReason(503)).toBeNull();
  });
});

describe('reasonToUnreachable — ce que voit NotificationsService', () => {
  it('traduit les motifs de nos providers', () => {
    expect(reasonToUnreachable('fcm_404')).toBe('unregistered');
    expect(reasonToUnreachable('apns_410')).toBe('unregistered');
    expect(reasonToUnreachable('fcm_403')).toBe('invalid_token');
  });

  it('410 côté FCM n\'est PAS un code de désinstallation', () => {
    // Les deux plateformes n'utilisent pas les mêmes codes : confondre
    // les tables désactiverait des appareils au hasard.
    expect(reasonToUnreachable('fcm_410')).toBeNull();
  });

  it('404 côté APNs ne désactive pas non plus', () => {
    expect(reasonToUnreachable('apns_404')).toBeNull();
  });

  it('ignore les motifs non HTTP', () => {
    for (const reason of [
      undefined,
      'fcm_disabled',
      'apns_disabled',
      'fcm_exception',
      'apns_jwt_failed',
      'outside_window',
    ]) {
      expect(reasonToUnreachable(reason)).toBeNull();
    }
  });
});

describe('isRetryable', () => {
  it('un appareil désinstallé ne se retente pas', () => {
    expect(isRetryable('fcm_404')).toBe(false);
    expect(isRetryable('apns_410')).toBe(false);
  });

  it('429 et 5xx se retentent', () => {
    expect(isRetryable('fcm_429')).toBe(true);
    expect(isRetryable('fcm_503')).toBe(true);
    expect(isRetryable('apns_500')).toBe(true);
  });

  it('les exceptions réseau se retentent', () => {
    expect(isRetryable('fcm_exception')).toBe(true);
    expect(isRetryable('apns_exception')).toBe(true);
  });

  it('un provider désactivé ne se retente pas', () => {
    // Réessayer ne configurera pas FCM par magie.
    expect(isRetryable('fcm_disabled')).toBe(false);
    expect(isRetryable('apns_disabled')).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });

  it('hors fenêtre horaire : pas un échec à retenter ici', () => {
    // La fenêtre 8h–22h est gérée en amont par NotificationsService.
    expect(isRetryable('outside_window')).toBe(false);
  });
});
