// Décorateur @Public() — marque un endpoint ou un contrôleur
// comme public (pas d'auth requise).
//
// Utilisation :
//   @Controller('auth')
//   @Public()
//   export class AuthController { ... }
//
//   // OU méthode par méthode :
//   @Public()
//   @Post('login')
//   async login(...) { ... }
//
// Le `JwtGuard` (cf. auth/jwt.guard.ts) détecte ce décorateur via
// `Reflector` et laisse passer la requête.

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
