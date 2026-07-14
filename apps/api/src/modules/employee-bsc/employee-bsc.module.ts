import { Module } from '@nestjs/common';
import { EmployeeBscController } from './controllers/employee-bsc.controller';
import { EmployeeBscService } from './services/employee-bsc.service';
import { EmployeeBscRepository } from './repositories/employee-bsc.repository';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [EmployeeBscController],
  providers: [EmployeeBscService, EmployeeBscRepository],
})
export class EmployeeBscModule {}
