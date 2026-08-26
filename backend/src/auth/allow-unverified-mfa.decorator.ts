// Décorateur pour les endpoints MFA accessibles même quand
// l'admin n'a pas encore validé son MFA (setup, verify, enable).
//
// Usage :
//   @Post('verify')
//   @AllowUnverifiedMfa()
//   async verify(...) { ... }
import { SetMetadata } from '@nestjs/common';

export const ALLOW_UNVERIFIED_MFA_KEY = 'allowUnverifiedMfa';
export const AllowUnverifiedMfa = () => SetMetadata(ALLOW_UNVERIFIED_MFA_KEY, true);
