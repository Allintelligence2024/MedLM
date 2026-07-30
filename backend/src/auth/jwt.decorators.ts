/// Décorateurs utilitaires pour extraire l'identité de la requête.
///
/// Usage :
///   @Get('me')
///   @UseGuards(JwtGuard)
///   me(@CurrentUser() user: JwtPayload) { return user; }
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthedRequest, JwtPayload } from './jwt.guard';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload | undefined => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    return req.user;
  },
);

/// Helper pratique : retourne le userId garanti non null derrière un JwtGuard.
export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) throw new Error('CurrentUserId utilisé sans JwtGuard');
    return req.user.sub;
  },
);
