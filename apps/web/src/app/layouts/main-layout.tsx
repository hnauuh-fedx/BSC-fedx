import React, { PropsWithChildren } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../features/auth/hooks/use-auth';
export const MainLayout: React.FC<PropsWithChildren> = ({ children }) => {
  const { user, logout } = useAuth();
  const canReport = user?.permissions.some(permission => ['bsc.statistics.personal', 'bsc.statistics.unit', 'bsc.statistics.organization'].includes(permission));
  return <div className="min-h-screen bg-muted/30"><header className="border-b bg-background"><div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-5 px-5 py-3"><strong>BSC Management</strong><nav className="flex flex-1 flex-wrap gap-4">{canReport && <NavLink to="/dashboard">Dashboard</NavLink>}<NavLink to="/employee-bsc">BSC</NavLink>{canReport && <NavLink to="/reports/bsc">Báo cáo</NavLink>}{user?.permissions.some(permission => permission.includes('.approve.subordinate') || permission.includes('.return.subordinate')) && <NavLink to="/management/bsc-reviews">Chờ duyệt</NavLink>}</nav><span>{user?.fullName}</span><button type="button" onClick={() => void logout()}>Đăng xuất</button></div></header><div className="mx-auto max-w-[1600px] p-5">{children}</div></div>;
};
