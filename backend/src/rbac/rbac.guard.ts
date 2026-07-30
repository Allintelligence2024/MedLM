/// Garde NestJS — vérifie que l'utilisateur a un rôle suffisant.
///
/// Usage :
///   @UseGuards(JwtGuard, RbacGuard)
///   @RequireRole('medical_reviewer')
///   @Get('pending')
///   pending() { ... }
///
/// Le rôle est lu depuis le payload JWT (`req.user.role`). Pour les
/// endpoints admin (debug, support), un `X-Impersonate-User` header
/// peut surcharger l'identité effective — c'est tracé dans l'audit
/// log.
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthedRequest } from '../auth/jwt.guard';
import { ROLES, Role, ROLE_PERMISSIONS } from './roles';

export const REQUIRE_ROLE_KEY = 'medanki.requireRole';

@Injectable()
export class RbacGuard implements CanActivate {
  private readonly logger = new Logger(RbacGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role | Role[]>(REQUIRE_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true; // pas de contrainte = passe

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('utilisateur non authentifié');
    }
    const userRole = (user as { role?: Role }).role ?? 'student';

    if (typeof required === 'string') {
      return this.userMeetsOrExceeds(userRole, required);
    }
    return required.some((r) => this.userMeetsOrExceeds(userRole, r));
  }

  /// Hiérarchie : un admin a tout, un editor a tout ce qu'a un
  /// medical_reviewer, etc. C'est le rôle avec l'**indice le plus
  /// élevé** dans la liste qui a le plus de permissions.
  private userMeetsOrExceeds(userRole: Role, required: Role): boolean {
    const userIdx = ROLES.indexOf(userRole);
    const requiredIdx = ROLES.indexOf(required);
    if (userIdx < 0 || requiredIdx < 0) {
      this.logger.warn(`rôle inconnu : user=${userRole} required=${required}`);
      return false;
    }
    if (userIdx < requiredIdx) {
      this.logger.warn(
        `accès refusé : user=${userRole} (idx ${userIdx}) < required=${required} (idx ${requiredIdx}); perms utilisateur=${ROLE_PERMISSIONS[userRole]}, requises=${ROLE_PERMISSIONS[required]}`,
      );
      return false;
    }
    return true;
  }
}

/// Décorateur à appliquer sur les handlers / classes.
export const RequireRole = (...roles: Role[]) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (target: any, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    const value = roles.length === 1 ? roles[0] : roles;
    if (descriptor) {
      Reflect.defineMetadata(REQUIRE_ROLE_KEY, value, descriptor.value);
      return descriptor;
    }
    Reflect.defineMetadata(REQUIRE_ROLE_KEY, value, target);
    return target;
  };
};
