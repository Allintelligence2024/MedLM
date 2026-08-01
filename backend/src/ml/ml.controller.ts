// MlController — Phase 20.3 (lecture seule, données propres à l'utilisateur).
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUserId } from '../auth/jwt.decorators';
import { MlService } from './ml.service';

@Controller('ml')
@UseGuards(JwtGuard)
export class MlController {
  constructor(private readonly service: MlService) {}

  /// GET /v1/ml/mock-exam-prediction — prédiction explicable du score
  /// au prochain examen blanc (ou refus k-anonymat documenté).
  @Get('mock-exam-prediction')
  async mockExamPrediction(@CurrentUserId() userId: string) {
    return this.service.predictMockExam(userId);
  }

  /// GET /v1/ml/tag-focus — suggestions focus/relax par tag.
  @Get('tag-focus')
  async tagFocus(@CurrentUserId() userId: string) {
    return this.service.tagFocus(userId);
  }
}
