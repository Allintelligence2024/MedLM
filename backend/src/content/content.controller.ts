// ContentController — lectures apprenant vs éditoriales (phase 2).
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
} from "@nestjs/common";
import { ContentService } from "./content.service";
import {
  DeckCardsQuery,
  ListDecksQuery,
  ReportBody,
  UpdateCardBody,
  TransitionBody,
  PresignBody,
  UpdateReportBody,
} from "./content.dto";
import { JwtGuard } from "../auth/jwt.guard";
import { CurrentUserId, CurrentUserRole } from "../auth/jwt.decorators";
import { RbacGuard, RequireRole } from "../rbac/rbac.guard";
import { actorOf } from "./content-policy";
import type { Role } from "../rbac/roles";

@Controller("content")
@UseGuards(JwtGuard, RbacGuard)
export class ContentController {
  constructor(private readonly service: ContentService) {}

  @Get("decks")
  async listDecks(@Query() query: unknown) {
    const q = ListDecksQuery.parse(query);
    return this.service.listDecks({
      ...(q.module_id !== undefined && { moduleId: q.module_id }),
      versionSince: q.version_since,
      limit: q.limit,
    });
  }

  @Get("decks/:id/cards")
  async deckCards(
    @CurrentUserId() userId: string,
    @CurrentUserRole() role: Role,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query() query: unknown,
  ) {
    const q = DeckCardsQuery.parse(query);
    return this.service.listDeckCards({
      actor: actorOf(userId, role),
      deckId: id,
      versionSince: q.version_since,
      limit: q.limit,
    });
  }

  @Get("cards/list")
  @RequireRole("author")
  async listCards(
    @CurrentUserId() userId: string,
    @CurrentUserRole() role: Role,
    @Query() query: unknown,
  ) {
    const q = ListDecksQuery.parse(query);
    return this.service.listCardsForCms({
      actor: actorOf(userId, role),
      ...(q.module_id !== undefined && { moduleId: q.module_id }),
      limit: q.limit ?? 50,
    });
  }

  @Get("cards/:id")
  async getCard(
    @CurrentUserId() userId: string,
    @CurrentUserRole() role: Role,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.service.getCard({ actor: actorOf(userId, role), cardId: id });
  }

  @Patch("cards/:id")
  @RequireRole("author")
  async updateCard(
    @CurrentUserId() userId: string,
    @CurrentUserRole() role: Role,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    const b = UpdateCardBody.parse(body);
    return this.service.updateCard({
      actor: actorOf(userId, role),
      cardId: id,
      body: b,
    });
  }

  @Post("cards/:id/transition")
  @RequireRole("author")
  async transitionCard(
    @CurrentUserId() userId: string,
    @CurrentUserRole() role: Role,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    const b = TransitionBody.parse(body);
    return this.service.transitionCard({
      actor: actorOf(userId, role),
      cardId: id,
      to: b.to,
      ...(b.comment !== undefined && { comment: b.comment }),
      ...(b.admin_override !== undefined && {
        adminOverride: b.admin_override,
      }),
    });
  }

  @Post("cards/:id/report")
  @HttpCode(HttpStatus.CREATED)
  async report(
    @CurrentUserId() userId: string,
    @CurrentUserRole() role: Role,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    const r = ReportBody.parse(body);
    return this.service.reportCard({
      actor: actorOf(userId, role),
      cardId: id,
      reason: r.reason,
      comment: r.comment,
    });
  }

  @Get("reports")
  @RequireRole("medical_reviewer")
  async listReports() {
    return this.service.listReports();
  }

  @Patch("reports/:id")
  @RequireRole("medical_reviewer")
  async updateReport(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    const b = UpdateReportBody.parse(body);
    return this.service.updateReport({
      id,
      status: b.status,
      ...(b.comment !== undefined && { comment: b.comment }),
    });
  }

  @Post("media/presign")
  @RequireRole("author")
  @HttpCode(HttpStatus.CREATED)
  async presignMedia(@CurrentUserId() userId: string, @Body() body: unknown) {
    const b = PresignBody.parse(body);
    return this.service.presignMedia({ userId, ...b });
  }
}
