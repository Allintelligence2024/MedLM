import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { MagicLinkService } from './magic-link.service';
import { Public } from './public.decorator';

const MagicLinkRequestBody = z.object({
  email: z.string().email(),
});
const MagicLinkVerifyBody = z.object({
  token: z.string().min(10),
});

@Controller('auth/magic-link')
@Public()
export class MagicLinkController {
  constructor(private readonly service: MagicLinkService) {}

  /// POST /v1/auth/magic-link — demande un lien par email.
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async request(@Body() body: unknown, @Req() req: Request) {
    const { email } = MagicLinkRequestBody.parse(body);
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      undefined;
    return this.service.request({ email, ip });
  }

  /// POST /v1/auth/magic-link/verify — vérifie et émet les tokens.
  /// Le token est dans le corps (jamais dans l'URL) pour éviter qu'il
  /// ne fuite dans les logs / historiques de navigateur.
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @Body() body: unknown,
    @Headers('X-Platform') platform: string,
  ) {
    const { token } = MagicLinkVerifyBody.parse(body);
    return this.service.verify({ token, platform: platform ?? 'web' });
  }
}
