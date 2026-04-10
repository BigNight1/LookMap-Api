import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

import { MapboxRepository } from './infrastructure/mapbox.repository';
import { RouteUseCase } from './domain/route.usecase';
import { RoutesController } from './presentation/routes.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    AuthModule,
  ],
  controllers: [RoutesController],
  providers: [
    MapboxRepository,
    {
      provide: RouteUseCase,
      useFactory: (repo: MapboxRepository) => new RouteUseCase(repo),
      inject: [MapboxRepository],
    },
  ],
})
export class RoutesModule {}
