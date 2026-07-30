// ExamsController — endpoints REST des examens (Phases 10 + 10 bis).
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
import { ExamsService } from './exams.service';
import { AnswerBody, StartExamBody, SubmitExamBody } from './exams.dto';
import { CheatEventBody, ListTemplatesQuery } from './exam_templates.dto';
import { ExamTemplatesService } from './exam_templates.service';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUserId } from '../auth/jwt.decorators';

@Controller('exams')
@UseGuards(JwtGuard)
export class ExamsController {
  constructor(
    private readonly service: ExamsService,
    private readonly templates: ExamTemplatesService,
  ) {}

  // ── Templates (Phase 10 bis) ─────────────────────────────────

  /// GET /v1/exams/templates — liste filtrée des templates actifs.
  @Get('templates')
  async listTemplates(@Query() query: unknown) {
    const q = ListTemplatesQuery.parse(query);
    return this.templates.listTemplates({
      moduleId: q.module_id,
      faculty: q.faculty,
      studyYear: q.study_year,
    });
  }

  /// POST /v1/exams/templates/:id/generate — génère une tentative
  /// à partir d'un template (pioche aléatoire des questions).
  @Post('templates/:id/generate')
  @HttpCode(HttpStatus.CREATED)
  async generate(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.templates.generateAttempt({ userId, templateId: id });
  }

  // ── Tentatives (Phase 10) ────────────────────────────────────

  /// POST /v1/exams/attempts — démarre une tentative. Le timer
  /// serveur est posé ICI (now()). Legacy : utilisé quand on a
  /// déjà un examQuestions templateId. Pour un sujet paramétré,
  /// préférer POST /templates/:id/generate.
  @Post('attempts')
  @HttpCode(HttpStatus.CREATED)
  async start(@CurrentUserId() userId: string, @Body() body: unknown) {
    const b = StartExamBody.parse(body);
    return this.service.start({ userId, templateId: b.template_id });
  }

  /// POST /v1/exams/attempts/:id/answers — sauvegarde d'une réponse.
  @Post('attempts/:id/answers')
  @HttpCode(HttpStatus.NO_CONTENT)
  async saveAnswer(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    const a = AnswerBody.parse(body);
    await this.service.saveAnswer({ userId, attemptId: id, answer: a });
  }

  /// POST /v1/exams/attempts/:id/submit — soumission finale.
  @Post('attempts/:id/submit')
  @HttpCode(HttpStatus.OK)
  async submit(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    const b = SubmitExamBody.parse(body);
    return this.service.submit({ userId, attemptId: id, body: b });
  }

  /// GET /v1/exams/attempts/:id — récupère l'état courant
  /// (utile pour la reprise après crash) + suspicion score.
  @Get('attempts/:id')
  async get(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return {
      id,
      userId,
      status: 'in_progress_or_unknown',
      suspicion_score: await this.templates.suspicionScore(id),
    };
  }

  // ── Anti-triche (Phase 10 bis) ───────────────────────────────

  /// POST /v1/exams/attempts/:id/events — log d'un événement
  /// anti-triche (focus loss, paste, switch_tab...).
  @Post('attempts/:id/events')
  @HttpCode(HttpStatus.ACCEPTED)
  async recordEvent(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    const e = CheatEventBody.parse(body);
    return this.templates.recordCheatEvent({
      userId,
      attemptId: id,
      kind: e.kind,
      metadata: e.metadata,
      clientTs: e.client_ts,
    });
  }
}
