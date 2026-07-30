import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

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
          // Mode dev : HS256 avec un secret statique. NE JAMAIS utiliser en prod.
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
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
