// GatewayController — Phase 20.2 : POST /v2/graphql.
//
// Lecture seule (opérations persistées, voir persisted-operations.ts).
// Feature flag : GRAPHQL_ENABLED=false → 503 (déploiement progressif).
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtGuard, AuthedRequest } from '../auth/jwt.guard';
import { CurrentUserId } from '../auth/jwt.decorators';
import { GraphqlGatewayBody } from './gateway.dto';
import { GatewayService } from './gateway.service';

@Controller('v2/graphql')
@UseGuards(JwtGuard)
export class GatewayController {
  constructor(private readonly service: GatewayService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async execute(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    if ((process.env.GRAPHQL_ENABLED ?? 'false') !== 'true') {
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        errors: [
          {
            message: 'gateway GraphQL désactivé (GRAPHQL_ENABLED)',
            code: 'GATEWAY_DISABLED',
          },
        ],
      });
    }

    const parsed = GraphqlGatewayBody.parse(body ?? {});
    const headers = req.headers as unknown as Record<
      string,
      string | string[] | undefined
    >;
    const rawAuth = headers['authorization'];
    const jwt = (Array.isArray(rawAuth) ? rawAuth[0] ?? '' : rawAuth ?? '').replace(
      /^Bearer\s+/i,
      '',
    );
    if (!jwt) {
      throw new UnauthorizedException('jeton requis');
    }

    const result = await this.service.execute({
      userId,
      jwt,
      queryText: parsed.query,
      ...(parsed.variables !== undefined && { variables: parsed.variables }),
    });
    if (!result.ok) {
      return res
        .status(result.httpStatus)
        .json({ errors: result.errors });
    }
    return res.json({ data: result.data });
  }
}
