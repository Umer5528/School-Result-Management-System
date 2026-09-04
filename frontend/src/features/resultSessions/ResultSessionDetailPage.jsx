import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CheckCircle2, ChevronRight, Copy, Lock, Pencil, RefreshCw, Share2, Sparkles, Unlock,
} from 'lucide-react';
import { resultSessionsApi } from '../../api/resultSessionsApi';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Skeleton from '../../components/ui/Skeleton';
import Modal from '../../components/ui/Modal';
import ProgressBar from '../../components/ui/ProgressBar';
import StatusBadge from '../../components/ui/StatusBadge';

function submissionUrl(token) {
  return `${window.location.origin}/submit?code=${token}`;
}

function copy(text, label) {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
}

async function shareLink(subjectName, token) {
  const url = submissionUrl(token);
  if (navigator.share) {
    try {
      await navigator.share({ title: `${subjectName} Result Submission`, url });
    } catch {
      // user cancelled the share sheet -- not an error
    }
  } else {
    copy(url, 'Link');
  }
}

const LINK_STATUS_LABEL = {
  PENDING: { text: '🟡 Pending', className: 'text-amber-600' },
  SUBMITTED: { text: '🟢 Submitted', className: 'text-emerald-600' },
  LOCKED: { text: '🔒 Locked', className: 'text-slate-500' },
  DISABLED: { text: '🔴 Disabled', className: 'text-red-500' },
};

