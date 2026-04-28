import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  IAuthRepository,
  CreateUserDto,
  CreateGoogleUserDto,
  MemberActiveRouteRow,
  SetActiveRouteInput,
} from '../domain/IAuthRepository';
import { ActiveRouteEntry, UserEntity } from '../domain/entities/user.entity';
import { UserDocument, UserSchema } from './user.schema';

interface RawUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  nickname: string;
  googleId?: string | null;
  avatar?: string | null;
  password?: string | null;
  color: string;
  pinSize?: string;
  mapPinsImageOnly?: boolean;
  groupIds: Types.ObjectId[];
  maxGroups?: number;
  extraGroupsPurchased?: number;
  isOnline: boolean;
  lastLocation: { lat: number; lng: number; timestamp: Date } | null;
  lastBattery: number | null;
  activeRoutes?: Array<{
    groupId: Types.ObjectId;
    destName?: string;
    destLat: number;
    destLng: number;
    geojson: object | null;
    duration?: string;
    distance?: string;
    mode?: string;
    updatedAt: Date;
  }>;
  createdAt: Date;
  isVerified?: boolean;
  verificationCode?: string | null;
  verificationCodeExpires?: Date | null;
}

@Injectable()
export class AuthRepository implements IAuthRepository {
  constructor(
    @InjectModel(UserSchema.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async findByEmailWithVerification(email: string): Promise<UserEntity | null> {
    const doc = await this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+verificationCode +verificationCodeExpires')
      .lean<RawUser>();
    return doc ? this.toEntity(doc) : null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const doc = await this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+password')
      .lean<RawUser>();
    return doc ? this.toEntity(doc) : null;
  }

  async findByNickname(nickname: string): Promise<UserEntity | null> {
    const doc = await this.userModel.findOne({ nickname }).lean<RawUser>();
    return doc ? this.toEntity(doc) : null;
  }

  async findByGoogleId(googleId: string): Promise<UserEntity | null> {
    const doc = await this.userModel.findOne({ googleId }).lean<RawUser>();
    return doc ? this.toEntity(doc) : null;
  }

  async findById(id: string): Promise<UserEntity | null> {
    const doc = await this.userModel.findById(id).lean<RawUser>();
    return doc ? this.toEntity(doc) : null;
  }

  async findUsersByIds(ids: string[]): Promise<UserEntity[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return [];
    const docs = await this.userModel
      .find({ _id: { $in: unique } })
      .lean<RawUser[]>();
    return docs.map((doc) => this.toEntity(doc));
  }

  async create(data: CreateUserDto): Promise<UserEntity> {
    const doc = await this.userModel.create(data);
    return this.toEntity(doc.toObject() as unknown as RawUser);
  }

  async createGoogleUser(data: CreateGoogleUserDto): Promise<UserEntity> {
    const doc = await this.userModel.create({
      name: data.name,
      email: data.email.toLowerCase(),
      nickname: data.nickname,
      password: null,
      color: data.color,
      googleId: data.googleId,
      avatar: data.avatar,
      isVerified: true,
      verificationCode: null,
      verificationCodeExpires: null,
    });
    return this.toEntity(doc.toObject() as unknown as RawUser);
  }

  async linkGoogleProfile(
    userId: string,
    data: { googleId: string; avatar: string | null; name?: string },
  ): Promise<UserEntity> {
    const doc = await this.userModel
      .findByIdAndUpdate(
        userId,
        {
          $set: {
            googleId: data.googleId,
            avatar: data.avatar,
            isVerified: true,
            ...(data.name != null ? { name: data.name } : {}),
          },
        },
        { returnDocument: 'after' },
      )
      .lean<RawUser>();
    if (!doc) throw new Error('USER_NOT_FOUND');
    return this.toEntity(doc);
  }

  async addGroupToUser(userId: string, groupId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $addToSet: { groupIds: new Types.ObjectId(groupId) },
    });
  }

  async removeGroupFromUser(userId: string, groupId: string): Promise<void> {
    const oid = new Types.ObjectId(groupId);
    await this.userModel.findByIdAndUpdate(userId, {
      $pull: {
        groupIds: oid,
        activeRoutes: { groupId: oid },
      },
    });
  }

  async setActiveRoute(
    userId: string,
    input: SetActiveRouteInput,
  ): Promise<UserEntity> {
    const oid = new Types.ObjectId(input.groupId);
    await this.userModel.updateOne(
      { _id: userId },
      { $pull: { activeRoutes: { groupId: oid } } },
    );
    await this.userModel.updateOne(
      { _id: userId },
      {
        $push: {
          activeRoutes: {
            groupId: oid,
            destName: input.destName ?? '',
            destLat: input.destLat,
            destLng: input.destLng,
            geojson: input.geojson ?? null,
            duration: input.duration ?? '',
            distance: input.distance ?? '',
            mode: input.mode ?? 'driving',
            updatedAt: new Date(),
          },
        },
      },
    );
    const user = await this.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    return user;
  }

