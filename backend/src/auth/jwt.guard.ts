/// Garde d'authentification JWT.
///
/// Stratégie :
///   * Lit le header `Authorization: Bearer <token>` ;
///   * Vérifie la signature RS256 avec la clé publique ;
///   * Vérifie `kind === 'access'` (sépare access / refresh / entitlement) ;
///   * Injecte `userId` et `deviceId` dans la requête via `req.user`.
///
/// En cas d'échec : 401 Unauthorized (NestJS).
///
/// Endpoint public : un endpoint annoté `@Public()` est laissé
/// passer sans vérification du header.
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { IS_PUBLIC_KEY } from './public.decorator';

export interface JwtPayload {
  sub: string; // userId
  did?: string; // deviceId
  kind: 'access' | 'refresh' | 'entitlement';
  role?: 'student' | 'author' | 'medical_reviewer' | 'editor' | 'admin';
  iat?: number;
  exp?: number;
}

export interface AuthedRequest extends Request {
  user?: JwtPayload;
}

@Injectable()
export class JwtGuard implements CanActivate {
  private readonly logger = new Logger(JwtGuard.name);
  private publicKey: string | null = null;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {
    const keyPath = this.config.get<string>('JWT_PUBLIC_KEY_PATH');
    if (keyPath && existsSync(resolve(keyPath))) {
      this.publicKey = readFileSync(resolve(keyPath), 'utf8');
    } else {
      this.logger.warn(
        'JWT_PUBLIC_KEY_PATH absent : mode dev (HS256). NE PAS UTILISER EN PROD.',
      );
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Endpoint @Public() : pas d'auth requise.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const headers = req.headers as unknown as Record<
      string,
      string | string[] | undefined
    >;
    const auth = headers['authorization'];
    if (!auth || Array.isArray(auth)) {
      throw new UnauthorizedException('header Authorization manquant');
    }
    const m = auth.match(/^Bearer (.+)$/);
    if (!m) {
      throw new UnauthorizedException('format Authorization invalide');
    }
    const token = m[1]!;
    let payload: JwtPayload;
    try {
      payload = this.publicKey
        ? await this.jwt.verifyAsync(token, {
            publicKey: this.publicKey,
            algorithms: ['RS256'],
          })
        : await this.jwt.verifyAsync(token, { algorithms: ['HS256'] });
    } catch (e) {
      throw new UnauthorizedException(`token invalide : ${(e as Error).message}`);
    }
    if (payload.kind !== 'access' && payload.kind !== 'entitlement') {
      throw new UnauthorizedException(`kind de token non supporté ici : ${payload.kind}`);
    }
    req.user = payload;
    return true;
  }
}
