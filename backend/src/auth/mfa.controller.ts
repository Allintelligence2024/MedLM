import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { Public } from './public.decorator';
import { MfaService } from './mfa.service';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { CurrentUserId } from './jwt.decorators';

const SetupBody = z.object({
  enrollment_token: z.string().min(20),
});
const EnableBody = z.object({
  enrollment_token: z.string().min(20),
  code: z.string().regex(/^[0-9]{6}$/),
});
const VerifyBody = z.object({
  mfa_token: z.string().min(20),
  code: z.string().regex(/^[0-9]{6}$/).optional(),
  backup_code: z.string().min(6).max(32).optional(),
});
const ReplaceBeginBody = z.object({
  current_code: z.string().regex(/^[0-9]{6}$/),
});
const ReplaceConfirmBody = z.object({
  new_code: z.string().regex(/^[0-9]{6}$/),
});

@Controller('auth/mfa')
export class MfaController {
  constructor(
    private readonly mfa: MfaService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @Throttle({ long: { limit: 5, ttl: 900_000 } })
  async setup(@Body() body: unknown) {
    const b = SetupBody.parse(body);
    return this.mfa.setup({ enrollmentToken: b.enrollment_token });
  }

  @Public()
  @Post('enable')
  @HttpCode(HttpStatus.OK)
  @Throttle({ long: { limit: 5, ttl: 900_000 } })
  async enable(
    @Body() body: unknown,
    @Headers('X-Platform') platform: string,
    @Headers('X-Device-Id') deviceId?: string,
  ) {
    const b = EnableBody.parse(body);
    const { userId, backup_codes } = await this.mfa.enable({
      enrollmentToken: b.enrollment_token,
      code: b.code,
    });
    const session = await this.auth.issueFullSession({
      userId,
      platform: platform ?? 'web',
      ...(deviceId ? { deviceToken: deviceId } : {}),
    });
    return { ...session, backup_codes };
  }

  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ long: { limit: 5, ttl: 900_000 } })
  async verify(
    @Body() body: unknown,
    @Headers('X-Platform') platform: string,
    @Headers('X-Device-Id') deviceId?: string,
  ) {
    const b = VerifyBody.parse(body);
    const { userId } = await this.mfa.verify({
      mfaToken: b.mfa_token,
      ...(b.code !== undefined && { code: b.code }),
      ...(b.backup_code !== undefined && { backupCode: b.backup_code }),
    });
    return this.auth.issueFullSession({
      userId,
      platform: platform ?? 'web',
      ...(deviceId ? { deviceToken: deviceId } : {}),
    });
  }

  @UseGuards(JwtGuard)
  @Post('replace/begin')
  @HttpCode(HttpStatus.OK)
  @Throttle({ long: { limit: 5, ttl: 900_000 } })
  async replaceBegin(@CurrentUserId() userId: string, @Body() body: unknown) {
    const b = ReplaceBeginBody.parse(body);
    return this.mfa.beginReplace({ userId, currentCode: b.current_code });
  }

  @UseGuards(JwtGuard)
  @Post('replace/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ long: { limit: 5, ttl: 900_000 } })
  async replaceConfirm(@CurrentUserId() userId: string, @Body() body: unknown) {
    const b = ReplaceConfirmBody.parse(body);
    return this.mfa.confirmReplace({ userId, newCode: b.new_code });
  }
}
