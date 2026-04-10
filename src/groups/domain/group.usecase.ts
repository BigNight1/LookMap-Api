import { GroupEntity } from './entities/group.entity';
import { IGroupRepository } from './IGroupRepository';
import { IAuthRepository } from '../../auth/domain/IAuthRepository';

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LENGTH = 6;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export class GroupUseCase {
  constructor(
    private readonly groupRepo: IGroupRepository,
    private readonly authRepo: IAuthRepository,
  ) {}

  async createGroup(
    userId: string,
    nickname: string,
    color: string,
    name: string,
  ): Promise<GroupEntity> {
    // Generate a unique code — retry up to 5 times on collision
    let code = generateCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await this.groupRepo.findByCode(code);
      if (!existing) break;
      if (attempt === 4) throw new Error('CODE_GENERATION_FAILED');
      code = generateCode();
    }

    return this.groupRepo.create({
      name,
      code,
      ownerId: userId,
      members: [{ userId, nickname, color, joinedAt: new Date() }],
    });
  }

  async joinGroup(
    code: string,
    userId: string,
    nickname: string,
    color: string,
  ): Promise<GroupEntity> {
    // 1. Group must exist and be active
    const group = await this.groupRepo.findByCode(code.toUpperCase());
    if (!group || !group.isActive) throw new Error('GROUP_NOT_FOUND');

    // 2. Group must not be full
    if (group.members.length >= group.maxMembers) throw new Error('GROUP_FULL');

    // 3. User must not already be a member of this group
    const alreadyMember = group.members.some((m) => m.userId === userId);
    if (alreadyMember) throw new Error('ALREADY_IN_GROUP');

    return this.groupRepo.addMember(group.id, {
      userId,
      nickname,
      color,
      joinedAt: new Date(),
    });
  }

  async leaveGroup(groupId: string, userId: string): Promise<void> {
    const group = await this.groupRepo.findById(groupId);
    if (!group) throw new Error('GROUP_NOT_FOUND');

    const isMember = group.members.some((m) => m.userId === userId);
    if (!isMember) throw new Error('NOT_A_MEMBER');

    const remainingMembers = group.members.filter((m) => m.userId !== userId);

    if (remainingMembers.length === 0) {
      // Last member left — deactivate the group
      await this.groupRepo.deactivate(groupId);
    } else {
      await this.groupRepo.removeMember(groupId, userId);
    }
  }

  async getGroup(groupId: string): Promise<GroupEntity> {
    const group = await this.groupRepo.findById(groupId);
    if (!group || !group.isActive) throw new Error('GROUP_NOT_FOUND');
    return group;
  }

  async renameGroup(
    groupId: string,
    requesterId: string,
    newName: string,
  ): Promise<GroupEntity> {
    return this.groupRepo.renameGroup(groupId, requesterId, newName);
  }

  async kickMember(
    groupId: string,
    requesterId: string,
    targetUserId: string,
  ): Promise<GroupEntity> {
    const updated = await this.groupRepo.kickMember(groupId, requesterId, targetUserId);
    await this.authRepo.removeGroupFromUser(targetUserId, groupId);
    return updated;
  }

  async transferOwnership(
    groupId: string,
    requesterId: string,
    newOwnerId: string,
  ): Promise<GroupEntity> {
    return this.groupRepo.transferOwnership(groupId, requesterId, newOwnerId);
  }

  async dissolveGroup(groupId: string, requesterId: string): Promise<void> {
    const memberIds = await this.groupRepo.dissolveGroup(groupId, requesterId);
    for (const userId of memberIds) {
      await this.authRepo.removeGroupFromUser(userId, groupId);
    }
  }
}
