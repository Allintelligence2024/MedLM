// TenantsController — endpoints REST.
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { AddUserBody, CreateTenantBody } from './tenants.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { RbacGuard, RequireRole } from '../rbac/rbac.guard';
import { CurrentUserId } from '../auth/jwt.decorators';
import { Public } from '../auth/public.decorator';

@Controller('tenants')
@UseGuards(JwtGuard, RbacGuard)
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  /// POST /v1/tenants — crée un tenant (admin plateforme).
  @Post()
  @RequireRole('admin')
  async create(@Body() body: unknown) {
    const b = CreateTenantBody.parse(body);
    return this.service.create({ body: b });
  }

  /// GET /v1/tenants?mine=true — liste les tenants de l'utilisateur.
  @Get()
  async list(
    @CurrentUserId() userId: string,
    @Query('mine') mine?: string,
  ) {
    if (mine === 'true') {
      return this.service.listForUser({ userId });
    }
    // Sinon, on retourne le tenant de l'user (pour l'instant,
    // un user appartient à un seul tenant — à étendre Phase 18).
    const tenants = await this.service.listForUser({ userId });
    return tenants;
  }

  /// GET /v1/tenants/:id — détail (admin du tenant ou admin plateforme).
  @Get(':id')
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.get(id);
  }

  /// POST /v1/tenants/:id/users — ajoute un user.
  @Post(':id/users')
  @RequireRole('admin')
  async addUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    const b = AddUserBody.parse(body);
    return this.service.addUser({ tenantId: id, userId: b.user_id, role: b.role });
  }

  /// DELETE /v1/tenants/:id/users/:userId — retire un user.
  @Delete(':id/users/:userId')
  @RequireRole('admin')
  async removeUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.service.removeUser({ tenantId: id, userId });
  }
}

/// Controller séparé pour le branding public (pas d'auth requise).
@Controller('tenants/public')
export class PublicTenantController {
  constructor(private readonly service: TenantsService) {}

  @Public()
  @Get('branding')
  async branding(@Query('slug') slug: string) {
    if (!slug) return null;
    return this.service.getBrandingBySlug(slug);
  }
}
