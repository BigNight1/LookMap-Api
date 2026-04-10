import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserDocument, UserSchema } from '../../auth/infrastructure/user.schema';
import { IGroupRepository, CreateGroupData } from '../domain/IGroupRepository';
import { GroupEntity, GroupMember } from '../domain/entities/group.entity';
import { GroupDocument, GroupSchema } from './group.schema';

interface RawMember {
  userId: string;
  nickname: string;
  color: string;
  joinedAt: Date;
}

interface RawGroup {
  _id: Types.ObjectId;
  name: string;
  code: string;
  ownerId: string;
  members: RawMember[];
  maxMembers: number;
  isActive: boolean;
  createdAt: Date;
}

@Injectable()
export class GroupRepository implements IGroupRepository {
  constructor(
    @InjectModel(GroupSchema.name)
    private readonly groupModel: Model<GroupDocument>,
    @InjectModel(UserSchema.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(data: CreateGroupData): Promise<GroupEntity> {
    const doc = await this.groupModel.create(data);
    return this.toEntity(doc.toObject() as unknown as RawGroup);
  }

  async findByCode(code: string): Promise<GroupEntity | null> {
    const doc = await this.groupModel
      .findOne({ code: code.toUpperCase(), isActive: true })
      .lean<RawGroup>();
    return doc ? this.toEntity(doc) : null;
  }

  async findById(id: string): Promise<GroupEntity | null> {
    const doc = await this.groupModel.findById(id).lean<RawGroup>();
    return doc ? this.toEntity(doc) : null;
  }

  async findManyById(ids: string[]): Promise<GroupEntity[]> {
    if (ids.length === 0) return [];
    const objectIds = ids.map((id) => new Types.ObjectId(id));
    const docs = await this.groupModel
      .find({ _id: { $in: objectIds }, isActive: true })
      .lean<RawGroup[]>();

    const allUserIds = [
      ...new Set(docs.flatMap((d) => d.members.map((m) => m.userId))),
    ];
    let avatarMap = new Map<string, string | null>();
    if (allUserIds.length > 0) {
      const users = await this.userModel
        .find({ _id: { $in: allUserIds } }, { avatar: 1 })
        .lean<{ _id: Types.ObjectId; avatar?: string | null }[]>();
      avatarMap = new Map(
        users.map((u) => [String(u._id), u.avatar ?? null]),
      );
    }

    return docs.map((doc) => this.toEntityWithAvatars(doc, avatarMap));
  }

  async addMember(groupId: string, member: GroupMember): Promise<GroupEntity> {
    const doc = await this.groupModel
      .findByIdAndUpdate(
        groupId,
        { $push: { members: member } },
        { returnDocument: 'after' },
      )
      .lean<RawGroup>();
    if (!doc) throw new Error('GROUP_NOT_FOUND');
    return this.toEntity(doc);
  }

  async removeMember(groupId: string, userId: string): Promise<GroupEntity> {
    const doc = await this.groupModel
      .findByIdAndUpdate(
        groupId,
        { $pull: { members: { userId } } },
        { returnDocument: 'after' },
      )
      .lean<RawGroup>();
    if (!doc) throw new Error('GROUP_NOT_FOUND');
    return this.toEntity(doc);
  }

  async findByMemberId(userId: string): Promise<GroupEntity | null> {
    const doc = await this.groupModel
      .findOne({ 'members.userId': userId, isActive: true })
      .lean<RawGroup>();
    return doc ? this.toEntity(doc) : null;
  }

  async deactivate(groupId: string): Promise<void> {
    await this.groupModel.findByIdAndUpdate(groupId, { isActive: false });
  }

  async renameGroup(
    groupId: string,
    requesterId: string,
    newName: string,
  ): Promise<GroupEntity> {
    const group = await this.findById(groupId);
    if (!group || !group.isActive) throw new Error('GROUP_NOT_FOUND');
    if (group.ownerId !== requesterId) throw new Error('NOT_OWNER');

    const doc = await this.groupModel
      .findByIdAndUpdate(groupId, { $set: { name: newName.trim() } }, { returnDocument: 'after' })
      .lean<RawGroup>();
    if (!doc) throw new Error('GROUP_NOT_FOUND');
    return this.toEntity(doc);
  }

  async kickMember(
    groupId: string,
    requesterId: string,
    targetUserId: string,
  ): Promise<GroupEntity> {
    const group = await this.findById(groupId);
    if (!group || !group.isActive) throw new Error('GROUP_NOT_FOUND');
    if (group.ownerId !== requesterId) throw new Error('NOT_OWNER');
    if (targetUserId === requesterId) throw new Error('CANNOT_KICK_SELF');
    if (!group.members.some((m) => m.userId === targetUserId)) {
      throw new Error('TARGET_NOT_IN_GROUP');
    }
    return this.removeMember(groupId, targetUserId);
  }

  async transferOwnership(
    groupId: string,
    requesterId: string,
    newOwnerId: string,
  ): Promise<GroupEntity> {
    const group = await this.findById(groupId);
    if (!group || !group.isActive) throw new Error('GROUP_NOT_FOUND');
    if (group.ownerId !== requesterId) throw new Error('NOT_OWNER');
    if (!group.members.some((m) => m.userId === newOwnerId)) {
      throw new Error('NEW_OWNER_NOT_MEMBER');
    }

    const doc = await this.groupModel
      .findByIdAndUpdate(groupId, { $set: { ownerId: newOwnerId } }, { returnDocument: 'after' })
      .lean<RawGroup>();
    if (!doc) throw new Error('GROUP_NOT_FOUND');
    return this.toEntity(doc);
  }

  async dissolveGroup(groupId: string, requesterId: string): Promise<string[]> {
    const group = await this.findById(groupId);
    if (!group || !group.isActive) throw new Error('GROUP_NOT_FOUND');
    if (group.ownerId !== requesterId) throw new Error('NOT_OWNER');

    const userIds = [...new Set(group.members.map((m) => m.userId))];
    const result = await this.groupModel.deleteOne({ _id: groupId });
    if (result.deletedCount === 0) throw new Error('GROUP_NOT_FOUND');
    return userIds;
  }

  private toEntity(doc: RawGroup): GroupEntity {
    return {
      id: String(doc._id),
      name: doc.name,
      code: doc.code,
      ownerId: doc.ownerId,
      maxMembers: doc.maxMembers ?? 3,
      isActive: doc.isActive,
      createdAt: doc.createdAt,
      members: doc.members.map((m) => ({
        userId: m.userId,
        nickname: m.nickname,
        color: m.color,
        joinedAt: m.joinedAt,
      })),
    };
  }

  private toEntityWithAvatars(
    doc: RawGroup,
    avatarMap: Map<string, string | null>,
  ): GroupEntity {
    return {
      ...this.toEntity(doc),
      members: doc.members.map((m) => ({
        userId: m.userId,
        nickname: m.nickname,
        color: m.color,
        joinedAt: m.joinedAt,
        avatar: avatarMap.get(m.userId) ?? null,
      })),
    };
  }
}
