import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ContentService } from './content.service';
import { DeckCardsQuery, ListDecksQuery, ReportBody } from './content.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUserId } from '../auth/jwt.decorators';

@Controller('content')
@UseGuards(JwtGuard)
export class ContentController {
  constructor(private readonly service: ContentService) {}

  @Get('decks')
  async listDecks(@Query() query: unknown) {
    const q = ListDecksQuery.parse(query);
    return this.service.listDecks({
      moduleId: q.module_id,
      versionSince: q.version_since,
      limit: q.limit,
    });
  }

  @Get('decks/:id/cards')
  async deckCards(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: unknown) {
    const q = DeckCardsQuery.parse(query);
    return this.service.listDeckCards({
      deckId: id,
      versionSince: q.version_since,
      limit: q.limit,
    });
  }

  @Post('cards/:id/report')
  @HttpCode(HttpStatus.CREATED)
  async report(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    const r = ReportBody.parse(body);
    return this.service.reportCard({
      userId,
      cardId: id,
      reason: r.reason,
      comment: r.comment,
    });
  }
}
