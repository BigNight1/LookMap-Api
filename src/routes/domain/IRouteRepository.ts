import { RouteEntity } from './entities/route.entity';

export interface ForwardGeocodeResult {
  name: string;
  placeName: string;
  lat: number;
  lng: number;
}

export interface IRouteRepository {
  /**
   * Calculate a driving route between two coordinates.
   * Coordinates are in decimal degrees (WGS84).
   */
  calculateRoute(
    fromLng: number,
    fromLat: number,
    toLng: number,
    toLat: number,
  ): Promise<RouteEntity>;

  /** Reverse geocode coordinates to a human-readable place name */
  reverseGeocode(lat: number, lng: number): Promise<string>;

  /** Search places by text (autocomplete / forward geocoding) */
  forwardGeocode(
    query: string,
    limit?: number,
    proximity?: { lat: number; lng: number },
  ): Promise<ForwardGeocodeResult[]>;
}
