import { LocationEntity } from './entities/location.entity';

export interface UpsertLocationData {
  userId: string;
  groupId: string;
  nickname: string;
  color: string;
  lat: number;
  lng: number;
  accuracy: number;
  battery: number;
}

export interface ILocationRepository {
  /** Create or update the location for a userId+groupId pair */
  upsert(data: UpsertLocationData): Promise<LocationEntity>;
  /** Get all member locations for a group */
  getGroupLocations(groupId: string): Promise<LocationEntity[]>;
  /** Mark a user as offline — returns the last known location or null */
  setOffline(userId: string): Promise<LocationEntity | null>;
}
