import { ForwardGeocodeResult, IRouteRepository } from './IRouteRepository';
import { RouteEntity } from './entities/route.entity';

export class RouteUseCase {
  constructor(private readonly routeRepo: IRouteRepository) {}

  async getRoute(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
  ): Promise<RouteEntity> {
    return this.routeRepo.calculateRoute(fromLng, fromLat, toLng, toLat);
  }

  async reverseGeocode(lat: number, lng: number): Promise<string> {
    return this.routeRepo.reverseGeocode(lat, lng);
  }

  async forwardGeocode(
    query: string,
    limit = 4,
    proximity?: { lat: number; lng: number },
  ): Promise<ForwardGeocodeResult[]> {
    return this.routeRepo.forwardGeocode(query, limit, proximity);
  }
}
