import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface HealthResponse {
  status: 'ok';
  database: {
    status: 'connected';
  };
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('\u0043\u01A1 s\u1EDF d\u1EEF li\u1EC7u ch\u01B0a s\u1EB5n s\u00E0ng');
    }

    return {
      status: 'ok',
      database: {
        status: 'connected',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
