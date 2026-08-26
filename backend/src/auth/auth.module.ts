import { Global, Logger, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { EMAIL_SENDER, MagicLinkService } from './magic-link.service';
import { MagicLinkController } from './magic-link.controller';
import { GoogleOAuthService } from './google-oauth.service';
import { GoogleOAuthController } from './google-oauth.controller';
import { ResendEmailSender } from './email-sender.service';
import { buildJwtConfig } from './jwt-config';
import { MfaService } from './mfa.service';
import { MfaController } from './mfa.controller';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const built = buildJwtConfig({
          keyPath: config.get<string>('JWT_SIGNING_KEY_PATH'),
          ttlSeconds: config.get<number>('JWT_ACCESS_TTL_SECONDS') ?? 900,
          nodeEnv: config.get<string>('NODE_ENV') ?? process.env.NODE_ENV,
          readKey: (path) => readFileSync(resolve(path), 'utf8'),
        });
        if (built.fallbackReason) {
          new Logger('AuthModule').warn(built.fallbackReason);
        }
        const { fallbackReason: _ignored, ...jwtOptions } = built;
        return jwtOptions;
      },
    }),
  ],
  providers: [
    AuthService,
    MagicLinkService,
    GoogleOAuthService,
    MfaService,
    { provide: EMAIL_SENDER, useClass: ResendEmailSender },
  ],
  controllers: [
    AuthController,
    MagicLinkController,
    GoogleOAuthController,
    MfaController,
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
