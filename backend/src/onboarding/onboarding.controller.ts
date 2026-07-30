// OnboardingController — endpoint REST du flow d'onboarding.
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { OnboardingBody } from './onboarding.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUserId } from '../auth/jwt.decorators';

@Controller('onboarding')
@UseGuards(JwtGuard)
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}

  /// POST /v1/onboarding — soumet les réponses d'onboarding.
  /// Le client mobile collecte les 5 réponses (faculté, année,
  /// expérience, modules, daily goal) et appelle cet endpoint.
  @Post()
  async submit(@CurrentUserId() userId: string, @Body() body: unknown) {
    const b = OnboardingBody.parse(body);
    return this.service.submit({ userId, body: b });
  }
}
