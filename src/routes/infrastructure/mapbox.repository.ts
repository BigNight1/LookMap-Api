import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ForwardGeocodeResult, IRouteRepository } from '../domain/IRouteRepository';
import { RouteEntity, RouteStep } from '../domain/entities/route.entity';

interface MapboxStep {
  maneuver: { instruction: string };
  distance: number;
}

interface MapboxRoute {
  geometry: object;
  duration: number;
  distance: number;
  legs: Array<{ steps: MapboxStep[] }>;
}

interface MapboxResponse {
  routes: MapboxRoute[];
  code: string;
}

interface MapboxGeocodeFeature {
  place_name?: string;
}

interface MapboxGeocodeResponse {
  features?: MapboxGeocodeFeature[];
}

interface MapboxForwardFeature {
  text?: string;
  place_name?: string;
  center?: [number, number];
}

interface MapboxForwardGeocodeResponse {
  features?: MapboxForwardFeature[];
}

@Injectable()
export class MapboxRepository implements IRouteRepository {
  private readonly logger = new Logger(MapboxRepository.name);
  private readonly BASE_URL = 'https://api.mapbox.com/directions/v5/mapbox/driving';
  private readonly GEOCODE_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async calculateRoute(
    fromLng: number,
    fromLat: number,
    toLng: number,
    toLat: number,
  ): Promise<RouteEntity> {
    const token = this.config.getOrThrow<string>('MAPBOX_TOKEN');
    const coordinates = `${fromLng},${fromLat};${toLng},${toLat}`;
    const url = `${this.BASE_URL}/${coordinates}`;

    try {
      const t0 = Date.now();
      console.log('🗺️ Iniciando cálculo de ruta...');

      const response = await firstValueFrom(
        this.http.get<MapboxResponse>(url, {
          params: {
            geometries: 'geojson',
            steps: 'true',
            access_token: token,
          },
        }),
      );
      console.log('🗺️ Mapbox respondió en:', Date.now() - t0, 'ms');

      const { routes } = response.data;

      if (!routes || routes.length === 0) {
        throw new Error('NO_ROUTE_FOUND');
      }

      const route = routes[0];
      const steps: RouteStep[] = (route.legs[0]?.steps ?? []).map((s) => ({
        instruction: s.maneuver.instruction,
        distance: s.distance,
      }));

      const result: RouteEntity = {
        geojson: route.geometry,
        duration: route.duration,
        distance: route.distance,
        steps,
      };
      console.log('🗺️ Ruta parseada en:', Date.now() - t0, 'ms total');

      return result;
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'NO_ROUTE_FOUND') throw err;
      this.logger.error('Mapbox API call failed', err);
      throw new Error('MAPBOX_UNAVAILABLE');
    }
  }

  /**
   * Rough bounding boxes (WGS84). First match wins; otherwise defaults to Peru.
   */
  private getCountryFromCoords(lat: number, lng: number): string {
    const boxes: Array<{
      minLat: number;
      maxLat: number;
      minLng: number;
      maxLng: number;
      code: string;
    }> = [
      { minLat: -18.35, maxLat: -0.04, minLng: -81.33, maxLng: -68.65, code: 'pe' },
      { minLat: -55.98, maxLat: -17.5, minLng: -75.64, maxLng: -66.42, code: 'cl' },
      { minLat: -4.23, maxLat: 12.45, minLng: -81.84, maxLng: -66.87, code: 'co' },
      { minLat: 14.53, maxLat: 32.72, minLng: -118.45, maxLng: -86.7, code: 'mx' },
      { minLat: -55.06, maxLat: -21.78, minLng: -73.56, maxLng: -53.64, code: 'ar' },
      { minLat: -5.01, maxLat: 1.68, minLng: -80.98, maxLng: -75.19, code: 'ec' },
      { minLat: -22.9, maxLat: -9.67, minLng: -69.64, maxLng: -57.45, code: 'bo' },
    ];
    for (const b of boxes) {
      if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) {
        return b.code;
      }
    }
    return 'pe';
  }

  async forwardGeocode(
    query: string,
    limit = 3,
    proximity?: { lat: number; lng: number },
  ): Promise<ForwardGeocodeResult[]> {
    const token = this.config.getOrThrow<string>('MAPBOX_TOKEN');
    const url = `${this.GEOCODE_BASE}/${encodeURIComponent(query)}.json`;

    const params: {
      access_token: string;
      limit: number;
      language: string;
      types: string;
      proximity?: string;
      country?: string;
    } = {
      access_token: token,
      limit,
      language: 'es',
      types: 'place,locality,neighborhood,address,poi',
    };
    if (proximity) {
      params.proximity = `${proximity.lng},${proximity.lat}`;
      params.country = this.getCountryFromCoords(proximity.lat, proximity.lng);
    }

    try {
      const response = await firstValueFrom(
        this.http.get<MapboxForwardGeocodeResponse>(url, {
          params,
        }),
      );

      const features = response.data.features ?? [];
      return features
        .filter(
          (f): f is MapboxForwardFeature & { center: [number, number] } =>
            Array.isArray(f.center) && f.center.length >= 2,
        )
        .map((f) => ({
          name: f.text ?? '',
          placeName: f.place_name ?? '',
          lat: f.center[1],
          lng: f.center[0],
        }));
    } catch (err: unknown) {
      this.logger.error('Mapbox forward geocoding failed', err);
      throw new Error('MAPBOX_UNAVAILABLE');
    }
  }

  async reverseGeocode(lat: number, lng: number): Promise<string> {
    const token = this.config.getOrThrow<string>('MAPBOX_TOKEN');
    const url = `${this.GEOCODE_BASE}/${lng},${lat}.json`;

    try {
      const response = await firstValueFrom(
        this.http.get<MapboxGeocodeResponse>(url, {
          params: {
            access_token: token,
            language: 'es',
            limit: 1,
            types: 'neighborhood,locality,place',
          },
        }),
      );

      const place = response.data.features?.[0];
      return place?.place_name ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch (err: unknown) {
      this.logger.error('Mapbox Geocoding API call failed', err);
      throw new Error('MAPBOX_UNAVAILABLE');
    }
  }
}
