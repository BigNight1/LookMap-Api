import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthRepository } from '../../auth/infrastructure/auth.repository';
import { MessageUseCase } from '../domain/message.usecase';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(
    private readonly messageUseCase: MessageUseCase,
    private readonly authRepo: AuthRepository,
  ) {}

  @Get(':groupId')
  async getByGroup(
    @Param('groupId') groupId: string,
    @CurrentUser() user: { userId: string },
    @Query('limit') limitStr?: string,
    @Query('before') before?: string,
  ) {
    const current = await this.authRepo.findById(user.userId);
    if (!current?.groupIds.includes(groupId)) {
      throw new ForbiddenException('Not a member of this group');
    }

    const parsed = limitStr ? parseInt(limitStr, 10) : 50;
    const limit = Number.isFinite(parsed) ? parsed : 50;

    const data = await this.messageUseCase.findByGroupId(groupId, limit, before);
    return { data };
  }
}
