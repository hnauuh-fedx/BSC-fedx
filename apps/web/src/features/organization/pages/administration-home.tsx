import React from 'react';
import { Link } from 'react-router-dom';
import {
  ADMINISTRATION_CAPABILITIES,
  ADMINISTRATION_DESTINATIONS,
  hasAnyPermission,
} from '../administration-navigation';
import { PageHeader } from '../management-ui';

type Props = { permissions: string[] };

export const AdministrationHome: React.FC<Props> = ({ permissions }) => {
  const visibleDestinations = ADMINISTRATION_DESTINATIONS.filter(item => hasAnyPermission(permissions, item.permissions));
  const visibleCapabilities = ADMINISTRATION_CAPABILITIES.filter(item => hasAnyPermission(permissions, item.permissions));
  return <main>
    <PageHeader title="Quản trị hệ thống" description="Các chức năng được hiển thị độc lập theo permission của tài khoản."/>
    <section aria-labelledby="admin-destinations-title"><h2 id="admin-destinations-title">Chức năng quản trị</h2><div className="admin-card-grid">
      {visibleDestinations.map(item => <Link aria-label={item.label} className="admin-card" key={item.href} to={item.href}><strong>{item.label}</strong><span>{item.description}</span></Link>)}
    </div></section>
    {visibleCapabilities.length > 0 && <section aria-labelledby="admin-capabilities-title"><h2 id="admin-capabilities-title">Phân hệ đã được cấp quyền</h2><p className="page-description">Các phân hệ dưới đây đã có permission backend nhưng chưa có màn hình chuyên biệt trong frontend hiện tại.</p><ul className="capability-list">{visibleCapabilities.map(item => <li key={item.label}>{item.label}</li>)}</ul></section>}
  </main>;
};
