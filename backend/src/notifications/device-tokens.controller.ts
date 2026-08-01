// DeviceTokensController — enregistrement des appareils (audit P1-3).
//
// C'était le maillon manquant : le mobile n'avait aucun endroit où
// déposer son jeton FCM, donc aucune notification n'était adressable.
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUserId } from '../auth/jwt.decorators';
import { DeviceTokensService } from './device-tokens.service';
import {
  RegisterDeviceTokenBody,
  UnregisterDeviceTokenBody,
} from './device-tokens.dto';

@Controller('notifications/devices')
@UseGuards(JwtGuard)
export class DeviceTokensController {
  constructor(private readonly service: DeviceTokensService) {}

  /// POST /v1/notifications/devices — enregistre / rafraîchit un jeton.
  ///
  /// Idempotent : le mobile appelle à chaque démarrage et à chaque
  /// rotation de jeton FCM, sans avoir à savoir si c'est un ajout.
  @Post()
  @HttpCode(HttpStatus.OK)
  async register(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('x-device-id') headerDeviceId?: string,
  ) {
    const dto = RegisterDeviceTokenBody.parse(body);
    const deviceId = resolveDeviceId(headerDeviceId, dto.device_id);
    return this.service.register({ userId, deviceId, body: dto });
  }

  /// GET /v1/notifications/devices — appareils actifs du compte.
  @Get()
  async list(@CurrentUserId() userId: string) {
    return { devices: await this.service.activeFor(userId) };
  }

  /// DELETE /v1/notifications/devices — désactive l'appareil courant.
  @Delete()
  @HttpCode(HttpStatus.OK)
  async unregister(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('x-device-id') headerDeviceId?: string,
  ) {
    const dto = UnregisterDeviceTokenBody.parse(body ?? {});
    const deviceId = resolveDeviceId(headerDeviceId, dto.device_id);
    return this.service.unregister({ userId, deviceId });
  }
}

/// L'en-tête fait autorité sur le corps : il est posé par l'ApiClient
/// pour toutes les requêtes et ne peut pas diverger d'un appel à
/// l'autre. Le corps sert de repli pour les clients qui ne le posent pas.
export function resolveDeviceId(
  headerDeviceId: string | undefined,
  bodyDeviceId: string | undefined,
): string {
  // `??` ne suffit pas : un en-tête présent mais blanc (proxy qui
  // réécrit, client bogué) masquerait le device_id du corps.
  const fromHeader = (headerDeviceId ?? '').trim();
  const candidate = fromHeader.length > 0 ? fromHeader : (bodyDeviceId ?? '').trim();
  if (candidate.length < 8) {
    throw new BadRequestException(
      'device_id manquant : fournir l\'en-tête X-Device-Id ou le champ device_id',
    );
  }
  return candidate.slice(0, 128);
}
