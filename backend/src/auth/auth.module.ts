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

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Toute la règle vit dans jwt-config.ts (pure, testée) : en
        // production, l'absence de clé RS256 fait ÉCHOUER le démarrage
        // au lieu de retomber en silence sur un secret du dépôt.
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
