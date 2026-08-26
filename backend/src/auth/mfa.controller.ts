import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { MfaService } from './mfa.service';
import { JwtGuard } from './jwt.guard';
import { CurrentUser } from './jwt.decorators';
import { BadRequestException } from '@nestjs/common';

const SetupResponse = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
  backupCodes: z.array(z.string()),
});

const EnableBody = z.object({
  code: z.string().min(6).max(6),
});

const VerifyBody = z.object({
  code: z.string().min(6).max(10),
});

@Controller('auth/mfa')
@UseGuards(JwtGuard)
export class MfaController {
  constructor(private readonly service: MfaService) {}

  @Post('setup')
  async setup(@CurrentUser() userId: string) {
    const result = await this.service.setup(userId);
    return SetupResponse.parse(result);
  }

  @Post('enable')
  async enable(@CurrentUser() userId: string, @Body() body: unknown) {
    const { code } = EnableBody.parse(body);
    await this.service.enable(userId, code);
    return { enabled: true };
  }

  @Post('verify')
  async verify(@CurrentUser() userId: string, @Body() body: unknown) {
    const { code } = VerifyBody.parse(body);
    const valid = await this.service.verify(userId, code);
    if (!valid) {
      throw new BadRequestException('code MFA invalide');
    }
    const tokens = await this.service.getAuthService().issueMfaTokens(userId, 'web');
    return tokens;
  }

  @Post('disable')
  async disable(@CurrentUser() userId: string, @Body() body: unknown) {
    const { code } = EnableBody.parse(body);
    await this.service.disable(userId, code);
    return { disabled: true };
  }

  @Post('regenerate-backup')
  async regenerateBackup(@CurrentUser() userId: string, @Body() body: unknown) {
    const { code } = EnableBody.parse(body);
    const backupCodes = await this.service.regenerateBackupCodes(userId, code);
    return { backupCodes };
  }
}
