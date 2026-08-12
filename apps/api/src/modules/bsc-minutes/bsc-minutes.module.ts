import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BscMinutesController } from './bsc-minutes.controller';
import { BscMinutesService } from './bsc-minutes.service';

@Module({ imports: [AuthModule], controllers: [BscMinutesController], providers: [BscMinutesService] })
export class BscMinutesModule {}
