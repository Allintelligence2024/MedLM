// GroupPacksController — endpoints REST.
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GroupPacksService } from './group-packs.service';
import { CreatePackBody, JoinPackBody } from './group-packs.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUserId } from '../auth/jwt.decorators';

@Controller('group-packs')
@UseGuards(JwtGuard)
export class GroupPacksController {
  constructor(private readonly service: GroupPacksService) {}

  /// POST /v1/group-packs — crée un nouveau pack (l'appelant
  /// devient coordinateur + 1er membre).
  @Post()
  async create(@CurrentUserId() userId: string, @Body() body: unknown) {
    const b = CreatePackBody.parse(body);
    return this.service.create({ userId, body: b });
  }

  /// POST /v1/group-packs/join — rejoint un pack via invite_code.
  @Post('join')
  async join(@CurrentUserId() userId: string, @Body() body: unknown) {
    const b = JoinPackBody.parse(body);
    return this.service.join({ userId, body: b });
  }

  /// GET /v1/group-packs/:id — état d'un pack.
  @Get(':id')
  async get(
    @CurrentUserId() _userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.get({ packId: id, userId: _userId });
  }

  /// GET /v1/group-packs?invite_code=ABC123 — état par code.
  @Get()
  async getByCode(
    @CurrentUserId() userId: string,
    @Query('invite_code') inviteCode: string,
  ) {
    return this.service.get({ inviteCode, userId });
  }
}
