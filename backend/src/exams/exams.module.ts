import { Module } from '@nestjs/common';
import { ExamsService } from './exams.service';
import { ExamsController } from './exams.controller';
import { ExamTemplatesService } from './exam_templates.service';
import { ScoringService } from './scoring.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [BillingModule],
  providers: [ExamsService, ExamTemplatesService, ScoringService],
  controllers: [ExamsController],
  exports: [ExamsService, ExamTemplatesService, ScoringService],
})
export class ExamsModule {}
