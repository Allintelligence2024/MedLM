// DeckKeysController — endpoints REST pour la distribution des
// clés de déchiffrement des decks premium (Phase 14).
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DeckKeysService } from './deck-keys.service';
import { WrapKeyQuery } from './deck-keys.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUserId } from '../auth/jwt.decorators';

@Controller('decks')
@UseGuards(JwtGuard)
export class DeckKeysController {
  constructor(private readonly service: DeckKeysService) {}

  /// GET /v1/decks/:id/wrap-key — wrap la clé AES du deck pour
  /// l'appareil courant.
  @Get(':id/wrap-key')
  @HttpCode(HttpStatus.OK)
  async wrap(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: unknown,
  ) {
    const q = WrapKeyQuery.parse(query);
    return this.service.wrapKey({
      userId,
      deckId: id,
      clientPublicKeyPem: q.client_public_key,
      deviceId: q.device_id,
    });
  }

  /// DELETE /v1/decks/:id/wrap-key?device_id=... — révoque la clé
  /// d'un device (ex. perte d'un téléphone).
  @Delete(':id/wrap-key')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: unknown,
  ) {
    const q = WrapKeyQuery.pick({ device_id: true }).parse(query);
    return this.service.revokeKey({ userId, deckId: id, deviceId: q.device_id });
  }
}
