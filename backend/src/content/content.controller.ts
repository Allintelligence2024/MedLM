// ContentController — endpoints REST du contenu (Phases 3, 5, 11 bis).
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ContentService } from './content.service';
import { DeckCardsQuery, ListDecksQuery, ReportBody, UpdateCardBody, TransitionBody, PresignBody, UpdateReportBody } from './content.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUserId } from '../auth/jwt.decorators';
import { RbacGuard, RequireRole } from '../rbac/rbac.guard';

@Controller('content')
@UseGuards(JwtGuard, RbacGuard)
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

  @Get('cards/list')
  async listCards(@Query() query: unknown) {
    // Phase 11 bis : alias pratique pour le CMS.
    const q = ListDecksQuery.parse(query);
    return this.service.listCardsForCms({
      moduleId: q.module_id,
      limit: q.limit ?? 50,
    });
  }

  @Get('cards/:id')
  async getCard(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getCard(id);
  }

  @Patch('cards/:id')
  @RequireRole('author')
  async updateCard(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    const b = UpdateCardBody.parse(body);
    return this.service.updateCard({ userId, cardId: id, body: b });
  }

  @Post('cards/:id/transition')
  @RequireRole('author')
  async transitionCard(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    const b = TransitionBody.parse(body);
    return this.service.transitionCard({ userId, cardId: id, to: b.to, comment: b.comment });
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

  // ── Reports (Phase 11 bis) ─────────────────────────────────────

  @Get('reports')
  @RequireRole('medical_reviewer')
  async listReports() {
    return this.service.listReports();
  }

  @Patch('reports/:id')
  @RequireRole('medical_reviewer')
  async updateReport(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    const b = UpdateReportBody.parse(body);
    return this.service.updateReport({ id, status: b.status, comment: b.comment });
  }

  // ── Media (Phase 11 bis) ───────────────────────────────────────

  @Post('media/presign')
  @RequireRole('author')
  @HttpCode(HttpStatus.CREATED)
  async presignMedia(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
  ) {
    const b = PresignBody.parse(body);
    return this.service.presignMedia({ userId, ...b });
  }
}
