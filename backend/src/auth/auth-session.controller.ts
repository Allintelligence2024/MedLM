import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { CurrentUserId } from './jwt.decorators';

@Controller('auth')
@UseGuards(JwtGuard)
export class AuthSessionController {
  constructor(private readonly service: AuthService) {}

  @Get('me')
  me(@CurrentUserId() userId: string) {
    return this.service.me(userId);
  }

  @Get('devices')
  devices(@CurrentUserId() userId: string) {
    return this.service.listDevices(userId);
  }

  @Delete('devices/:id')
  @HttpCode(HttpStatus.OK)
  revokeDevice(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.revokeDevice(userId, id);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  logoutAll(@CurrentUserId() userId: string) {
    return this.service.logoutAll(userId);
  }
}
