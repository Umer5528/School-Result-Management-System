import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { resultSessionsApi } from '../../api/resultSessionsApi';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import ProgressBar from '../../components/ui/ProgressBar';

function StatusPill({ status }) {
  return status === 'ACTIVE' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
      🟢 Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600">
      🔴 Off
    </span>
  );
}

export default function ResultSessionsListPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    resultSessionsApi.list().then(({ data }) => setItems(data.items)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800">Result Submissions</h1>
        <Link to="/result-sessions/new">
          <Button><Plus size={16} /> New Result Session</Button>
        </Link>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <EmptyState title="No result sessions yet" description="Create one to start collecting subject-wise marks from external submitters." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => (
            <Link key={s._id} to={`/result-sessions/${s._id}`}>
              <Card className="h-full hover:border-brand-300">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-800">{s.examName || s.examType}</p>
                    <p className="text-sm text-slate-500">Class {s.class}{s.section ? ` - ${s.section}` : ''}</p>
                  </div>
                  <StatusPill status={s.submissionStatus} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-slate-500">Students</p><p className="font-medium">{s.students.length}</p></div>
                  <div><p className="text-slate-500">Subjects</p><p className="font-medium">{s.subjects.length}</p></div>
                </div>
                {!s.finalResultId && (
                  <div className="mt-3">
                    <ProgressBar value={s.submittedCount || 0} total={s.subjects.length} label="Subjects Submitted" />
                  </div>
                )}
                {s.finalResultId && <p className="mt-3 text-xs font-medium text-emerald-600">Finalized</p>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
