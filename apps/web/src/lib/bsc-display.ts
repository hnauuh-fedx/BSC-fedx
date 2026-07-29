export const personalBscTitle = (cycleName: string) => {
  const cycle = cycleName.trim();
  return /^BSC(?:\s|$)/i.test(cycle) ? cycle : `BSC ${cycle}`;
};

export const departmentBscTitle = (departmentName: string, cycleName: string) =>
  `BSC ${departmentName.trim()} · ${cycleName.trim()}`;
