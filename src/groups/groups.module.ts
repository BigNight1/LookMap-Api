import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { UserSchema, UserSchemaDefinition } from '../auth/infrastructure/user.schema';
import { GroupSchema, GroupSchemaDefinition } from './infrastructure/group.schema';
import {
  LocationSchema,
  LocationSchemaDefinition,
} from '../locations/infrastructure/location.schema';
import { GroupRepository } from './infrastructure/group.repository';
import { GroupUseCase } from './domain/group.usecase';
import { GroupsController } from './presentation/groups.controller';
import { AuthModule } from '../auth/auth.module';
import { AuthRepository } from '../auth/infrastructure/auth.repository';
import { LocationsModule } from '../locations/locations.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GroupSchema.name, schema: GroupSchemaDefinition },
      { name: UserSchema.name, schema: UserSchemaDefinition },
      { name: LocationSchema.name, schema: LocationSchemaDefinition },
    ]),
    AuthModule,
    LocationsModule,
    MessagesModule,
  ],
  controllers: [GroupsController],
  providers: [
    GroupRepository,
    {
      provide: GroupUseCase,
      useFactory: (groupRepo: GroupRepository, authRepo: AuthRepository) =>
        new GroupUseCase(groupRepo, authRepo),
      inject: [GroupRepository, AuthRepository],
    },
  ],
  exports: [GroupRepository],
})
export class GroupsModule {}
