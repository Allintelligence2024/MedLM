import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Body,
} from '@nestjs/common';
import { z } from 'zod';
import { GoogleOAuthService } from './google-oauth.service';
import { Public } from './public.decorator';

const GoogleTokenBody = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

const CallbackQuery = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

@Controller('auth/google')
@Public()
export class GoogleOAuthController {
  constructor(private readonly service: GoogleOAuthService) {}

  /// GET /v1/auth/google — renvoie l'URL d'autorisation et un state
  /// à usage unique généré côté serveur.
  @Get()
  async authorize() {
    const { url, state } = await this.service.authorizationUrl();
    return { url, state };
  }

  /// GET /v1/auth/google/callback — utilisé par les apps web (redirect
  /// depuis Google). Retourne les tokens en JSON (jamais en query string).
  @Get('callback')
  async callback(
    @Query() query: Record<string, any>,
    @Headers('X-State') clientState: string,
  ) {
    const { code } = CallbackQuery.parse(query);
    const serverState = clientState ?? query['state'];
    const tokens = await this.service.handleCallback({ code, state: String(serverState), platform: 'web' });
    return tokens;
  }

  /// POST /v1/auth/google/token — utilisé par le mobile après extraction
  /// du code depuis le WebView. Pas de tokens dans l'URL.
  @Post('token')
  @HttpCode(HttpStatus.OK)
  async token(@Body() body: unknown) {
    const { code, state } = GoogleTokenBody.parse(body);
    const tokens = await this.service.handleCallback({ code, state, platform: 'mobile' });
    return tokens;
  }
}
