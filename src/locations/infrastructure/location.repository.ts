import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ILocationRepository,
  UpsertLocationData,
} from '../domain/ILocationRepository';
import { LocationEntity } from '../domain/entities/location.entity';
import { LocationDocument, LocationSchema } from './location.schema';

interface RawLocation {
  _id: Types.ObjectId;
  userId: string;
  groupId: string;
  nickname: string;
  color: string;
  lat: number;
  lng: number;
  accuracy: number;
  battery: number;
  isOnline: boolean;
  timestamp: Date;
}

@Injectable()
export class LocationRepository implements ILocationRepository {
  constructor(
    @InjectModel(LocationSchema.name)
    private readonly locationModel: Model<LocationDocument>,
  ) {}

  async upsert(data: UpsertLocationData): Promise<LocationEntity> {
    const doc = await this.locationModel
      .findOneAndUpdate(
        { userId: data.userId, groupId: data.groupId },
        {
          $set: {
            nickname: data.nickname,
            color: data.color,
            lat: data.lat,
            lng: data.lng,
            accuracy: data.accuracy,
            battery: data.battery,
            isOnline: true,
            timestamp: new Date(),
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      .lean<RawLocation>();

    if (!doc) throw new Error('UPSERT_FAILED');
    return this.toEntity(doc);
  }

  async getGroupLocations(groupId: string): Promise<LocationEntity[]> {
    const docs = await this.locationModel
      .find({ groupId })
      .lean<RawLocation[]>();
    return docs.map((d) => this.toEntity(d));
  }

  async setOffline(userId: string): Promise<LocationEntity | null> {
    // Mark ALL location records for this user as offline (they may be in multiple groups)
    await this.locationModel.updateMany({ userId }, { $set: { isOnline: false } });
    // Return any one record to use as the broadcast payload (lat/lng is the same across groups)
    const doc = await this.locationModel.findOne({ userId }).lean<RawLocation>();
    return doc ? this.toEntity(doc) : null;
  }

  private toEntity(doc: RawLocation): LocationEntity {
    return {
      id: String(doc._id),
      userId: doc.userId,
      groupId: doc.groupId,
      nickname: doc.nickname,
      color: doc.color,
      lat: doc.lat,
      lng: doc.lng,
      accuracy: doc.accuracy,
      battery: doc.battery,
      isOnline: doc.isOnline,
      timestamp: doc.timestamp,
    };
  }
}
