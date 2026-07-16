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

  live() { return { status: 'ok' as const }; }

  async ready(timeoutMs = 2_000): Promise<HealthResponse> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('readiness timeout')), timeoutMs); timeout.unref?.(); }),
      ]);
    } catch {
      throw new ServiceUnavailableException('\u0043\u01A1 s\u1EDF d\u1EEF li\u1EC7u ch\u01B0a s\u1EB5n s\u00E0ng');
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    return {
      status: 'ok',
      database: {
        status: 'connected',
      },
      timestamp: new Date().toISOString(),
    };
  }

  check() { return this.live(); }
}
