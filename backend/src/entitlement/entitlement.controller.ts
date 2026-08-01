// EntitlementController — endpoint public pour le mobile.
import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { EntitlementService } from './entitlement.service';
import { CurrentUserId } from '../auth/jwt.decorators';
import { JwtGuard } from '../auth/jwt.guard';

@Controller('entitlement')
export class EntitlementController {
  constructor(private readonly service: EntitlementService) {}

  /// GET /v1/entitlement/jwt — émet un nouveau JWT signé.
  /// L'app le stocke dans le Keystore et le vérifie hors ligne.
  @Get('jwt')
  @UseGuards(JwtGuard)
  async jwt(
    @CurrentUserId() userId: string,
    @Headers('X-Device-Id') deviceId: string,
  ) {
    // BadRequestException (400), pas Error (500) : un en-tête manquant
    // est une faute de l'APPELANT. Un `Error` nu remonte en 500, ce qui
    // dit au client « le serveur est cassé » alors que c'est sa requête
    // qui l'est — et déclenche des alertes 5xx pour rien.
    // srs-sync.controller.ts faisait déjà correctement ce contrôle.
    if (!deviceId) {
      throw new BadRequestException('X-Device-Id header manquant');
    }
    return this.service.issue(userId, deviceId);
  }
}
