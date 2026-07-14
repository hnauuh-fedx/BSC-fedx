import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';

@Module({ imports: [AuthModule], controllers: [PositionsController], providers: [PositionsService] })
export class PositionsModule {}