export default function ResultSessionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState(null); // subjectId currently mid-action

  const [inspecting, setInspecting] = useState(null);
  const [submissionDetail, setSubmissionDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editMarks, setEditMarks] = useState({});
  const [editTotal, setEditTotal] = useState(0);
  const [editPassing, setEditPassing] = useState(0);
  const [actionBusy, setActionBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  function load() {
    resultSessionsApi.get(id).then(({ data }) => setSession(data.session));
  }
  useEffect(load, [id]); // eslint-disable-line

  async function handleActivate() {
    setBusy(true);
    try {
      const { data } = await resultSessionsApi.activate(id);
      setSession(data.session);
      toast.success('Result submission is active. Share each subject\'s link below.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to activate');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivateAll() {
    if (!window.confirm('Turn off submission for every pending subject? Already-submitted subjects are unaffected.')) return;
    setBusy(true);
    try {
      const { data } = await resultSessionsApi.deactivate(id);
      setSession(data.session);
      toast.success('Pending subject links turned off');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to turn off');
    } finally {
      setBusy(false);
    }
  }

  async function withRowBusy(subjectId, fn) {
    setRowBusy(subjectId);
    try {
      await fn();
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setRowBusy(null);
    }
  }

  const handleDisable = (subjectId) =>
    withRowBusy(subjectId, async () => {
      await resultSessionsApi.disableSubjectLink(id, subjectId);
      toast.success('Link disabled');
    });
  const handleEnable = (subjectId) =>
    withRowBusy(subjectId, async () => {
      await resultSessionsApi.enableSubjectLink(id, subjectId);
      toast.success('Link re-enabled');
    });
  const handleRegenerate = (subjectId, name) => {
    if (!window.confirm(`Generate a new link for ${name}? The old link will stop working immediately.`)) return;
    return withRowBusy(subjectId, async () => {
      await resultSessionsApi.regenerateSubjectToken(id, subjectId);
      toast.success('New link generated');
    });
  };

  async function openSubject(subject) {
    if (!subject.submitted) return;
    setInspecting(subject);
    setEditMode(false);
    setLoadingDetail(true);
    setSubmissionDetail(null);
    try {
      const { data } = await resultSessionsApi.getSubjectSubmission(id, subject._id);
      setSubmissionDetail(data.submission);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load submission');
      setInspecting(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  function enterEditMode() {
    const marksMap = {};
    submissionDetail.rows.forEach((r) => { marksMap[r.rollNumber] = r.obtained; });
    setEditMarks(marksMap);
    setEditTotal(submissionDetail.totalMarks);
    setEditPassing(submissionDetail.passingMarks);
    setEditMode(true);
  }

  async function saveEdit() {
    setActionBusy(true);
    try {
      await resultSessionsApi.editSubjectSubmission(id, inspecting._id, {
        totalMarks: Number(editTotal),
        passingMarks: Number(editPassing),
        marks: submissionDetail.rows.map((r) => ({ rollNumber: r.rollNumber, obtained: Number(editMarks[r.rollNumber]) || 0 })),
      });
      toast.success('Marks updated');
      setEditMode(false);
      openSubject(inspecting);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update marks');
    } finally {
      setActionBusy(false);
    }
  }

  async function toggleLock() {
    setActionBusy(true);
    try {
      const action = submissionDetail.status === 'LOCKED' ? resultSessionsApi.unlockSubject : resultSessionsApi.lockSubject;
      await action(id, inspecting._id);
      toast.success(submissionDetail.status === 'LOCKED' ? 'Subject unlocked' : 'Subject locked');
      openSubject(inspecting);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleReopen() {
    if (!window.confirm(`Reopen ${inspecting.name}? Its marks will be cleared and the same link can be used to submit it again.`)) return;
    setActionBusy(true);
    try {
      await resultSessionsApi.reopenSubject(id, inspecting._id);
      toast.success(`${inspecting.name} reopened`);
      setInspecting(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reopen');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleGenerateFinal() {
    if (!window.confirm('Generate the final result? Marks for all subjects will be locked into the official result.')) return;
    setFinalizing(true);
    try {
      const { data } = await resultSessionsApi.generateFinal(id);
      toast.success('Final result generated');
      navigate(`/results/${data.result._id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate final result');
    } finally {
      setFinalizing(false);
    }
  }

  if (!session) return <Skeleton className="h-64 w-full" />;

  const submittedCount = session.submittedCount || 0;
  const everActivated = session.subjects.some((s) => s.linkStatus !== null);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-slate-800">{session.examName || session.examType}</h1>
            <p className="text-sm text-slate-500">
              Class {session.class}{session.section ? ` - ${session.section}` : ''} • {session.academicYear} •{' '}
              {new Date(session.resultDate).toLocaleDateString()}
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
            <ProgressBar value={submittedCount} total={session.subjects.length} label="Subjects Submitted" />
          </div>
        )}
      </Card>

      {!session.finalResultId && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              {everActivated
                ? 'Each subject below has its own unique submission link.'
                : 'Activate to generate a unique submission link for every subject.'}
            </p>
            {session.submissionStatus === 'ACTIVE' ? (
              <Button variant="danger" onClick={handleDeactivateAll} disabled={busy}>Turn Off All Pending</Button>
            ) : (
              <Button onClick={handleActivate} disabled={busy}>
                {everActivated ? 'Turn On Result Submission' : 'Generate Subject Links'}
              </Button>
            )}
          </div>
        </Card>
      )}

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

                {s.linkStatus === 'PENDING' && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <code className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold tracking-wide text-slate-700">
                      {s.submissionToken}
                    </code>
                    <button onClick={() => copy(s.submissionToken, 'Code')} className="text-slate-400 hover:text-slate-700" title="Copy code">
                      <Copy size={14} />
                    </button>
                    <button onClick={() => copy(submissionUrl(s.submissionToken), 'Link')} className="text-xs font-medium text-brand-600 hover:underline">
                      Copy Link
                    </button>
                    <button onClick={() => shareLink(s.name, s.submissionToken)} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                      <Share2 size={12} /> Share
                    </button>
                    <button onClick={() => handleRegenerate(s._id, s.name)} disabled={isBusy} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:underline">
                      <RefreshCw size={12} /> New Link
                    </button>
                    <button onClick={() => handleDisable(s._id)} disabled={isBusy} className="text-xs font-medium text-red-500 hover:underline">
                      Disable
                    </button>
                  </div>
                )}

                {s.linkStatus === 'DISABLED' && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <button onClick={() => handleEnable(s._id)} disabled={isBusy} className="text-xs font-medium text-emerald-600 hover:underline">
                      Re-enable Link
                    </button>
                    <button onClick={() => handleRegenerate(s._id, s.name)} disabled={isBusy} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:underline">
                      <RefreshCw size={12} /> New Link
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        {session.finalResultId ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 size={18} />
              <p className="text-sm font-medium">Final result has been generated.</p>
            </div>
            <Button onClick={() => navigate(`/results/${session.finalResultId}`)}>View Final Result</Button>
          </div>
        ) : submittedCount === session.subjects.length ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-slate-700">
              <Sparkles size={18} className="text-brand-500" />
              <p className="text-sm font-medium">All subjects submitted — ready to finalize.</p>
            </div>
            <Button onClick={handleGenerateFinal} disabled={finalizing}>
              {finalizing ? 'Generating...' : 'Generate Final Result'}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Final result cannot be generated yet. {session.subjects.length - submittedCount} subject
            {session.subjects.length - submittedCount === 1 ? '' : 's'} still pending.
          </p>
        )}
      </Card>

      <Modal
        open={!!inspecting}
        onClose={() => setInspecting(null)}
        title={inspecting ? `${inspecting.name} — Submitted Marks` : ''}
        footer={
          submissionDetail && !editMode ? (
            <>
              {submissionDetail.status !== 'LOCKED' && (
                <Button variant="secondary" onClick={handleReopen} disabled={actionBusy}>Reopen</Button>
              )}
              <Button variant="secondary" onClick={toggleLock} disabled={actionBusy}>
                {submissionDetail.status === 'LOCKED' ? (<><Unlock size={14} /> Unlock</>) : (<><Lock size={14} /> Lock</>)}
              </Button>
              {submissionDetail.status !== 'LOCKED' && (
                <Button onClick={enterEditMode} disabled={actionBusy}><Pencil size={14} /> Edit Marks</Button>
              )}
            </>
          ) : editMode ? (
            <>
              <Button variant="secondary" onClick={() => setEditMode(false)} disabled={actionBusy}>Cancel</Button>
              <Button onClick={saveEdit} disabled={actionBusy}>{actionBusy ? 'Saving...' : 'Save Changes'}</Button>
            </>
          ) : null
        }
      >
        {loadingDetail ? (
          <Skeleton className="h-48 w-full" />
        ) : !submissionDetail ? null : editMode ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Total Marks" type="number" value={editTotal} onChange={(e) => setEditTotal(e.target.value)} />
              <Input label="Passing Marks" type="number" value={editPassing} onChange={(e) => setEditPassing(e.target.value)} />
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {submissionDetail.rows.map((r) => (
                <div key={r.rollNumber} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{r.name}</p>
                    <p className="text-xs text-slate-400">Roll {r.rollNumber}</p>
                  </div>
                  <Input
                    type="number" min={0} max={editTotal} className="w-24"
                    value={editMarks[r.rollNumber] ?? ''}
                    onChange={(e) => setEditMarks({ ...editMarks, [r.rollNumber]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
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
        )}
      </Modal>
    </div>
  );
}
