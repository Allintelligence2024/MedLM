import {
  Controller,
  Get,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
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
  authorize(@Res() res: Response) {
    // Le state doit être créé par le serveur et lié au navigateur, pas
    // accepté depuis X-State : sinon un attaquant peut initier un login
    // OAuth CSRF avec son propre compte.
    const state = randomBytes(32).toString('base64url');
    res.cookie('oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
    });
    return res.json({ url: this.service.authorizationUrl({ state }) });
  }

  /// GET /v1/auth/google/callback?code=…&state=…
  /// Pour les apps web (redirect depuis Google). Pour le mobile, on
  /// utilise plutôt POST /v1/auth/google/token avec le `code` reçu.
  @Get('callback')
  async callback(
    @Query() query: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { code, state } = CallbackQuery.parse(query);
    const cookieHeader = req.headers.cookie ?? '';
    const expected = cookieHeader.match(/(?:^|;\\s*)oauth_state=([^;]+)/)?.[1];
    if (!expected || expected.length !== state.length ||
        !timingSafeEqual(Buffer.from(expected), Buffer.from(state))) {
      return res.status(400).json({ message: 'state OAuth invalide ou expiré' });
    }
    res.clearCookie('oauth_state');
    const tokens = await this.service.handleCallback({
      code,
      state,
      platform: 'web',
    });
    // Ne jamais placer un access token dans une query string : URL, logs et
    // referers peuvent le conserver. Le client échange ce JSON via HTTPS.
    return res.json(tokens);
  }
}
