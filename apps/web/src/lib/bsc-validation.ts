type WeightedItem = {
  id: string;
  weight: string | number;
};

const normalizeWeight = (value: number) => Number(value.toFixed(6));

export function validateKpiWeight(items: WeightedItem[], candidateWeight: number, editedItemId?: string): string | null {
  if (!Number.isFinite(candidateWeight) || candidateWeight <= 0 || candidateWeight > 100) {
    return 'Tỷ trọng KPI phải lớn hơn 0% và không vượt quá 100%.';
  }

  const currentTotal = items.reduce((sum, item) => sum + Number(item.weight), 0);
  const previousWeight = editedItemId
    ? Number(items.find((item) => item.id === editedItemId)?.weight ?? 0)
    : 0;
  const nextTotal = normalizeWeight(currentTotal - previousWeight + candidateWeight);

  if (nextTotal > 100) {
    return `Tổng tỷ trọng sau khi lưu sẽ là ${nextTotal}%, không được vượt quá 100%.`;
  }

  return null;
}

export function planSubmissionError(items: WeightedItem[], hasCompleteDefinitions = true): string | null {
  if (items.length === 0) return 'BSC phải có ít nhất một KPI trước khi gửi duyệt.';
  if (items.some((item) => {
    const weight = Number(item.weight);
    return !Number.isFinite(weight) || weight <= 0 || weight > 100;
  })) return 'Mỗi KPI phải có tỷ trọng lớn hơn 0% và không vượt quá 100%.';
  const totalWeight = normalizeWeight(items.reduce((sum, item) => sum + Number(item.weight), 0));
  if (!Number.isFinite(totalWeight)) return 'Tổng tỷ trọng KPI không hợp lệ.';
  if (totalWeight < 100) return `Tổng tỷ trọng hiện tại là ${totalWeight}%, còn thiếu ${normalizeWeight(100 - totalWeight)}%.`;
  if (totalWeight > 100) return `Tổng tỷ trọng hiện tại là ${totalWeight}%, đang vượt ${normalizeWeight(totalWeight - 100)}%.`;
  if (!hasCompleteDefinitions) return 'Một hoặc nhiều KPI chưa có đầy đủ nội dung, chỉ tiêu hoặc cách tính điểm.';
  return null;
}
