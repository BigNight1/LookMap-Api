import {
  Controller,
  Get,
  Query,
  UseGuards,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RouteUseCase } from '../domain/route.usecase';
import { GetRouteDto, GetGeocodeDto } from './routes.dto';

@Controller('routes')
@UseGuards(JwtAuthGuard)
export class RoutesController {
  constructor(private readonly routeUseCase: RouteUseCase) {}

  @Get('search')
  async searchPlaces(
    @Query('q') q: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    if (!q || q.trim().length < 2) {
      return { data: [] };
    }
    let proximity: { lat: number; lng: number } | undefined;
    if (lat && lng) {
      const latN = parseFloat(lat);
      const lngN = parseFloat(lng);
      if (Number.isFinite(latN) && Number.isFinite(lngN)) {
        proximity = { lat: latN, lng: lngN };
      }
    }
    try {
      const results = await this.routeUseCase.forwardGeocode(q.trim(), 3, proximity);
      return { data: results };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'MAPBOX_UNAVAILABLE')
        throw new ServiceUnavailableException('Servicio de geocodificación no disponible');
      throw err;
    }
  }

  @Get('geocode')
  async reverseGeocode(@Query() dto: GetGeocodeDto) {
    try {
      const placeName = await this.routeUseCase.reverseGeocode(dto.lat, dto.lng);
      return { data: { placeName } };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'MAPBOX_UNAVAILABLE')
        throw new ServiceUnavailableException('Servicio de geocodificación no disponible');
      throw err;
    }
  }

  @Get()
  async getRoute(@Query() dto: GetRouteDto) {
    try {
      const route = await this.routeUseCase.getRoute(
        dto.fromLat,
        dto.fromLng,
        dto.toLat,
        dto.toLng,
      );
      return { data: route };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'NO_ROUTE_FOUND')
        throw new NotFoundException('No se encontró ruta entre esos puntos');
      if (msg === 'MAPBOX_UNAVAILABLE')
        throw new ServiceUnavailableException('Servicio de rutas no disponible');
      throw err;
    }
  }
}
