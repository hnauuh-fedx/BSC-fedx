import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BscCyclesController } from './bsc-cycles.controller';
import { BscCyclesService } from './bsc-cycles.service';
import { BscCyclePolicy } from './bsc-cycle.policy';

@Module({
  imports: [AuthModule],
  controllers: [BscCyclesController],
  providers: [BscCyclesService, BscCyclePolicy],
  exports: [BscCyclePolicy],
})
export class BscCyclesModule {}
