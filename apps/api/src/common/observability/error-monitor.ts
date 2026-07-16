export interface ErrorMonitorEvent {
  correlationId: string;
  method: string;
  path: string;
  statusCode: number;
  error: { name: string; message: string; stack?: string };
}

export interface ErrorMonitor { capture(event: ErrorMonitorEvent): void; }

/** Adapter seam for Sentry/OpenTelemetry; replacing it never changes the public error contract. */
export class NoopErrorMonitor implements ErrorMonitor {
  capture(_event: ErrorMonitorEvent): void {}
}
