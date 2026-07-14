export type BscItem = {
  id: string; employee_bsc_id: string; kpi_code: string; kpi_name: string; description: string | null;
  measurement_unit: string | null; target_value: string | null; target_text: string | null;
  actual_value: string | null; actual_text: string | null; weight: string; calculation_method: string;
  employee_note: string | null; sort_order: number;
};
export type EmployeeBsc = {
  id: string; bsc_code: string; cycle_id: string; employee_id: string; department_id: string; position_id: string;
  direct_manager_id: string; status: string; employee_comment: string | null; created_at: string; updated_at: string;
  bsc_cycles: { id: string; code: string; name: string; year: number; month: number | null; status: string };
  users_employee_bsc_employee_idTousers: { id: string; employee_code: string; full_name: string; email: string };
  departments: { id: string; code: string; name: string };
  positions?: { id: string; code: string; name: string; level: number };
  employee_bsc_items?: BscItem[];
  _count?: { employee_bsc_items: number };
};
export type BscPage = { items: EmployeeBsc[]; page: number; limit: number; total: number };
