import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginBody, SignupBody } from './auth.dto';

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
}
