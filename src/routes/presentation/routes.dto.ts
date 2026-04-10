import { IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetRouteDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  fromLat: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  fromLng: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  toLat: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  toLng: number;
}

export class GetGeocodeDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;
}
