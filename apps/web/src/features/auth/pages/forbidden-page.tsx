import React from 'react';
import { Button } from '../../../components/ui/button';
import { useAuth } from '../hooks/use-auth';

export const ForbiddenPage: React.FC = () => {
  const { logout } = useAuth();

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="flex max-w-lg flex-col items-center gap-4 text-center" aria-labelledby="forbidden-title">
        <h1 id="forbidden-title" className="text-3xl font-semibold">Không có quyền truy cập</h1>
        <p className="text-muted-foreground">
          Tài khoản chưa được cấp permission cho một khu vực làm việc. Hãy liên hệ quản trị viên để được hỗ trợ.
        </p>
        <Button type="button" onClick={() => void logout()}>Đăng xuất</Button>
      </section>
    </main>
  );
};
