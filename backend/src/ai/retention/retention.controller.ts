// RetentionController — Phase 18.5.
//
// GET  /v1/ai/retention/preview  — simulation sans envoi (rôle admin)
// POST /v1/ai/retention/scan     — balayage + envoi réel (rôle admin)
//
// En production, un CronJob K8s (deploy/k8s) appellera /scan à 09:30
// et 18:30 — pile dans la fenêtre 8h-22h. L'endpoint reste utile à la
// main pour debug (via l'impersonation admin, Phase 11).
import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { RetentionService } from './retention.service';
import { JwtGuard } from '../../auth/jwt.guard';
import { RbacGuard, RequireRole } from '../../rbac/rbac.guard';

@Controller('ai/retention')
@UseGuards(JwtGuard, RbacGuard)
export class RetentionController {
  constructor(private readonly service: RetentionService) {}

  @Get('preview')
  @RequireRole('admin')
  async preview() {
    return this.service.previewRun();
  }

  @Post('scan')
  @RequireRole('admin')
  async scan() {
    return this.service.runScan();
  }
}
