// MlModule — Phase 20.3 (prédiction explicable, calcul 100 % local).
import { Module } from '@nestjs/common';
import { MlController } from './ml.controller';
import { MlService } from './ml.service';

@Module({
  controllers: [MlController],
  providers: [MlService],
  exports: [MlService],
})
export class MlModule {}
