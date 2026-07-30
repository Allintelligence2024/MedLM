import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { MagicLinkService } from './magic-link.service';
import { Public } from './public.decorator';

const MagicLinkRequestBody = z.object({
  email: z.string().email(),
});
const MagicLinkVerifyQuery = z.object({
  token: z.string().min(10),
});

@Controller('auth/magic-link')
@Public()
export class MagicLinkController {
  constructor(private readonly service: MagicLinkService) {}

  /// POST /v1/auth/magic-link — demande un lien par email.
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async request(@Body() body: unknown) {
    const { email } = MagicLinkRequestBody.parse(body);
    return this.service.request({ email });
  }

  /// GET /v1/auth/magic-link/verify?token=…  — vérifie et émet tokens.
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @Query() query: unknown,
    @Headers('X-Platform') platform: string,
  ) {
    const { token } = MagicLinkVerifyQuery.parse(query);
    return this.service.verify({ token, platform: platform ?? 'web' });
  }
}
