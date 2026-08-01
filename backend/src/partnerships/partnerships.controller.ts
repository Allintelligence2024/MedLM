// PartnershipsController — Phase 20.4.
//
// GET   /v1/partnerships            — liste (rôle author+, lecture CMS)
// POST  /v1/partnerships            — création draft (rôle editor+)
// PATCH /v1/partnerships/:id/status — transition (rôle editor+)
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { RbacGuard, RequireRole } from '../rbac/rbac.guard';
import { PartnershipsService } from './partnerships.service';
import {
  PartnershipCreateBody,
  PartnershipStatusBody,
} from './partnerships.dto';

@Controller('partnerships')
@UseGuards(JwtGuard, RbacGuard)
export class PartnershipsController {
  constructor(private readonly service: PartnershipsService) {}

  @Get()
  @RequireRole('author')
  async list(@Query('status') status?: string) {
    return this.service.list(status);
  }

  @Post()
  @RequireRole('editor')
  async create(@Body() body: unknown) {
    const parsed = PartnershipCreateBody.parse(body ?? {});
    return this.service.create(parsed);
  }

  @Patch(':id/status')
  @RequireRole('editor')
  async transition(@Param('id') id: string, @Body() body: unknown) {
    const parsed = PartnershipStatusBody.parse(body ?? {});
    return this.service.transition(id, parsed.status);
  }
}
