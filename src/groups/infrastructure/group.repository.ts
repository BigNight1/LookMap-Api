import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserDocument, UserSchema } from '../../auth/infrastructure/user.schema';
import {
  LocationDocument,
  LocationSchema,
} from '../../locations/infrastructure/location.schema';
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

interface RawUserProfile {
  _id: Types.ObjectId;
  avatar?: string | null;
  isOnline?: boolean;
  lastLocation?: { lat: number; lng: number; timestamp: Date } | null;
}

interface RawLocation {
  userId: string;
  groupId: string;
  lat: number;
  lng: number;
  isOnline: boolean;
  timestamp: Date;
}

@Injectable()
export class GroupRepository implements IGroupRepository {
  constructor(
    @InjectModel(GroupSchema.name)
    private readonly groupModel: Model<GroupDocument>,
    @InjectModel(UserSchema.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(LocationSchema.name)
    private readonly locationModel: Model<LocationDocument>,
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
    let userProfileMap = new Map<string, RawUserProfile>();
    if (allUserIds.length > 0) {
      const users = await this.userModel.find(
        { _id: { $in: allUserIds } },
        { avatar: 1, isOnline: 1, lastLocation: 1 },
      ).lean<RawUserProfile[]>();
      userProfileMap = new Map(users.map((u) => [String(u._id), u]));
    }

    let locationByGroupAndUser = new Map<string, RawLocation>();
    if (docs.length > 0 && allUserIds.length > 0) {
      const groupIds = docs.map((d) => String(d._id));
      const locations = await this.locationModel.find(
        { groupId: { $in: groupIds }, userId: { $in: allUserIds } },
        { userId: 1, groupId: 1, lat: 1, lng: 1, isOnline: 1, timestamp: 1 },
      ).lean<RawLocation[]>();
      locationByGroupAndUser = new Map(
        locations.map((loc) => [`${loc.groupId}:${loc.userId}`, loc]),
      );
    }

    return docs.map((doc) =>
      this.toEntityWithPresence(doc, userProfileMap, locationByGroupAndUser),
    );
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

  private toEntityWithPresence(
    doc: RawGroup,
    userProfileMap: Map<string, RawUserProfile>,
    locationByGroupAndUser: Map<string, RawLocation>,
  ): GroupEntity {
    const toPoint = (
      value:
        | { lat: number; lng: number; timestamp: Date }
        | { lat: number; lng: number; timestamp: Date }
        | null
        | undefined,
    ): { latitude: number; longitude: number; timestamp: string } | null => {
      if (!value) return null;
      return {
        latitude: value.lat,
        longitude: value.lng,
        timestamp: new Date(value.timestamp).toISOString(),
      };
    };

    return {
      ...this.toEntity(doc),
      members: doc.members.map((m) => ({
        ...m,
        avatar: userProfileMap.get(m.userId)?.avatar ?? null,
        isOnline:
          locationByGroupAndUser.get(`${String(doc._id)}:${m.userId}`)?.isOnline ??
          userProfileMap.get(m.userId)?.isOnline ??
          false,
        location: (() => {
          const loc = locationByGroupAndUser.get(`${String(doc._id)}:${m.userId}`);
          const online = loc?.isOnline ?? userProfileMap.get(m.userId)?.isOnline ?? false;
          if (!online || !loc) return null;
          return toPoint(loc);
        })(),
        lastKnownLocation:
          toPoint(userProfileMap.get(m.userId)?.lastLocation) ??
          toPoint(locationByGroupAndUser.get(`${String(doc._id)}:${m.userId}`) ?? null),
        lastSeenAt:
          locationByGroupAndUser.get(`${String(doc._id)}:${m.userId}`)?.isOnline === true ||
          (locationByGroupAndUser.get(`${String(doc._id)}:${m.userId}`) == null &&
            userProfileMap.get(m.userId)?.isOnline === true)
            ? null
            : (
                toPoint(userProfileMap.get(m.userId)?.lastLocation) ??
                toPoint(locationByGroupAndUser.get(`${String(doc._id)}:${m.userId}`) ?? null)
              )?.timestamp ?? null,
      })),
    };
  }
}
