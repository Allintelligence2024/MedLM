import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { LoginBody, SignupBody } from './auth.dto';

const RefreshBody = z.object({
  refresh_token: z.string().min(10),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(
    @Body() body: unknown,
    @Headers('X-Platform') platform: string,
    @Headers('X-App-Version') appVersion?: string,
  ) {
    const b = SignupBody.parse(body);
    return this.service.signup({ ...b, platform: platform ?? 'unknown', appVersion });
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Headers('X-Platform') platform: string,
    @Headers('X-App-Version') appVersion?: string,
  ) {
    const b = LoginBody.parse(body);
    return this.service.login({ ...b, platform: platform ?? 'unknown', appVersion });
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
