import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './database/prisma.module';
import { EmployeeBscModule } from './modules/employee-bsc/employee-bsc.module';
import { AuthModule } from './modules/auth/auth.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { PositionsModule } from './modules/positions/positions.module';
import { UsersModule } from './modules/users/users.module';
import { BscCyclesModule } from './modules/bsc-cycles/bsc-cycles.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RolesModule } from './modules/roles/roles.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { DepartmentBscModule } from './modules/department-bsc/department-bsc.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { BscMinutesModule } from './modules/bsc-minutes/bsc-minutes.module';

@Module({
  imports: [
    HealthModule,
    PrismaModule,
    AuthModule,
    EmployeeBscModule,
    DepartmentsModule,
    PositionsModule,
    UsersModule,
    BscCyclesModule,
    ReportsModule,
    RolesModule,
    AuditLogsModule,
    DepartmentBscModule,
    NotificationsModule,
    BscMinutesModule,
  ],
})
export class AppModule {}
