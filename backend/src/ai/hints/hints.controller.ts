// HintsController — Phase 18.1.
//
// GET /v1/ai/hints/:cardId?lang=fr
// Retourne le hint contextuel de la carte pour l'utilisateur courant.
// Le mobile l'affiche sous la carte pendant la session d'étude.
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { HintsService } from './hints.service';
import { HintQuery } from './hints.dto';
import { JwtGuard } from '../../auth/jwt.guard';
import { CurrentUserId } from '../../auth/jwt.decorators';

@Controller('ai/hints')
@UseGuards(JwtGuard)
export class HintsController {
  constructor(private readonly service: HintsService) {}

  @Get(':cardId')
  async getHint(
    @CurrentUserId() userId: string,
    @Param('cardId', new ParseUUIDPipe()) cardId: string,
    @Query() query: unknown,
  ) {
    const q = HintQuery.parse(query);
    return this.service.getHintForCard({
      userId,
      cardId,
      ...(q.lang !== undefined && { langOverride: q.lang }),
    });
  }
}
