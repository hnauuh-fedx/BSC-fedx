type DepartmentRow = { departmentId?: string; departmentName?: string };

export const groupMinutesRows = <T extends DepartmentRow>(rows: T[]) => {
  const groups = new Map<string, { key: string; departmentName: string; rows: T[] }>();
  for (const row of rows) {
    const key = row.departmentId || row.departmentName || '';
    const group = groups.get(key) ?? {
      key,
      departmentName: row.departmentName || 'Chưa có thông tin phòng ban',
      rows: [],
    };
    group.rows.push(row);
    groups.set(key, group);
  }

  let startIndex = 0;
  return [...groups.values()]
    .sort((a, b) => !a.key ? 1 : !b.key ? -1 : a.departmentName.localeCompare(b.departmentName, 'vi') || a.key.localeCompare(b.key))
    .map((group) => {
      const result = { ...group, startIndex };
      startIndex += group.rows.length;
      return result;
    });
};
