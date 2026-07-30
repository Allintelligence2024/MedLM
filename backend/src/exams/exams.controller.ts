// ExamsController — endpoints REST des examens.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ExamsService } from './exams.service';
import { AnswerBody, StartExamBody, SubmitExamBody } from './exams.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUserId } from '../auth/jwt.decorators';

@Controller('exams')
@UseGuards(JwtGuard)
export class ExamsController {
  constructor(private readonly service: ExamsService) {}

  /// POST /v1/exams/attempts — démarre une tentative. Le timer
  /// serveur est posé ICI (now()).
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
  /// Renvoie le score + la liste des questions ratées.
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

  /// GET /v1/exams/attempts/:id — récupère l'état courant (utile
  /// pour la reprise après crash).
  @Get('attempts/:id')
  async get(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    // Pas de méthode dédiée pour l'instant — on retourne un stub.
    // (Phase 10 bis : implémenter proprement le suivi de progression.)
    return { id, userId, status: 'in_progress_or_unknown' };
  }
}
