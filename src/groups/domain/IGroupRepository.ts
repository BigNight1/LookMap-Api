import { GroupEntity, GroupMember } from './entities/group.entity';

export interface CreateGroupData {
  name: string;
  code: string;
  ownerId: string;
  members: GroupMember[];
}

export interface IGroupRepository {
  create(data: CreateGroupData): Promise<GroupEntity>;
  findByCode(code: string): Promise<GroupEntity | null>;
  findById(id: string): Promise<GroupEntity | null>;
  /** Fetch multiple groups by IDs in a single $in query */
  findManyById(ids: string[]): Promise<GroupEntity[]>;
  addMember(groupId: string, member: GroupMember): Promise<GroupEntity>;
  removeMember(groupId: string, userId: string): Promise<GroupEntity>;
  /** Returns the active group where the user is a member, or null */
  findByMemberId(userId: string): Promise<GroupEntity | null>;
  deactivate(groupId: string): Promise<void>;

  renameGroup(groupId: string, requesterId: string, newName: string): Promise<GroupEntity>;
  kickMember(groupId: string, requesterId: string, targetUserId: string): Promise<GroupEntity>;
  transferOwnership(groupId: string, requesterId: string, newOwnerId: string): Promise<GroupEntity>;
  /** Deletes the group document; returns distinct member userIds for cleaning users.groupIds */
  dissolveGroup(groupId: string, requesterId: string): Promise<string[]>;
}
