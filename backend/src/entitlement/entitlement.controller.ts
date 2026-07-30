// EntitlementController — endpoint public pour le mobile.
import { Controller, Get, Headers, UseGuards } from '@nestjs/common';
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
    if (!deviceId) throw new Error('X-Device-Id header manquant');
    return this.service.issue(userId, deviceId);
  }
}
