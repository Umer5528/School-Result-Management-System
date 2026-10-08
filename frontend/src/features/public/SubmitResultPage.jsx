import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  GraduationCap,
  Lock,
  Sparkles,
} from 'lucide-react';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { publicApi } from '../../api/publicApi';
import { useDebounce } from '../../hooks/useDebounce';
import { loadDraft, saveDraft, clearDraft, draftHasContent } from '../../utils/submissionDraft';

export default function SubmitResultPage() {
  const { token: routeToken } = useParams();
  const [searchParams] = useSearchParams();
  const initialCode = (routeToken || searchParams.get('code') || '').toUpperCase();
  // stages: 'code' | 'classes' | 'marks' | 'review' | 'success' | 'already_submitted'
  const [stage, setStage] = useState('code');
  const [code, setCode] = useState(initialCode);
  const [verifying, setVerifying] = useState(false);

  // Link metadata
  const [sessionInfo, setSessionInfo] = useState(null);
  const [subject, setSubject] = useState(null);
  const [classes, setClasses] = useState([]);

  // Active class submission state
  const [selectedClass, setSelectedClass] = useState(null);
  const [classAlreadySubmittedInfo, setClassAlreadySubmittedInfo] = useState(null);
  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState({});
  const [totalMarks, setTotalMarks] = useState(100);
  const [passingMarks, setPassingMarks] = useState(40);
  const [submitting, setSubmitting] = useState(false);
  const [loadingClass, setLoadingClass] = useState(false);

  // Success summary
  const [successInfo, setSuccessInfo] = useState(null);

  // Draft autosave
  const [pendingDraft, setPendingDraft] = useState(null);
  const [draftReady, setDraftReady] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const debouncedSnapshot = useDebounce({ marks, totalMarks, passingMarks }, 1200);

  const draftKey = `${code}_${selectedClass?._id || 'default'}`;

  useEffect(() => {
    const codeToVerify = routeToken || searchParams.get('code');
    if (codeToVerify) handleVerify(codeToVerify);
  }, [routeToken]); // eslint-disable-line

  async function handleVerify(providedCode) {
    const value = (providedCode || code).trim().toUpperCase();
    if (!value) {
      toast.error('Enter a submission link code');
      return;
    }
    setVerifying(true);
    try {
      const { data } = await publicApi.getSubmissionInfo(value);
      setSessionInfo(data.session);
      setSubject(data.subject);
      setClasses(data.classes || []);
      setCode(value);
      setStage('classes');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid or inactive submission link');
    } finally {
      setVerifying(false);
    }
  }

  // Refresh class statuses from server
  async function refreshClasses(preserveStage = false) {
    try {
      const { data } = await publicApi.getSubmissionInfo(code);
      setSessionInfo(data.session);
      setSubject(data.subject);
      setClasses(data.classes || []);
      if (!preserveStage) setStage('classes');
    } catch {
      // silent refresh fail
    }
  }

  async function handleSelectClass(cls) {
    const classId = cls.classId || cls._id;
    setSelectedClass({ ...cls, _id: classId });
    setLoadingClass(true);
    try {
      const { data } = await publicApi.getClassRoster(code, classId);

      if (data.alreadySubmitted) {
        setClassAlreadySubmittedInfo({
          className: cls.displayName || cls.name,
          submittedAt: data.submittedAt,
        });
        setStage('already_submitted');
        return;
      }

      setStudents(data.students || []);
      setTotalMarks(data.subject.totalMarks);
      setPassingMarks(data.subject.passingMarks);
      setMarks({});

      const draft = loadDraft(`${code}_${cls._id}`);
      if (draftHasContent(draft)) {
        setPendingDraft(draft);
      } else {
        setDraftReady(true);
      }

      setStage('marks');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load class roster');
    } finally {
      setLoadingClass(false);
    }
  }

  function restoreDraft() {
    if (!pendingDraft) return;
    setMarks(pendingDraft.marks || {});
    if (pendingDraft.totalMarks !== undefined) setTotalMarks(pendingDraft.totalMarks);
    if (pendingDraft.passingMarks !== undefined) setPassingMarks(pendingDraft.passingMarks);
    setPendingDraft(null);
    setDraftReady(true);
    toast.success('Restored your unsaved marks for this class');
  }

  function discardDraft() {
    clearDraft(draftKey);
    setPendingDraft(null);
    setDraftReady(true);
  }

  // Autosave marks per class
  useEffect(() => {
    if (!draftReady || stage !== 'marks') return;
    if (Object.values(debouncedSnapshot.marks).every((v) => v === undefined || v === '')) return;
    saveDraft(draftKey, debouncedSnapshot);
    setLastSavedAt(new Date());
  }, [debouncedSnapshot, draftReady, stage, draftKey]);

  function goToReview() {
    const missing = students.filter(
      (s) => marks[s.rollNumber] === undefined || marks[s.rollNumber] === ''
    );
    if (missing.length > 0) {
      toast.error(`Enter marks for all ${students.length} students before continuing`);
      return;
    }
    for (const s of students) {
      const val = Number(marks[s.rollNumber]);
      if (isNaN(val) || val < 0 || val > totalMarks) {
        toast.error(`Marks for roll ${s.rollNumber} must be between 0 and ${totalMarks}`);
        return;
      }
    }
    if (passingMarks > totalMarks) {
      toast.error('Passing marks cannot exceed total marks');
      return;
    }
    setStage('review');
  }

  async function handleSubmitMarks() {
    setSubmitting(true);
    try {
      const marksPayload = students.map((s) => ({
        rollNumber: s.rollNumber,
        obtained: Number(marks[s.rollNumber]),
      }));

      const { data } = await publicApi.submitClassMarks(code, selectedClass._id, {
        totalMarks: subject.allowSubmitterConfig ? Number(totalMarks) : undefined,
        passingMarks: subject.allowSubmitterConfig ? Number(passingMarks) : undefined,
        marks: marksPayload,
      });

      clearDraft(draftKey);

      setSuccessInfo({
        className: data.className || selectedClass.displayName || selectedClass.name,
        remainingClassesCount: data.remainingClassesCount,
        nextClass: data.nextClass,
        isAllClassesSubmitted: data.isAllClassesSubmitted,
      });

      // Update local classes status
      setClasses((prev) =>
        prev.map((c) =>
          (c._id === selectedClass._id || c.classId === selectedClass._id)
            ? { ...c, status: 'SUBMITTED', submittedAt: new Date().toISOString() }
            : c
        )
      );

      setStage('success');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  const allSubmitted =
    classes.length > 0 && classes.every((c) => c.status === 'SUBMITTED' || c.status === 'LOCKED');

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100/70 p-4">
      <div className="w-full max-w-lg">
        {/* Header School / Brand */}
        <div className="mb-4 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-2xs border border-slate-200 text-xs font-semibold text-brand-700 mb-2">
            <GraduationCap size={15} /> School Result Portal
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">
            {subject ? `${subject.name} Result Submission` : 'Result Submission'}
          </h1>
          {sessionInfo && (
            <p className="text-xs text-slate-500 mt-0.5">
              {sessionInfo.schoolInfo?.name || 'School Examination'} •{' '}
              {sessionInfo.examName || sessionInfo.examType}
              {sessionInfo.academicYear ? ` | ${sessionInfo.academicYear}` : ''}
            </p>
          )}
        </div>

        {/* STAGE: CODE INPUT */}
        {stage === 'code' && (
          <Card className="space-y-4">
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-slate-800">Enter Secure Submission Link Code</p>
              <p className="text-xs text-slate-500">
                Enter the subject submission code provided by your administrator.
              </p>
            </div>
            <Input
              placeholder="RES-XXXXXX"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="text-center text-lg font-mono tracking-widest font-bold"
              autoFocus
            />
            <Button className="w-full" onClick={() => handleVerify()} disabled={verifying}>
              {verifying ? 'Verifying...' : 'Access Submission Portal'}
            </Button>
          </Card>
        )}

        {/* STAGE: DYNAMIC CLASS SELECTION */}
        {stage === 'classes' && sessionInfo && subject && (
          <Card className="space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                    {subject.name}
                  </span>
                  <h2 className="text-base font-bold text-slate-800">Select Class/Group to Enter Marks</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {classes.filter((c) => c.status === 'SUBMITTED' || c.status === 'LOCKED').length} /{' '}
                  {classes.length} Submitted
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                This secure link handles {subject.name} marks for authorized classes/groups participating in this exam.
                Select a class/group to proceed:
              </p>
            </div>

            {/* All Complete Banner */}
            {allSubmitted && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-emerald-800 text-xs font-medium">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>All class results for {subject.name} have been submitted successfully.</span>
              </div>
            )}

            {/* List of Classes */}
            <div className="space-y-2.5">
              {classes.map((cls) => {
                const isSubmitted = cls.status === 'SUBMITTED' || cls.status === 'LOCKED';
                const classLabel = cls.displayName || (cls.group ? `${cls.name} ${cls.group}` : cls.name);
                return (
                  <button
                    key={cls._id || cls.classId}
                    type="button"
                    disabled={loadingClass}
                    onClick={() => handleSelectClass(cls)}
                    className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all ${
                      isSubmitted
                        ? 'border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50/70'
                        : 'border-slate-200 bg-white hover:border-brand-500 hover:shadow-sm ring-1 ring-transparent hover:ring-brand-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-slate-800">{classLabel}</span>
                        {cls.section && !classLabel.includes(cls.section) && (
                          <span className="text-xs font-semibold text-slate-500">
                            (Sec {cls.section})
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {cls.studentCount || 0} students enrolled
                        {cls.submittedAt &&
                          ` • Submitted ${new Date(cls.submittedAt).toLocaleDateString()}`}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {isSubmitted ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                          <CheckCircle2 size={14} className="text-emerald-600" /> Submitted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                          <Clock size={14} className="text-amber-600" /> Pending
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 text-center">
              <p className="text-xs text-slate-400">
                Total Marks: {subject.totalMarks} • Passing Marks: {subject.passingMarks}
              </p>
            </div>
          </Card>
        )}

        {/* STAGE: ALREADY SUBMITTED NOTICE */}
        {stage === 'already_submitted' && classAlreadySubmittedInfo && (
          <Card className="space-y-5 py-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 size={32} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">✓ Already Submitted</h2>
              <p className="mt-1 text-sm text-slate-600">
                <strong>{classAlreadySubmittedInfo.className}</strong> {subject?.name} results were
                submitted successfully.
              </p>
              {classAlreadySubmittedInfo.submittedAt && (
                <p className="mt-2 text-xs text-slate-400">
                  Submitted on:{' '}
                  <strong>
                    {new Date(classAlreadySubmittedInfo.submittedAt).toLocaleString('en-US', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </strong>
                </p>
              )}
            </div>

            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              <Lock size={14} className="inline mr-1 text-slate-400" />
              This class is currently locked to prevent accidental overwrite. If edits are required,
              please contact the administrator to reopen this class.
            </div>

            <Button
              className="w-full"
              variant="secondary"
              onClick={() => {
                refreshClasses();
              }}
            >
              <ArrowLeft size={16} /> Back to Classes
            </Button>
          </Card>
        )}

        {/* STAGE: MARKS ENTRY FOR SELECTED CLASS */}
        {stage === 'marks' && selectedClass && subject && (
          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <button
                  type="button"
                  onClick={() => refreshClasses()}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 mb-1"
                >
                  <ArrowLeft size={13} /> Back to Class List
                </button>
                <h2 className="text-base font-bold text-slate-800">
                  {selectedClass.displayName || (selectedClass.group ? `${selectedClass.name} ${selectedClass.group}` : selectedClass.name)} — {subject.name} Marks
                </h2>
                <p className="text-xs text-slate-500">
                  {students.length} students • Total Marks: {totalMarks} • Pass: {passingMarks}
                </p>
              </div>
              <span className="rounded-md bg-brand-50 px-2 py-1 text-xs font-bold text-brand-700 border border-brand-200">
                {selectedClass.displayName || (selectedClass.group ? `${selectedClass.name} ${selectedClass.group}` : selectedClass.name)}
              </span>
            </div>

            {/* Unsaved draft prompt */}
            {pendingDraft && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span>You have unsaved marks from earlier for {selectedClass.displayName || selectedClass.name}.</span>
                <div className="flex gap-2">
                  <button onClick={discardDraft} className="font-semibold underline">
                    Discard
                  </button>
                  <button onClick={restoreDraft} className="font-semibold underline">
                    Restore
                  </button>
                </div>
              </div>
            )}

            {/* Allow Submitter Config if allowed */}
            {subject.allowSubmitterConfig && (
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3">
                <Input
                  label="Total Marks"
                  type="number"
                  value={totalMarks}
                  onChange={(e) => setTotalMarks(e.target.value)}
                />
                <Input
                  label="Passing Marks"
                  type="number"
                  value={passingMarks}
                  onChange={(e) => setPassingMarks(e.target.value)}
                />
              </div>
            )}

            {/* Student marks roster */}
            <div className="max-h-96 space-y-2 overflow-y-auto divide-y divide-slate-100 pr-1">
              {students.map((s) => (
                <div key={s.rollNumber} className="flex items-center gap-3 pt-2">
                  <span className="shrink-0 w-14 rounded bg-slate-100 px-1.5 py-1 font-mono text-xs font-bold text-slate-700 text-center">
                    {s.rollNumber}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{s.name}</p>
                    {s.fatherName && <p className="text-xs text-slate-400">s/o {s.fatherName}</p>}
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      min={0}
                      max={totalMarks}
                      placeholder="Marks"
                      className="text-center font-semibold"
                      value={marks[s.rollNumber] ?? ''}
                      onChange={(e) => setMarks({ ...marks, [s.rollNumber]: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-400">
              {lastSavedAt ? (
                <span className="flex items-center gap-1">
                  <Clock size={12} /> Autosaved at {lastSavedAt.toLocaleTimeString()}
                </span>
              ) : (
                <span />
              )}
              <span>
                {Object.keys(marks).filter((k) => marks[k] !== '' && marks[k] !== undefined).length} /{' '}
                {students.length} filled
              </span>
            </div>

            <Button className="w-full" onClick={goToReview}>
              Continue to Review {selectedClass.displayName || selectedClass.name} Marks
            </Button>
          </Card>
        )}

        {/* STAGE: REVIEW BEFORE SUBMIT */}
        {stage === 'review' && selectedClass && subject && (
          <Card className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Review {selectedClass.displayName || selectedClass.name} {subject.name} Marks
              </h2>
              <p className="text-xs text-slate-500">
                Please verify all marks before submitting. Once submitted, this class will be locked.
              </p>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="px-3 py-2">Roll</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2 text-right">Obtained Marks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((s) => (
                    <tr key={s.rollNumber} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5 font-mono text-xs font-medium text-slate-600">
                        {s.rollNumber}
                      </td>
                      <td className="px-3 py-1.5 font-medium text-slate-800">{s.name}</td>
                      <td className="px-3 py-1.5 text-right font-bold text-brand-700">
                        {marks[s.rollNumber]}/{totalMarks}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setStage('marks')}
                disabled={submitting}
              >
                Back to Edit
              </Button>
              <Button className="flex-1" onClick={handleSubmitMarks} disabled={submitting}>
                {submitting ? 'Submitting...' : `Submit ${selectedClass.displayName || selectedClass.name} Results`}
              </Button>
            </div>
          </Card>
        )}

        {/* STAGE: SUCCESS & REMAINING CLASSES PROMPT */}
        {stage === 'success' && successInfo && (
          <Card className="space-y-6 py-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 size={36} />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-slate-800">
                ✓ {successInfo.className} {subject?.name} Results Submitted
              </h2>
              <p className="text-sm text-slate-600">
                Your results for {successInfo.className} have been successfully saved and recorded.
              </p>
            </div>

            {/* Remaining classes status */}
            {successInfo.remainingClassesCount > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-left space-y-2">
                <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                  <Clock size={16} />
                  <span>
                    There {successInfo.remainingClassesCount === 1 ? 'is' : 'are'} still{' '}
                    {successInfo.remainingClassesCount} class
                    {successInfo.remainingClassesCount === 1 ? '' : 'es'} remaining for {subject?.name}.
                  </span>
                </div>
                <p className="text-xs text-amber-700">
                  You do NOT need a new link. You can submit marks for the remaining classes right now
                  using this same link.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-emerald-800 text-sm font-semibold flex items-center justify-center gap-2">
                <Sparkles size={18} className="text-emerald-600" />
                All class results for {subject?.name} have now been submitted!
              </div>
            )}

            <div className="space-y-2 pt-2">
              {successInfo.remainingClassesCount > 0 && successInfo.nextClass && (
                <Button
                  className="w-full"
                  onClick={() => {
                    handleSelectClass(successInfo.nextClass);
                  }}
                >
                  Submit {successInfo.nextClass.displayName || successInfo.nextClass.name} Results Now
                </Button>
              )}
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  refreshClasses();
                }}
              >
                Back to Classes
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
