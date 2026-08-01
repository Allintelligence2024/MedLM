import { Global, Module } from '@nestjs/common';
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

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const keyPath = config.get<string>('JWT_SIGNING_KEY_PATH');
        const ttl = config.get<number>('JWT_ACCESS_TTL_SECONDS') ?? 900;

        if (!keyPath) {
          return {
            secret: 'dev-only-secret-do-not-use-in-prod',
            signOptions: { expiresIn: ttl, algorithm: 'HS256' },
          };
        }
        const key = readFileSync(resolve(keyPath), 'utf8');
        return {
          privateKey: key,
          signOptions: { expiresIn: ttl, algorithm: 'RS256' },
        };
      },
    }),
  ],
  providers: [
    AuthService,
    MagicLinkService,
    GoogleOAuthService,
    // Token EMAIL_SENDER (pas la classe) : MagicLinkService injecte
    // l'interface EmailSender via ce token — voir magic-link.service.ts.
    { provide: EMAIL_SENDER, useClass: ResendEmailSender },
  ],
  controllers: [
    AuthController,
    MagicLinkController,
    GoogleOAuthController,
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
