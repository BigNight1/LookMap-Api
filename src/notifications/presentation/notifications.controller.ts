import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationUseCase } from '../domain/notification.usecase';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationUseCase: NotificationUseCase) {}

  @Get()
  async list(
    @CurrentUser() user: { userId: string },
    @Query('limit') limitStr?: string,
  ) {
    const parsed = limitStr ? parseInt(limitStr, 10) : 50;
    const limit = Number.isFinite(parsed) ? parsed : 50;
    const data = await this.notificationUseCase.findByUserId(user.userId, limit);
    return { data };
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  async readAll(@CurrentUser() user: { userId: string }) {
    await this.notificationUseCase.markAllAsRead(user.userId);
    return { message: 'ok' };
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteAll(@CurrentUser() user: { userId: string }) {
    await this.notificationUseCase.deleteAllByUserId(user.userId);
    return { message: 'ok' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteOne(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    await this.notificationUseCase.deleteById(id, user.userId);
    return { message: 'ok' };
  }
}
