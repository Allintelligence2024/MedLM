// DTO — POST /v2/graphql (Phase 20.2).
import { z } from 'zod';

export const GraphqlGatewayBody = z
  .object({
    /// Texte de la requête — doit correspondre EXACTEMENT à une
    /// opération persistée (normalisée) ; 4 Ko max.
    query: z.string().min(1).max(4000),
    variables: z.record(z.unknown()).optional(),
    /// operationName accepté pour compatibilité clients — mais non
    /// décisionnel : l'empreinte du texte fait foi.
    operationName: z.string().max(120).optional(),
  })
  .strict();
export type GraphqlGatewayBody = z.infer<typeof GraphqlGatewayBody>;
