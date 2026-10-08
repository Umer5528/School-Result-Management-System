import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2, ChevronDown, ChevronUp, Clock, Copy, Lock, RefreshCw, Share2, Trash2 } from 'lucide-react';
import { teachersApi } from '../../api/teachersApi';
import { resultSessionsApi } from '../../api/resultSessionsApi';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';
import Modal from '../../components/ui/Modal';
import ProgressBar from '../../components/ui/ProgressBar';
import StatusBadge from '../../components/ui/StatusBadge';
import PermanentDeleteModal from '../../components/ui/PermanentDeleteModal';

function submissionUrl(token) {
  return `${window.location.origin}/submit/${token}`;
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
    } catch {}
  } else {
    copy(url, 'Link');
  }
}

export default function AdminResultSessionDetailPage() {
  const { id, sessionId } = useParams(); // id = teacher's user id
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const canManage = user?.role === 'super_admin' || hasPermission('MANAGE_RESULTS');

  const [session, setSession] = useState(null);
  const [rowBusy, setRowBusy] = useState(null);
  const [expandedSubjects, setExpandedSubjects] = useState({});

  const [inspectingSubject, setInspectingSubject] = useState(null);
  const [inspectingClass, setInspectingClass] = useState(null);
  const [submissionDetail, setSubmissionDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [reopenTarget, setReopenTarget] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [deleteModalState, setDeleteModalState] = useState({
    open: false,
    isEntireExam: false,
    targetClass: null,
  });
  const [deleteBusy, setDeleteBusy] = useState(false);

  function load() {
    teachersApi.getResultSession(id, sessionId).then(({ data }) => {
      setSession(data.session);
      if (data.session?.subjects) {
        const exp = {};
        data.session.subjects.forEach((s) => {
          exp[s._id] = true;
        });
        setExpandedSubjects(exp);
      }
    });
  }

  useEffect(load, [id, sessionId]); // eslint-disable-line

  function toggleSubjectExpand(subjectId) {
    setExpandedSubjects((prev) => ({ ...prev, [subjectId]: !prev[subjectId] }));
  }

  async function openClassMarks(subject, classSub) {
    setInspectingSubject(subject);
    setInspectingClass(classSub);
    setLoadingDetail(true);
    setSubmissionDetail(null);
    try {
      const { data } = await teachersApi.getSubjectSubmission(id, sessionId, subject._id, classSub.classId);
      setSubmissionDetail(data.submission);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load submission');
      setInspectingSubject(null);
      setInspectingClass(null);
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

  async function handleEnable(subjectId) {
    setRowBusy(subjectId);
    try {
      await teachersApi.enableSubjectLink(id, sessionId, subjectId);
      toast.success('Link re-enabled');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to re-enable link');
    } finally {
      setRowBusy(null);
    }
  }

  async function handleRegenerate(subjectId, name) {
    if (
      !window.confirm(
        `Generate a new link for ${name}? The old link will stop working immediately. Existing submitted marks remain safe.`
      )
    )
      return;
    setRowBusy(subjectId);
    try {
      await teachersApi.regenerateSubjectToken(id, sessionId, subjectId);
      toast.success('New link generated');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to regenerate link');
    } finally {
      setRowBusy(null);
    }
  }

  function promptReopen(subject, classSub) {
    setReopenTarget({ subject, classSub });
  }

  async function confirmReopen() {
    if (!reopenTarget) return;
    setActionBusy(true);
    try {
      await teachersApi.reopenSubjectSubmission(
        id,
        sessionId,
        reopenTarget.subject._id,
        reopenTarget.classSub.classId
      );
      toast.success(`${reopenTarget.classSub.className} reopened`);
      setReopenTarget(null);
      if (inspectingSubject) {
        setInspectingSubject(null);
        setInspectingClass(null);
      }
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reopen');
    } finally {
      setActionBusy(false);
    }
  }

  async function executePermanentDeletion() {
    setDeleteBusy(true);
    try {
      if (deleteModalState.isEntireExam) {
        await resultSessionsApi.deleteEntireExamPermanently(sessionId);
        toast.success('Entire exam and associated result data permanently deleted');
        navigate(`/teachers/${id}`);
      } else {
        const c = deleteModalState.targetClass;
        await resultSessionsApi.deleteClassResultPermanently(sessionId, c._id);
        toast.success(`${c.name} result data permanently deleted`);
        setDeleteModalState({ open: false, isEntireExam: false, targetClass: null });
        load();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to permanently delete');
    } finally {
      setDeleteBusy(false);
    }
  }

  if (!session) return <Skeleton className="h-64 w-full" />;

  const examClasses = session.classes || [{ _id: session._id, name: session.class }];

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                Teacher Exam Session
              </span>
              {session.submissionStatus === 'ACTIVE' ? (
                <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  🟢 Active
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  🔴 Off
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-800">{session.examName || session.examType}</h1>
            <p className="text-xs text-slate-500 mt-1">
              Academic Year: {session.academicYear} • Exam Date:{' '}
              {new Date(session.resultDate).toLocaleDateString()} • Created by {session.teacherNameSnapshot}
            </p>
          </div>

          {canManage && (
            <div className="flex gap-2">
              <Button
                variant="danger"
                size="sm"
                onClick={() =>
                  setDeleteModalState({ open: true, isEntireExam: true, targetClass: null })
                }
              >
                <Trash2 size={14} /> Delete Exam
              </Button>
            </div>
          )}
        </div>

        {/* Participating Classes */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Participating Classes ({examClasses.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {examClasses.map((c) => (
              <div
                key={c._id}
                className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700"
              >
                <span className="font-bold text-slate-800">{c.name}</span>
                {c.section && <span className="text-slate-400">({c.section})</span>}
                {c.finalResultId && (
                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-700">
                    Finalized
                  </span>
                )}
                {canManage && (
                  <button
                    onClick={() =>
                      setDeleteModalState({ open: true, isEntireExam: false, targetClass: c })
                    }
                    className="ml-1 text-slate-400 hover:text-red-500"
                    title={`Delete ${c.name} result data`}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-slate-500">Classes</p>
            <p className="font-bold">{examClasses.length}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Students</p>
            <p className="font-bold">{session.students.length}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Subjects</p>
            <p className="font-bold">{session.subjects.length}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Complete Subjects</p>
            <p className="font-bold text-emerald-600">
              {session.subjects.filter((s) => s.submitted).length} / {session.subjects.length}
            </p>
          </div>
        </div>
      </Card>

      {/* SUBJECT MONITORING AND PER-CLASS BREAKDOWN */}
      <Card className="space-y-4">
        <h2 className="text-base font-bold text-slate-800">Subject Submissions & Progress</h2>

        <div className="space-y-4">
          {session.subjects.map((subj) => {
            const isExpanded = expandedSubjects[subj._id] ?? true;
            const isComplete = subj.submitted;
            const submittedCount = subj.classesSubmitted || 0;
            const totalClassesCount = subj.totalClasses || examClasses.length;
            const percent = totalClassesCount > 0 ? Math.round((submittedCount / totalClassesCount) * 100) : 0;
            const isBusy = rowBusy === subj._id;

            return (
              <div
                key={subj._id}
                className={`rounded-xl border ${
                  isComplete ? 'border-emerald-200 bg-white' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-slate-800">{subj.name}</h3>
                        {subj.linkStatus === 'DISABLED' ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                            Disabled
                          </span>
                        ) : isComplete ? (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 size={12} /> Complete
                          </span>
                        ) : submittedCount > 0 ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 flex items-center gap-1">
                            <Clock size={12} /> In Progress ({submittedCount}/{totalClassesCount})
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                            Pending (0/{totalClassesCount})
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Total Marks: {subj.totalMarks} • Pass: {subj.passingMarks} •{' '}
                        <strong>
                          {submittedCount} / {totalClassesCount} Classes Submitted ({percent}%)
                        </strong>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleSubjectExpand(subj._id)}
                      className="text-slate-400 hover:text-slate-700 p-1"
                    >
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>

                  <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        isComplete ? 'bg-emerald-500' : 'bg-brand-500'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  {subj.submissionToken && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 border border-slate-100 text-xs">
                      <span className="font-semibold text-slate-500">Unified Link:</span>
                      <code className="rounded bg-white px-2 py-0.5 font-mono font-bold text-slate-800 border border-slate-200">
                        {subj.submissionToken}
                      </code>
                      <button
                        onClick={() => copy(subj.submissionToken, 'Token')}
                        className="text-slate-400 hover:text-slate-700 flex items-center gap-0.5"
                      >
                        <Copy size={12} /> Copy Code
                      </button>
                      <button
                        onClick={() => copy(submissionUrl(subj.submissionToken), 'Link URL')}
                        className="font-semibold text-brand-600 hover:underline flex items-center gap-0.5"
                      >
                        Copy URL
                      </button>
                      <button
                        onClick={() => shareLink(subj.name, subj.submissionToken)}
                        className="font-semibold text-brand-600 hover:underline flex items-center gap-0.5"
                      >
                        <Share2 size={12} /> Share
                      </button>
                      {canManage && (
                        <button
                          onClick={() => handleRegenerate(subj._id, subj.name)}
                          disabled={rowBusy === subj._id}
                          className="text-slate-500 hover:text-slate-800 flex items-center gap-0.5"
                          title="Generate a new secure token for this subject"
                        >
                          <RefreshCw size={12} /> New Link
                        </button>
                      )}
                      {canManage && (
                        subj.linkStatus === 'DISABLED' ? (
                          <button
                            onClick={() => handleEnable(subj._id)}
                            disabled={rowBusy === subj._id}
                            className="ml-auto font-semibold text-emerald-600 hover:underline"
                          >
                            Re-enable
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDisable(subj._id)}
                            disabled={rowBusy === subj._id}
                            className="ml-auto font-semibold text-red-500 hover:underline"
                          >
                            Disable Link
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>

                {/* Per-Class breakdown */}
                {isExpanded && subj.classSubmissions && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Class Submissions
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {subj.classSubmissions.map((cs) => {
                        const isSub = cs.status === 'SUBMITTED' || cs.status === 'LOCKED';
                        return (
                          <div
                            key={cs.classId}
                            className={`flex items-center justify-between rounded-lg border p-3 ${
                              isSub ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
                            }`}
                          >
                            <div>
                              <p className="font-bold text-sm text-slate-800">
                                {cs.className} {cs.section ? `(${cs.section})` : ''}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {isSub
                                  ? `✓ Submitted (${cs.submittedCount || cs.studentCount}/${cs.studentCount})`
                                  : `⏳ Pending (0/${cs.studentCount})`}
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {isSub ? (
                                <>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => openClassMarks(subj, cs)}
                                  >
                                    View Marks
                                  </Button>
                                  {canManage && (
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => promptReopen(subj, cs)}
                                    >
                                      Reopen
                                    </Button>
                                  )}
                                </>
                              ) : (
                                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                  Pending
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* INSPECT SUBMISSION MODAL */}
      <Modal
        open={!!inspectingSubject}
        onClose={() => {
          setInspectingSubject(null);
          setInspectingClass(null);
        }}
        title={
          inspectingSubject && inspectingClass
            ? `${inspectingSubject.name} — ${inspectingClass.className} Submitted Marks`
            : ''
        }
        footer={
          canManage && inspectingClass && submissionDetail?.status !== 'LOCKED' ? (
            <Button
              variant="secondary"
              onClick={() => promptReopen(inspectingSubject, inspectingClass)}
              disabled={actionBusy}
            >
              Reopen This Class
            </Button>
          ) : null
        }
      >
        {loadingDetail ? (
          <Skeleton className="h-48 w-full" />
        ) : submissionDetail ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                Class: <strong>{submissionDetail.className}</strong> • Submitted{' '}
                {submissionDetail.submittedAt ? new Date(submissionDetail.submittedAt).toLocaleString() : 'N/A'}{' '}
                via {submissionDetail.submittedVia === 'public' ? 'link' : 'teacher'}
              </span>
              {submissionDetail.status === 'LOCKED' && (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Lock size={10} /> Locked
                </span>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="px-3 py-2">Roll</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Marks</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {submissionDetail.rows.map((r) => (
                    <tr key={r.rollNumber}>
                      <td className="px-3 py-1.5 font-mono text-xs text-slate-600">{r.rollNumber}</td>
                      <td className="px-3 py-1.5 font-medium text-slate-800">{r.name}</td>
                      <td className="px-3 py-1.5 font-bold text-slate-700">
                        {r.obtained}/{r.totalMarks}
                      </td>
                      <td className="px-3 py-1.5">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* REOPEN CONFIRM MODAL */}
      <Modal
        open={!!reopenTarget}
        onClose={() => setReopenTarget(null)}
        title="Reopen Class Submission?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReopenTarget(null)} disabled={actionBusy}>
              Cancel
            </Button>
            <Button onClick={confirmReopen} disabled={actionBusy}>
              {actionBusy ? 'Reopening...' : 'Reopen Class Results'}
            </Button>
          </>
        }
      >
        {reopenTarget && (
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              Reopen <strong>{reopenTarget.classSub.className}</strong> marks for{' '}
              <strong>{reopenTarget.subject.name}</strong>?
            </p>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              This will clear the marks for {reopenTarget.classSub.className} and allow the submitter to resubmit.
              Other classes will remain untouched.
            </div>
          </div>
        )}
      </Modal>

      {/* PERMANENT DELETION MODAL */}
      <PermanentDeleteModal
        open={deleteModalState.open}
        onClose={() => setDeleteModalState({ open: false, isEntireExam: false, targetClass: null })}
        onConfirm={executePermanentDeletion}
        title={
          deleteModalState.isEntireExam
            ? 'Delete Entire Examination Permanently?'
            : `Delete ${deleteModalState.targetClass?.name} Result Permanently?`
        }
        examName={session.examName || session.examType}
        targetName={
          deleteModalState.isEntireExam
            ? 'Entire Examination (All Classes)'
            : deleteModalState.targetClass?.name
        }
        targetLabel={deleteModalState.isEntireExam ? 'Scope' : 'Class'}
        isEntireExam={deleteModalState.isEntireExam}
        busy={deleteBusy}
      />
    </div>
  );
}
