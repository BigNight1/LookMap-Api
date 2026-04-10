import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { LocationSchema, LocationSchemaDefinition } from './infrastructure/location.schema';
import { LocationRepository } from './infrastructure/location.repository';
import { LocationUseCase } from './domain/location.usecase';
import { LocationsGateway } from './presentation/locations.gateway';
import { AuthModule } from '../auth/auth.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LocationSchema.name, schema: LocationSchemaDefinition },
    ]),
    forwardRef(() => AuthModule),
    MessagesModule,
  ],
  providers: [
    LocationRepository,
    LocationsGateway,
    {
      provide: LocationUseCase,
      useFactory: (repo: LocationRepository) => new LocationUseCase(repo),
      inject: [LocationRepository],
    },
  ],
  exports: [LocationRepository, LocationsGateway],
})
export class LocationsModule {}
