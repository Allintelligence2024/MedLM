import {
  Controller,
  Get,
  Headers,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { GoogleOAuthService } from './google-oauth.service';
import { Public } from './public.decorator';

const CallbackQuery = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

@Controller('auth/google')
@Public()
export class GoogleOAuthController {
  constructor(private readonly service: GoogleOAuthService) {}

  /// GET /v1/auth/google — renvoie l'URL d'autorisation.
  /// Le client (mobile) ouvre cette URL dans un WebView, capture le
  /// callback, et envoie le `code` à /v1/auth/google/callback.
  @Get()
  authorize(@Headers('X-State') state: string) {
    return { url: this.service.authorizationUrl({ state: state ?? 'mobile' }) };
  }

  /// GET /v1/auth/google/callback?code=…&state=…
  /// Pour les apps web (redirect depuis Google). Pour le mobile, on
  /// utilise plutôt POST /v1/auth/google/token avec le `code` reçu.
  @Get('callback')
  async callback(
    @Query() query: unknown,
    @Res() res: Response,
  ) {
    const { code, state } = CallbackQuery.parse(query);
    const tokens = await this.service.handleCallback({
      code,
      state,
      platform: 'web',
    });
    // Redirige vers le front avec les tokens en query (à améliorer :
    // passer par un fragment ou un POST).
    const dest = `/auth/success?access_token=${encodeURIComponent(tokens.access_token)}`;
    res.redirect(dest);
  }
}
