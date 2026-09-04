import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { teachersApi } from '../../api/teachersApi';
import Card from '../../components/ui/Card';
import Skeleton from '../../components/ui/Skeleton';
import StatusBadge from '../../components/ui/StatusBadge';
import ProgressBar from '../../components/ui/ProgressBar';

export default function TeacherProfilePage() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [results, setResults] = useState([]);
  const [students, setStudents] = useState({ items: [], total: 0 });
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    teachersApi.get(id).then(({ data }) => setProfile(data)).catch(() => {});
    teachersApi.getResults(id, { limit: 10 }).then(({ data }) => setResults(data.items)).catch(() => {});
    teachersApi.getStudents(id, { limit: 5 }).then(({ data }) => setStudents({ items: data.items, total: data.pagination.total })).catch(() => {});
    teachersApi.getResultSessions(id, { limit: 10 }).then(({ data }) => setSessions(data.items)).catch(() => {});
  }, [id]);

  if (!profile) return <Skeleton className="h-64 w-full" />;

  const { user, stats } = profile;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">{user.name}</h1>
            <p className="text-sm text-slate-500">{user.designation} • {user.email}</p>
          </div>
          <StatusBadge status={user.status} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div><p className="text-slate-500">Employee ID</p><p className="font-medium">{user.employeeId || '-'}</p></div>
          <div><p className="text-slate-500">Phone</p><p className="font-medium">{user.phone || '-'}</p></div>
          <div><p className="text-slate-500">Role</p><p className="font-medium capitalize">{user.role.replace('_', ' ')}</p></div>
          <div><p className="text-slate-500">Joined</p><p className="font-medium">{new Date(user.createdAt).toLocaleDateString()}</p></div>
          <div><p className="text-slate-500">Total Results</p><p className="font-medium">{stats.totalResults}</p></div>
          <div><p className="text-slate-500">Students Processed</p><p className="font-medium">{stats.totalStudentsProcessed}</p></div>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Students</h2>
          <span className="text-sm text-slate-500">{students.total} registered</span>
        </div>
        {students.items.length === 0 ? (
          <p className="text-sm text-slate-500">No students registered yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3">Roll No</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Class</th>
                  <th className="py-2 pr-3">Year</th>
                </tr>
              </thead>
              <tbody>
                {students.items.map((s) => (
                  <tr key={s._id} className="border-b border-slate-100">
                    <td className="py-2 pr-3">{s.rollNumber}</td>
                    <td className="py-2 pr-3">{s.name}</td>
                    <td className="py-2 pr-3">{s.class}{s.section ? ` - ${s.section}` : ''}</td>
                    <td className="py-2 pr-3">{s.academicYear}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Result Sessions</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-slate-500">No result sessions yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {sessions.map((s) => (
              <Link
                key={s._id}
                to={`/teachers/${id}/result-sessions/${s._id}`}
                className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-800">{s.examName || s.examType}</p>
                  <p className="text-xs text-slate-400">
                    Class {s.class}{s.section ? ` - ${s.section}` : ''} • {s.students.length} students
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {s.finalResultId ? (
                    <span className="text-xs font-medium text-emerald-600">Finalized</span>
                  ) : (
                    <div className="w-32"><ProgressBar value={s.submittedCount || 0} total={s.subjects.length} /></div>
                  )}
                  {s.submissionStatus === 'ACTIVE' ? (
                    <span className="text-xs">🟢</span>
                  ) : (
                    <span className="text-xs">🔴</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Results Created By This Teacher</h2>
        {results.length === 0 ? (
          <p className="text-sm text-slate-500">No results yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3">Class</th>
                <th className="py-2 pr-3">Exam</th>
                <th className="py-2 pr-3">Year</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r._id} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{r.class}{r.section ? ` - ${r.section}` : ''}</td>
                  <td className="py-2 pr-3">{r.examName || r.examType}</td>
                  <td className="py-2 pr-3">{r.academicYear}</td>
                  <td className="py-2 pr-3"><Link to={`/results/${r._id}`} className="text-brand-600 font-medium">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
