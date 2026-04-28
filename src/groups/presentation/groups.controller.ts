import {
  Controller,
  Post,
  Patch,
  Delete,
  Get,
  Body,
  Param,
  UseGuards,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GroupUseCase } from '../domain/group.usecase';
import { GroupRepository } from '../infrastructure/group.repository';
import { AuthRepository } from '../../auth/infrastructure/auth.repository';
import { LocationsGateway } from '../../locations/presentation/locations.gateway';
import { MessageRepository } from '../../messages/infrastructure/message.repository';
import {
  CreateGroupDto,
  JoinGroupDto,
  RenameGroupDto,
  TransferOwnerDto,
} from './groups.dto';


interface AuthenticatedUser {
  userId: string;
  email: string;
}

function mapGroupAdminError(err: unknown): never {
  const msg = err instanceof Error ? err.message : '';
  if (msg === 'GROUP_NOT_FOUND') throw new NotFoundException('Group not found');
  if (msg === 'NOT_OWNER')
    throw new ForbiddenException('Only the group owner can do this');
  if (msg === 'CANNOT_KICK_SELF')
    throw new BadRequestException(
      'You cannot remove yourself; transfer ownership or leave',
    );
  if (msg === 'TARGET_NOT_IN_GROUP')
    throw new BadRequestException('User is not a member of this group');
  if (msg === 'NEW_OWNER_NOT_MEMBER')
    throw new BadRequestException('New owner must be a member of the group');
  throw err;
}

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(
    private readonly groupUseCase: GroupUseCase,
    private readonly groupRepo: GroupRepository,
    private readonly authRepo: AuthRepository,
    private readonly locationsGateway: LocationsGateway,
    private readonly messageRepository: MessageRepository,
  ) {}

  @Post()
  async createGroup(
    @Body() dto: CreateGroupDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const currentUser = await this.authRepo.findById(user.userId);
    if (!currentUser) throw new NotFoundException('User not found');
    const groupLimit = currentUser.maxGroups + currentUser.extraGroupsPurchased;
    if (currentUser.groupIds.length >= groupLimit) {
      throw new BadRequestException('Límite de grupos alcanzado');
    }

    try {
      const group = await this.groupUseCase.createGroup(
        user.userId,
        currentUser.nickname,
        currentUser.color,
        dto.name,
      );
      // Creator is also added to their own groupIds array
      await this.authRepo.addGroupToUser(user.userId, group.id);
      return { data: group, message: 'Grupo creado' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'CODE_GENERATION_FAILED') {
        throw new BadRequestException('Could not generate unique code, retry');
      }
      throw err;
    }
  }

  @Post('join')
  @HttpCode(HttpStatus.OK)
  async joinGroup(
    @Body() dto: JoinGroupDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const currentUser = await this.authRepo.findById(user.userId);
    if (!currentUser) throw new NotFoundException('User not found');
    const groupLimit = currentUser.maxGroups + currentUser.extraGroupsPurchased;
    if (currentUser.groupIds.length >= groupLimit) {
      throw new BadRequestException('Límite de grupos alcanzado');
    }

    try {
      const group = await this.groupUseCase.joinGroup(
        dto.code,
        user.userId,
        currentUser.nickname,
        currentUser.color,
      );
      await this.authRepo.addGroupToUser(user.userId, group.id);

      const displayName = currentUser.nickname?.trim() || currentUser.name;
      this.locationsGateway.server
        .to(`group:${group.id}`)
        .emit('group:member:joined', {
          groupId: group.id,
          member: {
            userId: currentUser.id,
            name: displayName,
            color: currentUser.color,
            avatar: currentUser.avatar ?? null,
            isOnline: true,
            battery: dto.battery ?? currentUser.lastBattery ?? null,
            location: null,
          },
        });

      const [groupWithPresence] = await this.groupRepo.findManyById([group.id]);

      return { data: groupWithPresence ?? group, message: 'Te uniste al grupo' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'GROUP_NOT_FOUND')
        throw new NotFoundException('Invalid or inactive group code');
      if (msg === 'GROUP_FULL')
        throw new BadRequestException('El grupo está lleno');
      if (msg === 'ALREADY_IN_GROUP')
        throw new BadRequestException('Ya eres miembro de este grupo');
      throw err;
    }
  }

  @Get('mine')
  async getMyGroups(@CurrentUser() user: AuthenticatedUser) {
    const currentUser = await this.authRepo.findById(user.userId);
    if (!currentUser) throw new NotFoundException('User not found');

    if (currentUser.groupIds.length === 0) {
      return { data: [] };
    }

    const groups = await this.groupRepo.findManyById(currentUser.groupIds);
    return { data: groups };
  }

  /** Each member’s persisted route for this group (null if they have none). Use after app open to hydrate the map. */
  @Get(':groupId/active-routes')
  async getGroupActiveRoutes(
    @Param('groupId') groupId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const currentUser = await this.authRepo.findById(user.userId);
    if (!currentUser) throw new NotFoundException('User not found');
    if (!currentUser.groupIds.includes(groupId)) {
      throw new ForbiddenException('Not a member of this group');
    }
    const data = await this.authRepo.findActiveRoutesForGroup(groupId);
    return { data };
  }

  @Patch(':groupId/name')
  async renameGroup(
    @Param('groupId') groupId: string,
    @Body() dto: RenameGroupDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    try {
      const group = await this.groupUseCase.renameGroup(
        groupId,
        user.userId,
        dto.name,
      );
      this.locationsGateway.server
        .to(`group:${groupId}`)
        .emit('group:renamed', { groupId, name: dto.name });
      return { data: group, message: 'Nombre actualizado' };
    } catch (err: unknown) {
      mapGroupAdminError(err);
    }
  }

  @Patch(':groupId/owner')
  async transferOwnership(
    @Param('groupId') groupId: string,
    @Body() dto: TransferOwnerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    try {
      const group = await this.groupUseCase.transferOwnership(
        groupId,
        user.userId,
        dto.newOwnerId,
      );
      this.locationsGateway.server
        .to(`group:${groupId}`)
        .emit('group:owner:changed', { groupId, newOwnerId: dto.newOwnerId });
      return { data: group, message: 'Liderazgo transferido' };
    } catch (err: unknown) {
      mapGroupAdminError(err);
    }
  }

  @Delete(':groupId/members/:targetUserId')
  @HttpCode(HttpStatus.OK)
  async kickMember(
    @Param('groupId') groupId: string,
    @Param('targetUserId') targetUserId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    try {
      const group = await this.groupUseCase.kickMember(
        groupId,
        user.userId,
        targetUserId,
      );
      this.locationsGateway.server
        .to(`group:${groupId}`)
        .emit('group:member:kicked', { groupId, userId: targetUserId });
      return { data: group, message: 'Miembro expulsado' };
    } catch (err: unknown) {
      mapGroupAdminError(err);
    }
  }

  @Delete(':groupId/leave')
  @HttpCode(HttpStatus.OK)
  async leaveGroup(
    @Param('groupId') groupId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const currentUser = await this.authRepo.findById(user.userId);
    if (!currentUser) throw new NotFoundException('User not found');
    if (!currentUser.groupIds.includes(groupId)) {
      throw new BadRequestException('No perteneces a este grupo');
    }

    try {
      await this.groupUseCase.leaveGroup(groupId, user.userId);
      await this.authRepo.removeGroupFromUser(user.userId, groupId);
      this.locationsGateway.server
        .to(`group:${groupId}`)
        .emit('group:member:left', { groupId, userId: user.userId });
      return { message: 'Saliste del grupo' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'GROUP_NOT_FOUND')
        throw new NotFoundException('Group not found');
      if (msg === 'NOT_A_MEMBER')
        throw new BadRequestException('You are not a member of this group');
      throw err;
    }
  }

  @Delete(':groupId')
  @HttpCode(HttpStatus.OK)
  async dissolveGroup(
    @Param('groupId') groupId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    try {
      await this.groupUseCase.dissolveGroup(groupId, user.userId);
      await this.messageRepository.deleteByGroupId(groupId);
      this.locationsGateway.server
        .to(`group:${groupId}`)
        .emit('group:dissolved', { groupId });
      return { message: 'Grupo disuelto' };
    } catch (err: unknown) {
      mapGroupAdminError(err);
    }
  }
}
