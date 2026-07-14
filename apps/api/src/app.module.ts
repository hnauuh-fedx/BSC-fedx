import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './database/prisma.module';
import { EmployeeBscModule } from './modules/employee-bsc/employee-bsc.module';
import { AuthModule } from './modules/auth/auth.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { PositionsModule } from './modules/positions/positions.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    HealthModule,
    PrismaModule,
    AuthModule,
    EmployeeBscModule,
    DepartmentsModule,
    PositionsModule,
    UsersModule,
  ],
})
export class AppModule {}
