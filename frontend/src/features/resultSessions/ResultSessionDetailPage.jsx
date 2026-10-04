import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  Lock,
  Pencil,
  RefreshCw,
  Share2,
  Sparkles,
  Trash2,
  Unlock,
} from 'lucide-react';
import { resultSessionsApi } from '../../api/resultSessionsApi';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Skeleton from '../../components/ui/Skeleton';
import Modal from '../../components/ui/Modal';
import ProgressBar from '../../components/ui/ProgressBar';
import StatusBadge from '../../components/ui/StatusBadge';
import PermanentDeleteModal from '../../components/ui/PermanentDeleteModal';

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
      // user cancelled share sheet
    }
  } else {
    copy(url, 'Link');
  }
}

export default function ResultSessionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState(null);

  // Subject accordion / collapse state
  const [expandedSubjects, setExpandedSubjects] = useState({});

  // Inspection modal state
  const [inspectingSubject, setInspectingSubject] = useState(null);
  const [inspectingClass, setInspectingClass] = useState(null);
  const [submissionDetail, setSubmissionDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editMarks, setEditMarks] = useState({});
  const [editTotal, setEditTotal] = useState(100);
  const [editPassing, setEditPassing] = useState(40);
  const [actionBusy, setActionBusy] = useState(false);

  // Reopen confirmation modal
  const [reopeningTarget, setReopeningTarget] = useState(null); // { subject, classSub }

  // Finalization state
  const [finalizingClassId, setFinalizingClassId] = useState(null);

  // Permanent Delete Modal state
  const [deleteModalState, setDeleteModalState] = useState({
    open: false,
    isEntireExam: false,
    targetClass: null,
  });
  const [deleteBusy, setDeleteBusy] = useState(false);

  function load() {
    resultSessionsApi.get(id).then(({ data }) => {
      setSession(data.session);
      // Auto-expand all subjects by default for immediate visibility
      if (data.session?.subjects) {
        const expanded = {};
        data.session.subjects.forEach((s) => {
          expanded[s._id] = true;
        });
        setExpandedSubjects(expanded);
      }
    });
  }

  useEffect(load, [id]); // eslint-disable-line

  function toggleSubjectExpand(subjectId) {
    setExpandedSubjects((prev) => ({ ...prev, [subjectId]: !prev[subjectId] }));
  }

  async function handleActivate() {
    setBusy(true);
    try {
      const { data } = await resultSessionsApi.activate(id);
      setSession(data.session);
      toast.success('Result submission is active. One link per subject has been generated.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to activate');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivateAll() {
    if (!window.confirm('Turn off submission for every pending subject? Already-submitted subjects are unaffected.'))
      return;
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
    if (
      !window.confirm(
        `Generate a new link for ${name}? The old link will stop working immediately. Existing submitted marks remain safe.`
      )
    )
      return;
    return withRowBusy(subjectId, async () => {
      await resultSessionsApi.regenerateSubjectToken(id, subjectId);
      toast.success('New link generated');
    });
  };

  // Inspect submitted marks for a specific class
  async function openClassMarks(subject, classSub) {
    setInspectingSubject(subject);
    setInspectingClass(classSub);
    setEditMode(false);
    setLoadingDetail(true);
    setSubmissionDetail(null);
    try {
      const { data } = await resultSessionsApi.getSubjectSubmission(id, subject._id, classSub.classId);
      setSubmissionDetail(data.submission);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load submitted marks');
      setInspectingSubject(null);
      setInspectingClass(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  function enterEditMode() {
    const marksMap = {};
    submissionDetail.rows.forEach((r) => {
      marksMap[r.rollNumber] = r.obtained;
    });
    setEditMarks(marksMap);
    setEditTotal(submissionDetail.totalMarks);
    setEditPassing(submissionDetail.passingMarks);
    setEditMode(true);
  }

  async function saveEdit() {
    setActionBusy(true);
    try {
      await resultSessionsApi.editSubjectSubmission(
        id,
        inspectingSubject._id,
        {
          totalMarks: Number(editTotal),
          passingMarks: Number(editPassing),
          marks: submissionDetail.rows.map((r) => ({
            rollNumber: r.rollNumber,
            obtained: Number(editMarks[r.rollNumber]) || 0,
          })),
        },
        inspectingClass.classId
      );
      toast.success('Marks updated');
      setEditMode(false);
      openClassMarks(inspectingSubject, inspectingClass);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update marks');
    } finally {
      setActionBusy(false);
    }
  }

  async function toggleLock() {
    setActionBusy(true);
    try {
      const action =
        submissionDetail.status === 'LOCKED' ? resultSessionsApi.unlockSubject : resultSessionsApi.lockSubject;
      await action(id, inspectingSubject._id, inspectingClass.classId);
      toast.success(submissionDetail.status === 'LOCKED' ? 'Class unlocked' : 'Class locked');
      openClassMarks(inspectingSubject, inspectingClass);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setActionBusy(false);
    }
  }

  // REOPEN CLASS RESULTS
  function promptReopen(subject, classSub) {
    setReopeningTarget({ subject, classSub });
  }

  async function confirmReopen() {
    if (!reopeningTarget) return;
    const { subject, classSub } = reopeningTarget;
    setActionBusy(true);
    try {
      await resultSessionsApi.reopenSubject(id, subject._id, classSub.classId);
      toast.success(`${classSub.className} ${subject.name} results reopened. The same link can now be used again.`);
      setReopeningTarget(null);
      if (inspectingSubject) {
        setInspectingSubject(null);
        setInspectingClass(null);
      }
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reopen class');
    } finally {
      setActionBusy(false);
    }
  }

  // GENERATE FINAL RESULT FOR A CLASS
  async function handleGenerateFinalClass(targetClass) {
    if (
      !window.confirm(
        `Generate official final result for ${targetClass.name}? Marks for all subjects will be locked into calculated rankings.`
      )
    )
      return;
    setFinalizingClassId(targetClass._id);
    try {
      const { data } = await resultSessionsApi.generateClassFinal(id, targetClass._id);
      toast.success(`Final result for ${targetClass.name} generated!`);
      load();
      navigate(`/results/${data.result._id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate final result');
    } finally {
      setFinalizingClassId(null);
    }
  }

  // PERMANENT DELETION HANDLERS
  function promptDeleteClass(c) {
    setDeleteModalState({
      open: true,
      isEntireExam: false,
      targetClass: c,
    });
  }

  function promptDeleteEntireExam() {
    setDeleteModalState({
      open: true,
      isEntireExam: true,
      targetClass: null,
    });
  }

  async function executePermanentDeletion() {
    setDeleteBusy(true);
    try {
      if (deleteModalState.isEntireExam) {
        await resultSessionsApi.deleteEntireExamPermanently(id);
        toast.success('Entire exam and associated result data permanently deleted');
        navigate('/result-sessions');
      } else {
        const c = deleteModalState.targetClass;
        await resultSessionsApi.deleteClassResultPermanently(id, c._id);
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

  const everActivated = session.subjects.some((s) => s.linkStatus !== null);
  const examClasses = session.classes || [{ _id: session._id, name: session.class }];
  const allFinalized = examClasses.length > 0 && examClasses.every((c) => !!c.finalResultId);

  return (
    <div className="space-y-6">
      {/* HEADER CARD */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                Multi-Class Exam
              </span>
              {session.submissionStatus === 'ACTIVE' ? (
                <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  🟢 Submission Active
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  🔴 Submission Off
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-800">{session.examName || session.examType}</h1>
            <p className="text-xs text-slate-500 mt-1">
              {session.academicYear} • Exam Date: {new Date(session.resultDate).toLocaleDateString()}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="sm" onClick={promptDeleteEntireExam}>
              <Trash2 size={14} /> Delete Exam
            </Button>
          </div>
        </div>

        {/* Classes In This Exam */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Participating Classes ({examClasses.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {examClasses.map((c) => {
              const classStudents = session.students.filter(
                (s) =>
                  (s.classId && s.classId.toString() === c._id.toString()) ||
                  (s.class && s.class === c.name)
              );
              return (
                <div
                  key={c._id}
                  className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700"
                >
                  <span className="font-bold text-slate-800">{c.name}</span>
                  {c.section && <span className="text-slate-400">({c.section})</span>}
                  <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] text-slate-600">
                    {classStudents.length} students
                  </span>
                  {c.finalResultId && (
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-700">
                      ✓ Finalized
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Overview Stats */}
        <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl bg-slate-50/80 p-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-slate-500">Classes</p>
            <p className="font-bold text-slate-800">{examClasses.length}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Total Students</p>
            <p className="font-bold text-slate-800">{session.students.length}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Total Subjects</p>
            <p className="font-bold text-slate-800">{session.subjects.length}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Complete Subjects</p>
            <p className="font-bold text-emerald-600">
              {session.subjects.filter((s) => s.submitted).length} / {session.subjects.length}
            </p>
          </div>
        </div>
      </Card>

      {/* ACTIVATION TOOLBAR */}
      {!allFinalized && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {everActivated ? 'Subject Submission Links Active' : 'Generate Secure Submission Links'}
            </p>
            <p className="text-xs text-slate-500">
              {everActivated
                ? 'One link exists per subject, handling all classes selected for this exam.'
                : 'Generates one unified submission link per subject that covers all classes.'}
            </p>
          </div>
          <div>
            {session.submissionStatus === 'ACTIVE' ? (
              <Button variant="danger" size="sm" onClick={handleDeactivateAll} disabled={busy}>
                Turn Off Pending Links
              </Button>
            ) : (
              <Button size="sm" onClick={handleActivate} disabled={busy}>
                {everActivated ? 'Turn On Submission' : 'Generate Subject Links'}
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* SUBJECT SUBMISSION LINKS WITH PER-CLASS PROGRESS (REQUIREMENTS 7 & 8) */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-800">Subject Submission Links</h2>
            <p className="text-xs text-slate-500">
              Share the single link for each subject. Submitter will choose which class to submit.
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500">
            {session.subjects.filter((s) => s.submitted).length} of {session.subjects.length} Subjects Complete
          </span>
        </div>

        <div className="space-y-4">
          {session.subjects.map((subj) => {
            const isExpanded = expandedSubjects[subj._id] ?? true;
            const isComplete = subj.submitted;
            const submittedCount = subj.classesSubmitted || 0;
            const totalClassesCount = subj.totalClasses || examClasses.length;
            const percent = totalClassesCount > 0 ? Math.round((submittedCount / totalClassesCount) * 100) : 0;
            const isRowBusy = rowBusy === subj._id;

            return (
              <div
                key={subj._id}
                className={`rounded-xl border transition-all ${
                  isComplete
                    ? 'border-emerald-200 bg-white shadow-2xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                {/* Subject Header */}
                <div className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-800">{subj.name}</h3>
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

                  {/* Progress bar across classes */}
                  <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        isComplete ? 'bg-emerald-500' : 'bg-brand-500'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  {/* Single Subject Submission Link Bar */}
                  {subj.submissionToken && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 border border-slate-100">
                      <span className="text-xs font-semibold text-slate-500">Unified Link:</span>
                      <code className="rounded bg-white px-2 py-0.5 text-xs font-mono font-bold text-slate-800 border border-slate-200">
                        {subj.submissionToken}
                      </code>
                      <button
                        onClick={() => copy(subj.submissionToken, 'Code')}
                        className="text-slate-400 hover:text-slate-700 text-xs inline-flex items-center gap-0.5"
                        title="Copy Token"
                      >
                        <Copy size={13} /> Copy Code
                      </button>
                      <button
                        onClick={() => copy(submissionUrl(subj.submissionToken), 'Link')}
                        className="text-xs font-semibold text-brand-600 hover:underline inline-flex items-center gap-0.5"
                      >
                        Copy URL
                      </button>
                      <button
                        onClick={() => shareLink(subj.name, subj.submissionToken)}
                        className="text-xs font-semibold text-brand-600 hover:underline inline-flex items-center gap-0.5"
                      >
                        <Share2 size={12} /> Share
                      </button>
                      <button
                        onClick={() => handleRegenerate(subj._id, subj.name)}
                        disabled={isRowBusy}
                        className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-0.5"
                        title="Regenerate this link (old link stops working immediately)"
                      >
                        <RefreshCw size={12} /> New Link
                      </button>
                      {subj.linkStatus === 'DISABLED' ? (
                        <button
                          onClick={() => handleEnable(subj._id)}
                          disabled={isRowBusy}
                          className="text-xs font-semibold text-emerald-600 hover:underline"
                        >
                          Re-enable
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDisable(subj._id)}
                          disabled={isRowBusy}
                          className="text-xs font-semibold text-red-500 hover:underline"
                        >
                          Disable
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Per-Class Breakdown (Requirement 7) */}
                {isExpanded && subj.classSubmissions && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Class Submission Status for {subj.name}
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {subj.classSubmissions.map((cs) => {
                        const isSub = cs.status === 'SUBMITTED' || cs.status === 'LOCKED';
                        return (
                          <div
                            key={cs.classId}
                            className={`flex items-center justify-between rounded-lg border p-3 ${
                              isSub
                                ? 'border-emerald-200 bg-emerald-50/40 text-emerald-900'
                                : 'border-slate-200 bg-white text-slate-700'
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-sm">{cs.className}</span>
                                {cs.section && <span className="text-xs text-slate-400">({cs.section})</span>}
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {isSub
                                  ? `✓ Submitted (${cs.submittedCount || cs.studentCount}/${cs.studentCount} students)`
                                  : `⏳ Pending (0/${cs.studentCount} students)`}
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
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => promptReopen(subj, cs)}
                                    title="Reopen submission for this class only"
                                  >
                                    Reopen
                                  </Button>
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

      {/* CLASS-WISE RESULTS & FINALIZATION (REQUIREMENTS 17 & 18) */}
      <Card className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">Class Results & Finalization</h2>
          <p className="text-xs text-slate-500">
            Results are calculated independently for each class. A class can be finalized once all its subjects are submitted.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {examClasses.map((c) => {
            const isFinalized = !!c.finalResultId;
            // Check which subjects are submitted for this class
            const pendingForThisClass = session.subjects.filter((subj) => {
              const cs = (subj.classSubmissions || []).find(
                (sub) => sub.classId?.toString() === c._id.toString() || sub.className === c.name
              );
              return !cs || (cs.status !== 'SUBMITTED' && cs.status !== 'LOCKED');
            });
            const isReady = pendingForThisClass.length === 0;

            return (
              <div
                key={c._id}
                className={`rounded-xl border p-4 space-y-3 transition-all ${
                  isFinalized
                    ? 'border-emerald-200 bg-emerald-50/30'
                    : isReady
                    ? 'border-brand-200 bg-brand-50/20'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-base text-slate-800">{c.name}</h3>
                    <p className="text-xs text-slate-500">
                      {session.subjects.length - pendingForThisClass.length} of {session.subjects.length}{' '}
                      Subjects Collected
                    </p>
                  </div>
                  {isFinalized ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                      ✓ Finalized
                    </span>
                  ) : isReady ? (
                    <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-800">
                      ✓ Ready to Finalize
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                      ⏳ Pending Subjects
                    </span>
                  )}
                </div>

                {!isFinalized && !isReady && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
                    <p className="font-semibold">⚠ Cannot Finalize Yet</p>
                    <p className="mt-0.5 text-[11px]">
                      Pending subjects: {pendingForThisClass.map((s) => s.name).join(', ')}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {isFinalized ? (
                    <Button
                      size="sm"
                      onClick={() => navigate(`/results/${c.finalResultId}`)}
                      className="w-full sm:w-auto"
                    >
                      <ExternalLink size={14} /> View {c.name} Result
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={!isReady || finalizingClassId === c._id}
                      onClick={() => handleGenerateFinalClass(c)}
                      className="w-full sm:w-auto"
                    >
                      <Sparkles size={14} />{' '}
                      {finalizingClassId === c._id ? 'Calculating...' : `Generate ${c.name} Final Result`}
                    </Button>
                  )}

                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => promptDeleteClass(c)}
                    className="ml-auto"
                    title={`Permanently delete ${c.name} result data`}
                  >
                    <Trash2 size={13} /> Delete {c.name}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* INSPECT & EDIT MARKS MODAL (PER CLASS) */}
      <Modal
        open={!!inspectingSubject}
        onClose={() => {
          setInspectingSubject(null);
          setInspectingClass(null);
        }}
        title={
          inspectingSubject && inspectingClass
            ? `${inspectingSubject.name} — ${inspectingClass.className} Marks`
            : ''
        }
        footer={
          submissionDetail && !editMode ? (
            <>
              {submissionDetail.status !== 'LOCKED' && (
                <Button
                  variant="secondary"
                  onClick={() => promptReopen(inspectingSubject, inspectingClass)}
                  disabled={actionBusy}
                >
                  Reopen This Class
                </Button>
              )}
              <Button variant="secondary" onClick={toggleLock} disabled={actionBusy}>
                {submissionDetail.status === 'LOCKED' ? (
                  <>
                    <Unlock size={14} /> Unlock
                  </>
                ) : (
                  <>
                    <Lock size={14} /> Lock
                  </>
                )}
              </Button>
              {submissionDetail.status !== 'LOCKED' && (
                <Button onClick={enterEditMode} disabled={actionBusy}>
                  <Pencil size={14} /> Edit Marks
                </Button>
              )}
            </>
          ) : editMode ? (
            <>
              <Button variant="secondary" onClick={() => setEditMode(false)} disabled={actionBusy}>
                Cancel
              </Button>
              <Button onClick={saveEdit} disabled={actionBusy}>
                {actionBusy ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          ) : null
        }
      >
        {loadingDetail ? (
          <Skeleton className="h-48 w-full" />
        ) : !submissionDetail ? null : editMode ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Total Marks"
                type="number"
                value={editTotal}
                onChange={(e) => setEditTotal(e.target.value)}
              />
              <Input
                label="Passing Marks"
                type="number"
                value={editPassing}
                onChange={(e) => setEditPassing(e.target.value)}
              />
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {submissionDetail.rows.map((r) => (
                <div key={r.rollNumber} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{r.name}</p>
                    <p className="text-xs text-slate-400">Roll {r.rollNumber}</p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={editTotal}
                    className="w-24 text-center font-bold"
                    value={editMarks[r.rollNumber] ?? ''}
                    onChange={(e) => setEditMarks({ ...editMarks, [r.rollNumber]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                Class: <strong>{submissionDetail.className}</strong> • Submitted{' '}
                {submissionDetail.submittedAt ? new Date(submissionDetail.submittedAt).toLocaleString() : 'N/A'}{' '}
                via {submissionDetail.submittedVia === 'public' ? 'link submitter' : 'teacher'}
              </span>
              {submissionDetail.status === 'LOCKED' && (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Lock size={11} /> Locked
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
        )}
      </Modal>

      {/* REOPEN CONFIRMATION MODAL (REQUIREMENT 14) */}
      <Modal
        open={!!reopeningTarget}
        onClose={() => setReopeningTarget(null)}
        title="Reopen Results?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReopeningTarget(null)} disabled={actionBusy}>
              Cancel
            </Button>
            <Button onClick={confirmReopen} disabled={actionBusy}>
              {actionBusy ? 'Reopening...' : 'Reopen Results'}
            </Button>
          </>
        }
      >
        {reopeningTarget && (
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              Reopen <strong>{reopeningTarget.classSub.className}</strong> marks for{' '}
              <strong>{reopeningTarget.subject.name}</strong>?
            </p>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              This will clear the submitted marks for {reopeningTarget.classSub.className} and allow the submitter
              to edit and resubmit using the same link. Other classes will remain completely unaffected.
            </div>
          </div>
        )}
      </Modal>

      {/* STRONG PERMANENT DELETION MODAL (REQUIREMENTS 19, 20, 21, 22) */}
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