  async clearActiveRoute(userId: string, groupId: string): Promise<UserEntity> {
    await this.userModel.updateOne(
      { _id: userId },
      { $pull: { activeRoutes: { groupId: new Types.ObjectId(groupId) } } },
    );
    const user = await this.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    return user;
  }

  async findActiveRoutesForGroup(
    groupId: string,
  ): Promise<MemberActiveRouteRow[]> {
    const oid = new Types.ObjectId(groupId);
    const docs = await this.userModel
      .find({ groupIds: oid })
      .select('nickname color activeRoutes')
      .lean<RawUser[]>();

    return docs.map((doc) => {
      const match = (doc.activeRoutes ?? []).find(
        (r) => String(r.groupId) === groupId,
      );
      const route: ActiveRouteEntry | null = match
        ? {
            groupId,
            destName: match.destName ?? '',
            destLat: match.destLat,
            destLng: match.destLng,
            geojson: match.geojson ?? null,
            duration: match.duration ?? '',
            distance: match.distance ?? '',
            mode: match.mode ?? 'driving',
            updatedAt: match.updatedAt,
          }
        : null;
      return {
        userId: String(doc._id),
        nickname: doc.nickname,
        color: doc.color,
        route,
      };
    });
  }

  async setOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { isOnline });
  }

  async setLastLocation(
    userId: string,
    lat: number,
    lng: number,
    battery?: number,
  ): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $set: {
        lastLocation: { lat, lng, timestamp: new Date() },
        ...(battery != null && { lastBattery: battery }),
      },
    });
  }

  async updateUser(
    userId: string,
    data: {
      color?: string;
      pinSize?: string;
      name?: string;
      nickname?: string;
      avatar?: string;
      mapPinsImageOnly?: boolean;
    },
  ): Promise<UserEntity> {
    try {
      const doc = await this.userModel
        .findByIdAndUpdate(userId, { $set: data }, { returnDocument: 'after' })
        .lean<RawUser>();
      if (!doc) throw new Error('USER_NOT_FOUND');
      return this.toEntity(doc);
    } catch (err: any) {
      if (err.code === 11000 && err.keyPattern?.nickname) {
        throw new Error('NICKNAME_ALREADY_EXISTS');
      }
      throw err;
    }
  }

  async markAsVerified(userId: string): Promise<UserEntity> {
    const doc = await this.userModel
      .findByIdAndUpdate(
        userId,
        {
          $set: {
            isVerified: true,
            verificationCode: null,
            verificationCodeExpires: null,
          },
        },
        { returnDocument: 'after' },
      )
      .lean<RawUser>();
    if (!doc) throw new Error('USER_NOT_FOUND');
    return this.toEntity(doc);
  }

  async updateVerificationCode(
    userId: string,
    code: string,
    expires: Date,
  ): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $set: { verificationCode: code, verificationCodeExpires: expires },
    });
  }

  private toEntity(doc: RawUser): UserEntity {
    const activeRoutes: ActiveRouteEntry[] = (doc.activeRoutes ?? []).map(
      (r) => ({
        groupId: String(r.groupId),
        destName: r.destName ?? '',
        destLat: r.destLat,
        destLng: r.destLng,
        geojson: r.geojson ?? null,
        duration: r.duration ?? '',
        distance: r.distance ?? '',
        mode: r.mode ?? 'driving',
        updatedAt: r.updatedAt,
      }),
    );

    const hasGoogleId = Boolean(doc.googleId);
    const isVerified = hasGoogleId || (doc.isVerified ?? true);

    return {
      id: String(doc._id),
      name: doc.name,
      email: doc.email,
      nickname: doc.nickname,
      googleId: doc.googleId ?? null,
      avatar: doc.avatar ?? null,
      password: doc.password ?? null,
      color: doc.color,
      pinSize: doc.pinSize ?? 'normal',
      mapPinsImageOnly: doc.mapPinsImageOnly ?? true,
      isVerified,
      verificationCode: doc.verificationCode ?? null,
      verificationCodeExpires: doc.verificationCodeExpires ?? null,
      groupIds: (doc.groupIds ?? []).map(String),
      maxGroups: doc.maxGroups ?? 2,
      extraGroupsPurchased: doc.extraGroupsPurchased ?? 0,
      isOnline: doc.isOnline ?? false,
      lastLocation: doc.lastLocation ?? null,
      lastBattery: doc.lastBattery ?? null,
      activeRoutes,
      createdAt: doc.createdAt,
    };
  }
}
