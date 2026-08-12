import type { MinutesPrintCollectiveRow, MinutesPrintRow } from './components/bsc-minutes-print-document';

export type BscMinutesSnapshot = {
  rows: MinutesPrintRow[];
  collectiveRows: MinutesPrintCollectiveRow[];
};

export type SaveBscMinutesInput = {
  cycleId: string;
  number: string;
  issuePlace: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  chairName: string;
  secretaryName: string;
  absentCount: number;
  subject: string;
  meetingContent: string;
  nextMonthAssignment: string;
  conclusion: string;
  snapshot: BscMinutesSnapshot;
  expectedVersion?: number;
};

export type BscMinutes = {
  id: string;
  cycle_id: string;
  minutes_number: string;
  issue_place: string;
  meeting_date: string;
  start_time: string;
  end_time: string;
  meeting_location: string;
  chair_name: string;
  secretary_name: string;
  absent_count: number;
  subject: string;
  meeting_content: string;
  next_month_assignment: string;
  conclusion: string;
  snapshot: BscMinutesSnapshot;
  version: number;
  print_count: number;
  pdf_export_count: number;
  last_printed_at: string | null;
  last_pdf_exported_at: string | null;
  created_at: string;
  updated_at: string;
  bsc_cycles: { id: string; code: string; name: string; year: number; month: number | null; status: string };
  creator: { id: string; employee_code: string; full_name: string };
  updater: { id: string; employee_code: string; full_name: string };
};

export type BscMinutesSummary = Pick<BscMinutes, 'id' | 'cycle_id' | 'minutes_number' | 'secretary_name' | 'version' | 'print_count' | 'pdf_export_count' | 'created_at' | 'updated_at' | 'bsc_cycles' | 'creator' | 'updater'>;
export type BscMinutesPage = { items: BscMinutesSummary[]; page: number; limit: number; total: number };
