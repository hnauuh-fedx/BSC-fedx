import React from 'react';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { EmptyState, LoadingState } from '../../organization/management-ui';
import type { BscMinutesSummary } from '../bsc-minutes.types';

type Props = {
  open: boolean;
  loading: boolean;
  items: BscMinutesSummary[];
  onOpenChange: (open: boolean) => void;
  onSelect: (minutes: BscMinutesSummary) => void;
};

const dateLabel = (value: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

export const SavedMinutesDialog: React.FC<Props> = ({ open, loading, items, onOpenChange, onSelect }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle>Biên bản đã lưu</DialogTitle>
        <DialogDescription>Mở lại đúng snapshot đã lưu để chỉnh sửa, in hoặc xuất PDF.</DialogDescription>
      </DialogHeader>
      {loading ? <LoadingState message="Đang tải biên bản đã lưu…"/> : items.length === 0 ? (
        <EmptyState message="Chưa có biên bản nào được lưu."/>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader><TableRow><TableHead>Số</TableHead><TableHead>Kỳ BSC</TableHead><TableHead>Thư ký</TableHead><TableHead>Cập nhật</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader>
            <TableBody>{items.map((item) => <TableRow key={item.id}>
              <TableCell>{item.minutes_number || 'Chưa đánh số'}</TableCell>
              <TableCell>{item.bsc_cycles.name}</TableCell>
              <TableCell>{item.secretary_name}</TableCell>
              <TableCell>{dateLabel(item.updated_at)}</TableCell>
              <TableCell className="text-right"><Button type="button" variant="outline" size="sm" onClick={() => onSelect(item)}>Mở</Button></TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </div>
      )}
    </DialogContent>
  </Dialog>
);
