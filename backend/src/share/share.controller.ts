// ShareController — endpoints REST.
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ShareService } from './share.service';
import { CreateShareBody } from './share.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUserId } from '../auth/jwt.decorators';

@Controller('share')
@UseGuards(JwtGuard)
export class ShareController {
  constructor(private readonly service: ShareService) {}

  /// POST /v1/share — crée une carte de partage pour un mock exam.
  @Post()
  async create(@CurrentUserId() userId: string, @Body() body: unknown) {
    const b = CreateShareBody.parse(body);
    return this.service.createShare({ userId, body: b });
  }

  /// GET /v1/share/:id — métadonnées publiques (utilisé par la
  /// page de prévisualisation du lien partagé).
  @Get(':id')
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getPublic(id);
  }
}
