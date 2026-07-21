import type { BscGoalGroup, BscScoringPreview } from '../employee-bsc/types/employee-bsc.types';

export type DepartmentBscItem = {
  id: string; department_bsc_id: string; kpi_code: string; kpi_name: string; description: string | null;
  goal_group_code: string; measurement_unit: string; measurement_frequency: string;
  target_value: number | null; target_text: string | null; actual_value: number | null; actual_text: string | null;
  weight: number; achievement_percent: number; weighted_score: number; calculation_method: string;
  manager_note: string | null; director_note: string | null; sort_order: number;
};
export type DepartmentBsc = {
  id: string; bsc_code: string; cycle_id: string; department_id: string; responsible_manager_id: string; reviewer_id: string;
  source_bsc_id: string | null; manager_comment: string | null; director_comment: string | null;
  plan_status: 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'APPROVED' | 'REOPENED';
  evaluation_status: 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'APPROVED' | 'REOPENED';
  plan_submitted_at: string | null; plan_approved_at: string | null; evaluation_submitted_at: string | null; evaluation_approved_at: string | null;
  total_score: number; final_score: number | null; final_grade: string | null; created_at: string; updated_at: string;
  bsc_cycles: { id: string; code: string; name: string; year: number; month: number | null; status: string };
  departments: { id: string; code: string; name: string };
  responsible_manager: { id: string; employee_code: string; full_name: string };
  reviewer: { id: string; employee_code: string; full_name: string };
  department_bsc_items: DepartmentBscItem[];
  department_bsc_status_histories: Array<{ id: string; stage: string; from_status: string | null; to_status: string; action: string; comment: string | null; changed_at: string }>;
  department_bsc_reviews: Array<{ id: string; stage: string; action: string; comment: string | null; reviewed_at: string }>;
  goal_groups: BscGoalGroup[];
};
export type DepartmentBscPage = { items: DepartmentBsc[]; page: number; limit: number; total: number };
export type DepartmentBscVersion = { id: string; version_number: number; stage: string; version_type: string; created_at: string; snapshot: Record<string, unknown> };
export type DepartmentBscReopenRequest = {
  id: string; department_bsc_id: string; stage: 'PLAN' | 'EVALUATION'; status: 'PENDING' | 'APPROVED' | 'REJECTED';
  request_reason: string; review_reason: string | null; created_at: string; reviewed_at: string | null;
};
export type DepartmentBscScoring = BscScoringPreview;
