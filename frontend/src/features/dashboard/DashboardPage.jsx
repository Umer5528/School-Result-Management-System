import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FilePlus2, FileText, Users, TrendingUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { resultsApi } from '../../api/resultsApi';
import { teachersApi } from '../../api/teachersApi';
import Card from '../../components/ui/Card';
import Skeleton from '../../components/ui/Skeleton';
import Button from '../../components/ui/Button';

const GRADIENTS = {
  brand: 'from-brand-500 to-indigo-500',
  emerald: 'from-emerald-400 to-teal-500',
  amber: 'from-amber-400 to-orange-500',
};

function StatCard({ label, value, icon: Icon, color = 'brand', delay = 0 }) {
  return (
    <Card
      hoverable
      className="flex items-center gap-4 animate-fadeInUp"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${GRADIENTS[color]} text-white shadow-glow`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-2xl font-semibold text-slate-800">{value}</p>
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

  const avgPassRate = recentResults.length
    ? Math.round(recentResults.reduce((sum, r) => sum + (r.statistics?.passPercentage || 0), 0) / recentResults.length)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 animate-fadeInUp">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 sm:text-2xl">
            Welcome back, <span className="bg-brand-gradient bg-clip-text text-transparent">{user.name.split(' ')[0]}</span>
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
        <StatCard label="Recent Results" value={loading ? '—' : recentResults.length} icon={FileText} color="brand" delay={0} />
        {avgPassRate !== null && (
          <StatCard label="Avg Pass Rate" value={`${avgPassRate}%`} icon={TrendingUp} color="emerald" delay={60} />
        )}
        {pendingCount !== null && (
          <StatCard label="Pending Teacher Registrations" value={pendingCount} icon={Users} color="amber" delay={120} />
        )}
      </div>

      <Card className="animate-fadeInUp" style={{ animationDelay: '160ms' }}>
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
                  <tr key={r._id} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                    <td className="py-2 pr-4">{r.class}{r.section ? ` - ${r.section}` : ''}</td>
                    <td className="py-2 pr-4">{r.examName || r.examType}</td>
                    <td className="py-2 pr-4">{r.academicYear}</td>
                    <td className="py-2 pr-4">{r.statistics?.totalStudents}</td>
                    <td className="py-2 pr-4">{r.statistics?.passPercentage}%</td>
                    <td className="py-2 text-right">
                      <Link to={`/results/${r._id}`} className="font-medium text-brand-600 transition-colors hover:text-brand-800">
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
