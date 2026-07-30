import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ContentService } from './content.service';
import { DeckCardsQuery, ListDecksQuery, ReportBody } from './content.dto';

@Controller('content')
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
    @Headers('X-User-Id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    if (!userId) throw new Error('X-User-Id header manquant');
    const r = ReportBody.parse(body);
    return this.service.reportCard({
      userId,
      cardId: id,
      reason: r.reason,
      comment: r.comment,
    });
  }
}
