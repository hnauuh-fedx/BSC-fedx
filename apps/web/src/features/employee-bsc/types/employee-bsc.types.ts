export type BscItem = {
  id: string; employee_bsc_id: string; kpi_code: string; kpi_name: string; description: string | null;
  goal_group_code: string; measurement_unit: string; measurement_frequency: string;
  target_value: string | null; target_text: string | null;
  actual_value: string | null; actual_text: string | null; weight: string; calculation_method: string;
  employee_note: string | null; sort_order: number;
};
export type BscGoalGroup = { code: string; marker: string; name: string; displayOrder: number };
export type EmployeeBsc = {
  id: string; bsc_code: string; cycle_id: string; employee_id: string; department_id: string; position_id: string;
  direct_manager_id: string; status: string; employee_comment: string | null; created_at: string; updated_at: string;
  source_bsc_id?: string | null; source_bsc_version_id?: string | null;
  plan_status: 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'APPROVED' | 'REOPENED';
  evaluation_status: 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'APPROVED' | 'REOPENED';
  plan_submitted_at?: string | null; plan_approved_at?: string | null; plan_approved_by?: string | null;
  evaluation_submitted_at?: string | null; evaluation_approved_at?: string | null; evaluation_approved_by?: string | null;
  submitted_at?: string | null; approved_at?: string | null; approved_by?: string | null; locked_at?: string | null;
  final_score?: string | null; final_grade?: string | null;
  bsc_cycles: {
    id: string; code: string; name: string; year: number; month: number | null; status: string;
      start_date?: string; end_date?: string | null;
  };
  users_employee_bsc_employee_idTousers: { id: string; employee_code: string; full_name: string; email: string };
  users_employee_bsc_direct_manager_idTousers?: { id: string; employee_code: string; full_name: string; email?: string };
  departments: { id: string; code: string; name: string };
  positions?: { id: string; code: string; name: string; level: number };
  employee_bsc_items?: BscItem[];
  goal_groups?: BscGoalGroup[];
  bsc_status_histories?: BscStatusHistory[];
  _count?: { employee_bsc_items: number };
};
export type BscStatusHistory = {
  id: string; stage: 'PLAN' | 'EVALUATION'; from_status: string | null; to_status: string; action: string; comment: string | null;
  changed_by: string; changed_at: string; users: { id: string; employee_code: string; full_name: string };
};
export type BscPage = { items: EmployeeBsc[]; page: number; limit: number; total: number; filterOptions?: BscFilterOptions };
export type BscFilterOptions = {
  cycles: Array<{ id: string; name: string; status: string }>;
  departments: Array<{ id: string; code: string; name: string }>;
};

export type BscScoringItem = {
  itemId: string; calculationMethod: string; target: number | null; actual: number | null; weight: number;
  isScorable: boolean; reason: string | null;
  rawAchievementPercentage: number | null; roundedAchievementPercentage: number | null;
  rawWorkScore: number | null; roundedWorkScore: number | null; weightedScore: number | null;
};

export type BscScoringPreview = {
  bscId: string; planStatus: string; evaluationStatus: string; totalWeight: number; scoredWeight: number; totalWeightedScore: number;
  isComplete: boolean; classification: 'C' | 'B' | 'A' | 'A+' | 'A++' | null; items: BscScoringItem[];
};

export type BscVersionSummary = {
  id: string; versionNumber: number; stage: 'PLAN' | 'EVALUATION' | 'FULL'; versionType: string; createdAt: string;
  createdBy: { id: string; employee_code: string; full_name: string };
  sourceReviewId: string | null; sourceReopenRequestId: string | null;
  summary: { itemCount: number; totalWeight: unknown; totalScore: unknown; finalGrade: unknown };
};

export type BscVersionDetail = Omit<BscVersionSummary, 'summary'> & { snapshot: Record<string, unknown> };

export type BscReopenRequest = {
  id: string; employee_bsc_id: string; stage: 'PLAN' | 'EVALUATION'; requested_by: string; reviewer_id: string | null;
  request_reason: string; requested_at: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  reviewed_by: string | null; review_comment: string | null; reviewed_at: string | null;
  source_version_id: string | null; resulting_version_id: string | null;
  users_bsc_unlock_requests_requested_byTousers: { id: string; employee_code: string; full_name: string };
  users_bsc_unlock_requests_reviewer_idTousers: { id: string; employee_code: string; full_name: string } | null;
  employee_bsc: EmployeeBsc;
};

export type BscReopenPage = { items: BscReopenRequest[]; page: number; limit: number; total: number };
export type BscDuplicateOptions = {
  sourceBscId: string; sourceVersion: BscVersionSummary | null;
  cycles: Array<{ id: string; code: string; name: string; year: number; month: number | null; status: string; start_date: string }>;
  suggestedCycleId: string | null;
};
