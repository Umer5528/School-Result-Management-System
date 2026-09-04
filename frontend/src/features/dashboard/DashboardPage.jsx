import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FilePlus2, FileText, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { resultsApi } from '../../api/resultsApi';
import { teachersApi } from '../../api/teachersApi';
import Card from '../../components/ui/Card';
import Skeleton from '../../components/ui/Skeleton';
import StatusBadge from '../../components/ui/StatusBadge';
import Button from '../../components/ui/Button';

function StatCard({ label, value, icon: Icon }) {
  return (
    <Card className="flex items-center gap-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-xl font-semibold text-slate-800">{value}</p>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const isAdmin = user.role === 'super_admin' || user.role === 'assistant_admin';
  const [recentResults, setRecentResults] = useState([]);
  const [pendingCount, setPendingCount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      resultsApi.list({ limit: 5, sortBy: 'createdAt', sortDir: 'desc' }),
      isAdmin && hasPermission('APPROVE_TEACHERS')
        ? teachersApi.pending({ limit: 1 })
        : Promise.resolve(null),
    ])
      .then(([resultsRes, pendingRes]) => {
        if (!mounted) return;
        setRecentResults(resultsRes.data.items);
        if (pendingRes) setPendingCount(pendingRes.data.pagination.total);
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            Welcome back, {user.name.split(' ')[0]}
          </h1>
          <p className="text-sm text-slate-500 capitalize">{user.role.replace('_', ' ')} dashboard</p>
        </div>
        {user.role === 'teacher' && (
          <Link to="/results/create">
            <Button>
              <FilePlus2 size={16} /> Create New Result
            </Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Recent Results" value={loading ? '—' : recentResults.length} icon={FileText} />
        {pendingCount !== null && (
          <StatCard label="Pending Teacher Registrations" value={pendingCount} icon={Users} />
        )}
      </div>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Recent Results</h2>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : recentResults.length === 0 ? (
          <p className="text-sm text-slate-500">No results yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Class</th>
                  <th className="py-2 pr-4">Exam</th>
                  <th className="py-2 pr-4">Academic Year</th>
                  <th className="py-2 pr-4">Students</th>
                  <th className="py-2 pr-4">Pass %</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {recentResults.map((r) => (
                  <tr key={r._id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{r.class}{r.section ? ` - ${r.section}` : ''}</td>
                    <td className="py-2 pr-4">{r.examName || r.examType}</td>
                    <td className="py-2 pr-4">{r.academicYear}</td>
                    <td className="py-2 pr-4">{r.statistics?.totalStudents}</td>
                    <td className="py-2 pr-4">{r.statistics?.passPercentage}%</td>
                    <td className="py-2 text-right">
                      <Link to={`/results/${r._id}`} className="text-brand-600 font-medium">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
