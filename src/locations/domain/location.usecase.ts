import { ILocationRepository } from './ILocationRepository';
import { LocationBroadcast, LocationEntity } from './entities/location.entity';

export interface UpdateLocationParams {
  userId: string;
  groupId: string;
  nickname: string;
  color: string;
  lat: number;
  lng: number;
  accuracy: number;
  battery: number;
}

function toBroadcast(loc: LocationEntity): LocationBroadcast {
  return {
    userId: loc.userId,
    nickname: loc.nickname,
    color: loc.color,
    lat: loc.lat,
    lng: loc.lng,
    battery: loc.battery,
    isOnline: loc.isOnline,
    timestamp: loc.timestamp,
  };
}

export class LocationUseCase {
  constructor(private readonly locationRepo: ILocationRepository) {}

  async handleLocationUpdate(params: UpdateLocationParams): Promise<{
    updated: LocationBroadcast;
    groupLocations: LocationBroadcast[];
  }> {
    const updated = await this.locationRepo.upsert({ ...params, });
    const all = await this.locationRepo.getGroupLocations(params.groupId);
    return {
      updated: toBroadcast(updated),
      groupLocations: all.map(toBroadcast),
    };
  }

  async getGroupState(groupId: string): Promise<LocationBroadcast[]> {
    const all = await this.locationRepo.getGroupLocations(groupId);
    return all.map(toBroadcast);
  }

  async handleMemberDisconnect(userId: string): Promise<LocationBroadcast | null> {
    const last = await this.locationRepo.setOffline(userId);
    return last ? toBroadcast(last) : null;
  }
}
