/// Filtre d'exception global — transforme les ZodError en 400.
///
/// Les 21 contrôleurs de l'API valident leurs entrées via
/// `Schema.parse(body)` (zod, 45 sites d'appel). Sans ce filtre, une
/// ZodError brute remonte au gestionnaire par défaut de Nest et
/// devient un **500 Internal Server Error** :
///   * contrat d'API cassé — le client mobile distingue 400 (corriger
///     la requête) de 500 (réessayer plus tard) ;
///   * faux signal en observabilité — les 500 déclenchent les alertes
///     Sentry/metrics pour une simple erreur de saisie utilisateur.
///
/// Trouvé par test/integration/srs-sync.controller.test.ts (batch
/// > 100 → 500 au lieu de 400) lors de l'audit du 2026-08-01.
import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { ZodError } from 'zod';
import type { Response } from 'express';

@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter<ZodError> {
  catch(exception: ZodError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(400).json({
      statusCode: 400,
      error: 'Bad Request',
      message: 'payload invalide',
      issues: exception.issues.map((i) => ({
        path: i.path.join('.'),
        code: i.code,
        message: i.message,
      })),
    });
  }
}
