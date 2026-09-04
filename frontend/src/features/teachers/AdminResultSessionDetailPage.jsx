import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronRight, Lock } from 'lucide-react';
import { teachersApi } from '../../api/teachersApi';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';
import Modal from '../../components/ui/Modal';
import ProgressBar from '../../components/ui/ProgressBar';
import StatusBadge from '../../components/ui/StatusBadge';

const LINK_STATUS_LABEL = {
  PENDING: { text: '🟡 Pending', className: 'text-amber-600' },
  SUBMITTED: { text: '🟢 Submitted', className: 'text-emerald-600' },
  LOCKED: { text: '🔒 Locked', className: 'text-slate-500' },
  DISABLED: { text: '🔴 Disabled', className: 'text-red-500' },
};

// Read-only mirror of the teacher's own ResultSessionDetailPage, with
// exactly two mutation exceptions the spec explicitly grants admins:
// disabling a pending link and reopening a submitted one. Everything
// else (edit marks, lock/unlock, regenerate, activate/deactivate) stays
// on the teacher's own routes only.
export default function AdminResultSessionDetailPage() {
  const { id, sessionId } = useParams(); // id = teacher's user id
  const { hasPermission } = useAuth();
  const canManage = hasPermission('MANAGE_RESULTS');
  const [session, setSession] = useState(null);
  const [rowBusy, setRowBusy] = useState(null);
  const [inspecting, setInspecting] = useState(null);
  const [submissionDetail, setSubmissionDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  function load() {
    teachersApi.getResultSession(id, sessionId).then(({ data }) => setSession(data.session));
  }
  useEffect(load, [id, sessionId]); // eslint-disable-line

  async function openSubject(subject) {
    if (!subject.submitted) return;
    setInspecting(subject);
    setLoadingDetail(true);
    setSubmissionDetail(null);
    try {
      const { data } = await teachersApi.getSubjectSubmission(id, sessionId, subject._id);
      setSubmissionDetail(data.submission);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load submission');
      setInspecting(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleDisable(subjectId) {
    setRowBusy(subjectId);
    try {
      await teachersApi.disableSubjectLink(id, sessionId, subjectId);
      toast.success('Link disabled');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to disable link');
    } finally {
      setRowBusy(null);
    }
  }

  async function handleReopen(subject) {
    if (!window.confirm(`Reopen ${subject.name}? Its marks will be cleared.`)) return;
    setRowBusy(subject._id);
    try {
      await teachersApi.reopenSubjectSubmission(id, sessionId, subject._id);
      toast.success(`${subject.name} reopened`);
      setInspecting(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reopen');
    } finally {
      setRowBusy(null);
    }
  }

  if (!session) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-slate-800">{session.examName || session.examType}</h1>
            <p className="text-sm text-slate-500">
              Class {session.class}{session.section ? ` - ${session.section}` : ''} • {session.academicYear} •{' '}
              {new Date(session.resultDate).toLocaleDateString()} • by {session.teacherNameSnapshot}
            </p>
          </div>
          {session.submissionStatus === 'ACTIVE' ? (
            <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">🟢 Active</span>
          ) : (
            <span className="shrink-0 rounded-full bg-slate-200 px-3 py-1 text-sm font-medium text-slate-600">🔴 Off</span>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div><p className="text-slate-500">Students</p><p className="font-medium">{session.students.length}</p></div>
          <div><p className="text-slate-500">Subjects</p><p className="font-medium">{session.subjects.length}</p></div>
        </div>
        {!session.finalResultId && (
          <div className="mt-4">
            <ProgressBar value={session.submittedCount || 0} total={session.subjects.length} label="Subjects Submitted" />
          </div>
        )}
        {session.finalResultId && <p className="mt-3 text-xs font-medium text-emerald-600">Finalized</p>}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Subject Submission Links</h2>
        <div className="divide-y divide-slate-100">
          {session.subjects.map((s) => {
            const label = s.linkStatus ? LINK_STATUS_LABEL[s.linkStatus] : { text: 'Not activated', className: 'text-slate-400' };
            const isBusy = rowBusy === s._id;
            return (
              <div key={s._id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => openSubject(s)}
                    disabled={!s.submitted}
                    className={`min-w-0 flex-1 text-left ${s.submitted ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <p className="font-medium text-slate-800">{s.name}</p>
                    <p className="text-xs text-slate-400">{s.totalMarks} marks • Pass {s.passingMarks}</p>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`text-sm ${label.className}`}>{label.text}</span>
                    {s.submitted && <ChevronRight size={16} className="text-slate-300" />}
                  </div>
                </div>
                {canManage && s.linkStatus === 'PENDING' && (
                  <div className="mt-2">
                    <button onClick={() => handleDisable(s._id)} disabled={isBusy} className="text-xs font-medium text-red-500 hover:underline">
                      Disable Link
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Modal
        open={!!inspecting}
        onClose={() => setInspecting(null)}
        title={inspecting ? `${inspecting.name} — Submitted Marks` : ''}
        footer={
          canManage && submissionDetail && submissionDetail.status !== 'LOCKED' ? (
            <Button variant="secondary" onClick={() => handleReopen(inspecting)} disabled={rowBusy === inspecting?._id}>
              Reopen
            </Button>
          ) : null
        }
      >
        {loadingDetail ? (
          <Skeleton className="h-48 w-full" />
        ) : submissionDetail ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-400">
                Submitted {new Date(submissionDetail.submittedAt).toLocaleString()} via{' '}
                {submissionDetail.submittedVia === 'public' ? 'submission link' : 'teacher'}
              </p>
              {submissionDetail.status === 'LOCKED' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                  <Lock size={10} /> Locked
                </span>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-3 py-2">Roll</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Marks</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {submissionDetail.rows.map((r) => (
                    <tr key={r.rollNumber} className="border-b border-slate-100">
                      <td className="px-3 py-1.5">{r.rollNumber}</td>
                      <td className="px-3 py-1.5">{r.name}</td>
                      <td className="px-3 py-1.5">{r.obtained}/{r.totalMarks}</td>
                      <td className="px-3 py-1.5"><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
