// Tests audit P1-3 — registre des appareils.
//
// Avant ce lot, aucune table ne stockait vers QUI envoyer un push :
// NotificationsService savait construire et router un message, mais le
// mobile n'avait nulle part où déposer son jeton FCM.
import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { resolveDeviceId } from '../../src/notifications/device-tokens.controller';
import {
  RegisterDeviceTokenBody,
  UnregisterDeviceTokenBody,
} from '../../src/notifications/device-tokens.dto';

const VALID_TOKEN = 'f'.repeat(160);
const VALID_DEVICE = 'device-0123456789';

describe('RegisterDeviceTokenBody (Zod)', () => {
  it('accepte une inscription minimale', () => {
    const parsed = RegisterDeviceTokenBody.parse({
      token: VALID_TOKEN,
      platform: 'android',
    });
    expect(parsed.platform).toBe('android');
    expect(parsed.device_id).toBeUndefined();
  });

  it('accepte les champs optionnels', () => {
    const parsed = RegisterDeviceTokenBody.parse({
      token: VALID_TOKEN,
      platform: 'ios',
      device_id: VALID_DEVICE,
      app_version: '1.2.3+45',
      locale: 'ar',
    });
    expect(parsed.locale).toBe('ar');
    expect(parsed.app_version).toBe('1.2.3+45');
  });

  it('refuse une plateforme inconnue', () => {
    expect(() =>
      RegisterDeviceTokenBody.parse({ token: VALID_TOKEN, platform: 'windows' }),
    ).toThrow();
  });

  it('refuse un jeton trop court', () => {
    expect(() =>
      RegisterDeviceTokenBody.parse({ token: 'court', platform: 'android' }),
    ).toThrow();
  });

  it('borne la taille du jeton (un @Body non borné est un vecteur d\'abus)', () => {
    expect(() =>
      RegisterDeviceTokenBody.parse({
        token: 'x'.repeat(4097),
        platform: 'android',
      }),
    ).toThrow();
  });

  it('refuse une locale hors du trilinguisme du produit', () => {
    expect(() =>
      RegisterDeviceTokenBody.parse({
        token: VALID_TOKEN,
        platform: 'android',
        locale: 'es',
      }),
    ).toThrow();
  });

  it('UnregisterDeviceTokenBody accepte un corps vide', () => {
    expect(UnregisterDeviceTokenBody.parse({})).toEqual({});
  });
});

describe('resolveDeviceId', () => {
  it('privilégie l\'en-tête X-Device-Id', () => {
    // L'ApiClient mobile le pose sur TOUTES les requêtes : il ne peut
    // pas diverger d'un appel à l'autre, contrairement au corps.
    expect(resolveDeviceId('header-0123456789', 'body-0123456789')).toBe(
      'header-0123456789',
    );
  });

  it('retombe sur le corps si l\'en-tête est absent', () => {
    expect(resolveDeviceId(undefined, VALID_DEVICE)).toBe(VALID_DEVICE);
  });

  it('ignore un en-tête vide ou blanc', () => {
    expect(resolveDeviceId('   ', VALID_DEVICE)).toBe(VALID_DEVICE);
  });

  it('rejette l\'absence totale d\'identifiant', () => {
    expect(() => resolveDeviceId(undefined, undefined)).toThrow(BadRequestException);
  });

  it('rejette un identifiant trop court (jamais généré par le client)', () => {
    expect(() => resolveDeviceId('abc', undefined)).toThrow(BadRequestException);
  });

  it('tronque à 128 caractères (borne de la colonne)', () => {
    const long = 'd'.repeat(400);
    expect(resolveDeviceId(long, undefined)).toHaveLength(128);
  });
});
