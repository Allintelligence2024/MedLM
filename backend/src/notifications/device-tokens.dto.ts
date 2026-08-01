// DTOs d'enregistrement des jetons d'appareil (audit P1-3).
import { z } from 'zod';

export const RegisterDeviceTokenBody = z.object({
  /// Jeton FCM/APNs. Les jetons FCM font ~160 caractères ; on borne
  /// large pour ne pas casser sur une évolution de format, mais on
  /// borne quand même (un @Body non borné est un vecteur d'abus).
  token: z.string().min(16).max(4096),
  platform: z.enum(['android', 'ios', 'web']),
  /// Identifiant d'appareil côté client. Optionnel dans le corps :
  /// l'en-tête `X-Device-Id`, déjà envoyé systématiquement par
  /// l'ApiClient mobile, fait autorité quand il est présent.
  device_id: z.string().min(8).max(128).optional(),
  app_version: z.string().max(32).optional(),
  /// Langue d'affichage — le serveur rédige les notifications dedans.
  locale: z.enum(['fr', 'ar', 'en']).optional(),
});
export type RegisterDeviceTokenBody = z.infer<typeof RegisterDeviceTokenBody>;

export const UnregisterDeviceTokenBody = z.object({
  device_id: z.string().min(8).max(128).optional(),
});
export type UnregisterDeviceTokenBody = z.infer<typeof UnregisterDeviceTokenBody>;

export interface DeviceTokenView {
  device_id: string;
  platform: 'android' | 'ios' | 'web';
  app_version: string | null;
  locale: string | null;
  disabled: boolean;
  last_seen_at: string;
}
