import {
  Body,
  Controller,
  GoneException,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

const RefreshBody = z.object({
  refresh_token: z.string().min(10),
});

@Controller('auth')
@Public()
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.GONE)
  async signup() {
    throw new GoneException(
      'Inscription par email désactivée : utilisez POST /auth/magic-link pour recevoir un lien de connexion.',
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.GONE)
  async login() {
    throw new GoneException(
      'Connexion par email/mot de passe désactivée : utilisez POST /auth/magic-link pour recevoir un lien de connexion.',
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() body: unknown,
    @Headers('X-Platform') platform: string,
  ) {
    const { refresh_token } = RefreshBody.parse(body);
    return this.service.refresh({ refreshToken: refresh_token, platform: platform ?? 'web' });
  }
}
