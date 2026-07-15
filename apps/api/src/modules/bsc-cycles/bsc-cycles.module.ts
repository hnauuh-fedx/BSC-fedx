import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BscCyclesController } from './bsc-cycles.controller';
import { BscCyclesService } from './bsc-cycles.service';

@Module({
  imports: [AuthModule],
  controllers: [BscCyclesController],
  providers: [BscCyclesService],
})
export class BscCyclesModule {}
