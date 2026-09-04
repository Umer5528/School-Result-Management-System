import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { teachersApi } from '../../api/teachersApi';
import { useAuth } from '../../context/AuthContext';
import { useDebounce } from '../../hooks/useDebounce';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';
import Skeleton from '../../components/ui/Skeleton';

export default function TeacherManagementPage() {
  const { user, hasPermission } = useAuth();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    teachersApi.list({ search }).then(({ data }) => setItems(data.items)).finally(() => setLoading(false));
  }
  useEffect(load, []); // eslint-disable-line
  useEffect(load, [debouncedSearch]); // eslint-disable-line

  async function act(fn, id, successMsg) {
    try {
      await fn(id);
      toast.success(successMsg);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800">Manage Teachers</h1>
        <Link to="/teachers/pending" className="text-sm font-medium text-brand-600">
          View Pending Registrations →
        </Link>
      </div>

      <Card>
        <div className="flex gap-3">
          <Input placeholder="Search by name, email, employee ID" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
          <Button onClick={load}>Search</Button>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3"><Link to={`/teachers/${t.id}`} className="font-medium text-slate-800">{t.name}</Link></td>
                  <td className="py-2 pr-3">{t.email}</td>
                  <td className="py-2 pr-3 capitalize">{t.role.replace('_', ' ')}</td>
                  <td className="py-2 pr-3"><StatusBadge status={t.status} /></td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-2">
                      {hasPermission('RESET_PASSWORDS') && (
                        <Button variant="secondary" onClick={() => act(teachersApi.resetPassword, t.id, 'Password reset')}>Reset Password</Button>
                      )}
                      {user.role === 'super_admin' && t.status === 'approved' && (
                        <Button variant="secondary" onClick={() => act(teachersApi.suspend, t.id, 'Suspended')}>Suspend</Button>
                      )}
                      {user.role === 'super_admin' && t.status === 'suspended' && (
                        <Button variant="secondary" onClick={() => act(teachersApi.reactivate, t.id, 'Reactivated')}>Reactivate</Button>
                      )}
                      {user.isPrimarySuperAdmin && t.role === 'teacher' && t.status === 'approved' && (
                        <Button variant="secondary" onClick={() => act((id) => teachersApi.promote(id, []), t.id, 'Promoted')}>Promote</Button>
                      )}
                      {user.isPrimarySuperAdmin && t.role === 'assistant_admin' && (
                        <Button variant="secondary" onClick={() => act(teachersApi.demote, t.id, 'Demoted')}>Demote</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
