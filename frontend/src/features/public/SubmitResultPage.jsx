import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2, Clock } from 'lucide-react';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { publicApi } from '../../api/publicApi';
import { useDebounce } from '../../hooks/useDebounce';
import { loadDraft, saveDraft, clearDraft, draftHasContent } from '../../utils/submissionDraft';

// Public, unauthenticated flow for ONE SUBJECT'S link:
// Enter Link/Code -> Verify (subject + roster in one call, no subject
// picker -- the link already determines the subject) -> Enter Marks ->
// Review -> Submit -> Success. Mobile-first throughout.
export default function SubmitResultPage() {
  const [searchParams] = useSearchParams();
  const [stage, setStage] = useState('code'); // code | marks | review | success
  const [code, setCode] = useState(searchParams.get('code') || '');
  const [verifying, setVerifying] = useState(false);

  const [sessionInfo, setSessionInfo] = useState(null);
  const [subject, setSubject] = useState(null);
  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState({});
  const [totalMarks, setTotalMarks] = useState(0);
  const [passingMarks, setPassingMarks] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Local-only autosave -- see utils/submissionDraft.js. Not shown until
  // we've checked for an existing draft, so autosave never fires before
  // that check and silently overwrites it with blank state.
  const [pendingDraft, setPendingDraft] = useState(null); // draft awaiting Restore/Discard choice
  const [draftReady, setDraftReady] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const debouncedSnapshot = useDebounce({ marks, totalMarks, passingMarks }, 1200);

  useEffect(() => {
    if (searchParams.get('code')) handleVerify(searchParams.get('code'));
  }, []); // eslint-disable-line

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
      setStudents(data.students);
      setTotalMarks(data.subject.totalMarks);
      setPassingMarks(data.subject.passingMarks);
      setMarks({});
      setCode(value);

      const draft = loadDraft(value);
      if (draftHasContent(draft)) {
        setPendingDraft(draft);
      } else {
        setDraftReady(true); // safe to start autosaving right away
      }
      setStage('marks');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid or inactive submission link');
    } finally {
      setVerifying(false);
    }
  }

  function restoreDraft() {
    setMarks(pendingDraft.marks || {});
    if (pendingDraft.totalMarks !== undefined) setTotalMarks(pendingDraft.totalMarks);
    if (pendingDraft.passingMarks !== undefined) setPassingMarks(pendingDraft.passingMarks);
    setPendingDraft(null);
    setDraftReady(true);
    toast.success('Restored your unsaved marks');
  }

  function discardDraft() {
    clearDraft(code);
    setPendingDraft(null);
    setDraftReady(true);
  }

  // Debounced autosave -- fires while entering or reviewing marks, never
  // before the restore/discard choice has been made for an existing draft.
  useEffect(() => {
    if (!draftReady || stage === 'code' || stage === 'success') return;
    if (Object.values(debouncedSnapshot.marks).every((v) => v === undefined || v === '')) return; // nothing worth saving yet
    saveDraft(code, debouncedSnapshot);
    setLastSavedAt(new Date());
  }, [debouncedSnapshot, draftReady, stage]); // eslint-disable-line react-hooks/exhaustive-deps

  function goToReview() {
    const missing = students.filter((s) => marks[s.rollNumber] === undefined || marks[s.rollNumber] === '');
    if (missing.length > 0) {
      toast.error(`Enter marks for all ${students.length} students before continuing`);
      return;
    }
    if (passingMarks > totalMarks) {
      toast.error('Passing marks cannot exceed total marks');
      return;
    }
    setStage('review');
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await publicApi.submit(code, {
        totalMarks: subject.allowSubmitterConfig ? Number(totalMarks) : undefined,
        passingMarks: subject.allowSubmitterConfig ? Number(passingMarks) : undefined,
        marks: students.map((s) => ({ rollNumber: s.rollNumber, obtained: Number(marks[s.rollNumber]) || 0 })),
      });
      clearDraft(code);
      setStage('success');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-slate-800">Submit Result</h1>
        </div>

        {stage === 'code' && (
          <Card className="space-y-4">
            <p className="text-sm text-slate-600">
              Enter the submission link code you were given. This link is for one specific subject only.
            </p>
            <Input
              placeholder="RES-XXXXXX"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="text-center text-lg tracking-widest"
            />
            <Button className="w-full" onClick={() => handleVerify()} disabled={verifying}>
              {verifying ? 'Verifying...' : 'Continue'}
            </Button>
          </Card>
        )}

        {stage === 'marks' && sessionInfo && subject && (
          <Card className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-slate-500">{sessionInfo.schoolInfo?.name}</p>
              <p className="font-semibold text-slate-800">{sessionInfo.examName || sessionInfo.examType}</p>
              <p className="text-sm text-slate-500">
                Class {sessionInfo.class}{sessionInfo.section ? ` - ${sessionInfo.section}` : ''}
              </p>
              <p className="mt-2 text-lg font-bold uppercase tracking-wide text-brand-700">{subject.name} Result</p>
            </div>

            {pendingDraft && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <span>You have unsaved marks from earlier for this subject.</span>
                <div className="flex gap-2">
                  <button onClick={discardDraft} className="font-medium underline">Discard</button>
                  <button onClick={restoreDraft} className="font-medium underline">Restore</button>
                </div>
              </div>
            )}

            {subject.allowSubmitterConfig ? (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Total Marks" type="number" value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} />
                <Input label="Passing Marks" type="number" value={passingMarks} onChange={(e) => setPassingMarks(e.target.value)} />
              </div>
            ) : (
              <p className="text-center text-sm text-slate-500">Total Marks: {totalMarks} • Passing Marks: {passingMarks}</p>
            )}

            <div className="max-h-96 space-y-2 overflow-y-auto">
              {students.map((s) => (
                <div key={s.rollNumber} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{s.name}</p>
                    <p className="text-xs text-slate-400">Roll {s.rollNumber}</p>
                  </div>
                  <Input
                    type="number" min={0} max={totalMarks}
                    className="w-24"
                    value={marks[s.rollNumber] || ''}
                    onChange={(e) => setMarks({ ...marks, [s.rollNumber]: e.target.value })}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2">
              {lastSavedAt ? (
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock size={12} /> Saved on this device {lastSavedAt.toLocaleTimeString()}
                </span>
              ) : <span />}
            </div>

            <Button className="w-full" onClick={goToReview}>Continue to Review</Button>
          </Card>
        )}

        {stage === 'review' && subject && (
          <Card className="space-y-4">
            <p className="text-sm text-slate-600">
              You are about to submit <strong>{subject.name}</strong> marks for <strong>{students.length}</strong>{' '}
              students. Please verify all marks before submitting — this cannot be changed by you afterward.
            </p>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="px-3 py-2">Roll</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Marks</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.rollNumber} className="border-b border-slate-100">
                      <td className="px-3 py-1.5">{s.rollNumber}</td>
                      <td className="px-3 py-1.5">{s.name}</td>
                      <td className="px-3 py-1.5">{marks[s.rollNumber]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setStage('marks')} disabled={submitting}>Back</Button>
              <Button className="flex-1" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Subject Result'}
              </Button>
            </div>
          </Card>
        )}

        {stage === 'success' && (
          <Card className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 size={40} className="text-emerald-500" />
            <p className="font-semibold text-slate-800">Submitted successfully</p>
            <p className="text-sm text-slate-500">{subject?.name} marks have been recorded.</p>
            <p className="text-xs text-slate-400">This link has now been used and can't be submitted again.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
