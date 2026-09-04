import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Clock } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import { calculatePreview } from '../../utils/resultMath';
import { resultsApi } from '../../api/resultsApi';
import { classProfilesApi } from '../../api/classProfilesApi';
import { draftsApi } from '../../api/draftsApi';
import { useDebounce } from '../../hooks/useDebounce';

const STEPS = ['Basic Information', 'Subjects', 'Student Marks', 'Review & Generate'];
const EXAM_TYPES = ['Monthly Test', 'Mid Term', 'Final Term', 'Annual Examination', 'Pre-Board', 'Board Preparation', 'Other'];
const emptyBasicInfo = {
  schoolName: '', schoolAddress: '', schoolPhone: '',
  class: '', section: '', academicYear: '', examType: 'Monthly Test',
  examName: '', resultDate: '', totalStrength: 1,
};

export default function CreateResultWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [basicInfo, setBasicInfo] = useState(emptyBasicInfo);
  const [subjects, setSubjects] = useState([{ name: '', totalMarks: 100, passingMarks: 40 }]);
  const [students, setStudents] = useState([]);

  // ---- Feature: remembered class setup ("load previous setup") ----
  const [recentProfiles, setRecentProfiles] = useState([]);
  const [matchedProfile, setMatchedProfile] = useState(null);
  const debouncedClass = useDebounce(basicInfo.class, 600);
  const debouncedSection = useDebounce(basicInfo.section, 600);

  useEffect(() => {
    classProfilesApi.recent().then(({ data }) => setRecentProfiles(data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!debouncedClass) {
      setMatchedProfile(null);
      return;
    }
    classProfilesApi
      .lookup(debouncedClass, debouncedSection)
      .then(({ data }) => setMatchedProfile(data.profile))
      .catch(() => setMatchedProfile(null));
  }, [debouncedClass, debouncedSection]);

  function applyProfile(profile) {
    setBasicInfo((prev) => ({
      ...prev,
      class: profile.class,
      section: profile.section || '',
      schoolName: profile.schoolInfo?.name || prev.schoolName,
      schoolAddress: profile.schoolInfo?.address || prev.schoolAddress,
      schoolPhone: profile.schoolInfo?.phone || prev.schoolPhone,
      totalStrength: profile.students.length || prev.totalStrength,
    }));
    setSubjects(profile.subjects.length ? profile.subjects : subjects);
    // Roster carries over -- roll numbers, names, father names -- but marks
    // always start blank since this is a new exam.
    setStudents(profile.students.map((s) => ({ rollNumber: s.rollNumber, name: s.name, fatherName: s.fatherName, marks: {} })));
    setMatchedProfile(null);
    toast.success(`Loaded previous setup for Class ${profile.class}${profile.section ? ' - ' + profile.section : ''}`);
  }

  // ---- Feature: autosave / resume draft ----
  const [resumeDraft, setResumeDraft] = useState(null);
  const [draftChecked, setDraftChecked] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const skipNextAutosave = useRef(false);

  useEffect(() => {
    draftsApi
      .get()
      .then(({ data }) => {
        if (data.draft && (data.draft.basicInfo?.class || data.draft.subjects?.length)) {
          setResumeDraft(data.draft);
        }
      })
      .finally(() => setDraftChecked(true));
  }, []);

  const debouncedSnapshot = useDebounce({ step, basicInfo, subjects, students }, 1500);
  useEffect(() => {
    if (!draftChecked) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    if (!basicInfo.class && subjects.every((s) => !s.name) && students.length === 0) return;
    draftsApi
      .save(debouncedSnapshot)
      .then(() => setLastSavedAt(new Date()))
      .catch(() => {});
  }, [debouncedSnapshot, draftChecked]); // eslint-disable-line react-hooks/exhaustive-deps

  function resumeFromDraft() {
    skipNextAutosave.current = true;
    if (resumeDraft.basicInfo) setBasicInfo({ ...emptyBasicInfo, ...resumeDraft.basicInfo });
    if (resumeDraft.subjects?.length) setSubjects(resumeDraft.subjects);
    if (resumeDraft.students?.length) setStudents(resumeDraft.students);
    setStep(resumeDraft.step || 0);
    setResumeDraft(null);
    toast.success('Resumed your unfinished result');
  }

  async function discardDraft() {
    skipNextAutosave.current = true;
    try {
      await draftsApi.discard();
    } catch {
      // ignore -- worst case a stale draft lingers until the next overwrite
    }
    setResumeDraft(null);
  }

  async function startFreshFromModal() {
    await discardDraft();
    setBasicInfo(emptyBasicInfo);
    setSubjects([{ name: '', totalMarks: 100, passingMarks: 40 }]);
    setStudents([]);
  }

  function goNext() {
    if (step === 2) {
      const strength = Number(basicInfo.totalStrength) || 0;
      if (students.length !== strength) {
        toast.error(`Configured strength is ${strength}. Please enter exactly that many students.`);
        return;
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function syncStudentRows(strength) {
    setStudents((prev) => {
      const next = [...prev];
      while (next.length < strength) next.push({ rollNumber: '', name: '', fatherName: '', marks: {} });
      while (next.length > strength) next.pop();
      return next;
    });
  }

  const preview = calculatePreview(subjects.filter((s) => s.name), students);

  async function handleGenerate() {
    setSubmitting(true);
    try {
      const payload = {
        schoolInfo: {
          name: basicInfo.schoolName, address: basicInfo.schoolAddress, phone: basicInfo.schoolPhone,
        },
        class: basicInfo.class,
        section: basicInfo.section,
        academicYear: basicInfo.academicYear,
        examType: basicInfo.examType,
        examName: basicInfo.examName,
        resultDate: basicInfo.resultDate,
        totalStrength: Number(basicInfo.totalStrength),
        subjects: subjects.map((s) => ({ name: s.name, totalMarks: Number(s.totalMarks), passingMarks: Number(s.passingMarks) })),
        students: students.map((s) => ({
          rollNumber: s.rollNumber,
          name: s.name,
          fatherName: s.fatherName,
          marks: subjects.map((subj) => ({ subject: subj.name, obtained: Number(s.marks[subj.name]) || 0 })),
        })),
      };
      const { data } = await resultsApi.create(payload);
      skipNextAutosave.current = true;
      toast.success('Result generated successfully');
      navigate(`/results/${data.result._id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate result');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-800">Create New Result</h1>
        <div className="flex items-center gap-3">
          {lastSavedAt && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Clock size={12} /> Draft saved {lastSavedAt.toLocaleTimeString()}
            </span>
          )}
          {(basicInfo.class || subjects.some((s) => s.name) || students.length > 0) && (
            <button onClick={startFreshFromModal} className="text-xs font-medium text-slate-400 underline hover:text-slate-600">
              Discard draft &amp; start over
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, idx) => (
          <div
            key={label}
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
              idx === step ? 'bg-brand-600 text-white' : idx < step ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {idx + 1}. {label}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          {recentProfiles.length > 0 && (
            <Card className="bg-slate-50">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Recent Classes</p>
              <div className="flex flex-wrap gap-2">
                {recentProfiles.map((p) => (
                  <button
                    key={`${p.class}-${p.section}`}
                    onClick={() => classProfilesApi.lookup(p.class, p.section).then(({ data }) => data.profile && applyProfile(data.profile))}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-brand-400 hover:text-brand-700"
                  >
                    Class {p.class}{p.section ? ` - ${p.section}` : ''} - {p.subjectCount} subjects - {p.studentCount} students
                  </button>
                ))}
              </div>
            </Card>
          )}

          {matchedProfile && (
            <Card className="border-brand-200 bg-brand-50">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-brand-800">
                  Found a previous setup for Class {matchedProfile.class}{matchedProfile.section ? ` - ${matchedProfile.section}` : ''} --{' '}
                  {matchedProfile.subjects.length} subjects, {matchedProfile.students.length} students.
                </p>
                <Button onClick={() => applyProfile(matchedProfile)}>Load it</Button>
              </div>
            </Card>
          )}

          <Card className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="School Name" value={basicInfo.schoolName} onChange={(e) => setBasicInfo({ ...basicInfo, schoolName: e.target.value })} />
              <Input label="School Address (optional)" value={basicInfo.schoolAddress} onChange={(e) => setBasicInfo({ ...basicInfo, schoolAddress: e.target.value })} />
              <Input label="Class" required value={basicInfo.class} onChange={(e) => setBasicInfo({ ...basicInfo, class: e.target.value })} />
              <Input label="Section" value={basicInfo.section} onChange={(e) => setBasicInfo({ ...basicInfo, section: e.target.value })} />
              <Input label="Academic Year" required placeholder="2025-2026" value={basicInfo.academicYear} onChange={(e) => setBasicInfo({ ...basicInfo, academicYear: e.target.value })} />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700">Exam Type</label>
                <select
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={basicInfo.examType}
                  onChange={(e) => setBasicInfo({ ...basicInfo, examType: e.target.value })}
                >
                  {EXAM_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <Input label="Exam Name (optional)" value={basicInfo.examName} onChange={(e) => setBasicInfo({ ...basicInfo, examName: e.target.value })} />
              <Input label="Result Date" type="date" required value={basicInfo.resultDate} onChange={(e) => setBasicInfo({ ...basicInfo, resultDate: e.target.value })} />
              <Input
                label="Total Student Strength" type="number" min={1} required
                value={basicInfo.totalStrength}
                onChange={(e) => {
                  setBasicInfo({ ...basicInfo, totalStrength: e.target.value });
                  syncStudentRows(Number(e.target.value) || 0);
                }}
              />
            </div>
          </Card>
        </div>
      )}

      {step === 1 && (
        <Card className="space-y-4">
          {subjects.map((subj, idx) => (
            <div key={idx} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <Input placeholder="Subject Name" value={subj.name}
                onChange={(e) => setSubjects(subjects.map((s, i) => i === idx ? { ...s, name: e.target.value } : s))} />
              <Input placeholder="Total Marks" type="number" value={subj.totalMarks}
                onChange={(e) => setSubjects(subjects.map((s, i) => i === idx ? { ...s, totalMarks: e.target.value } : s))} />
              <Input placeholder="Passing Marks" type="number" value={subj.passingMarks}
                onChange={(e) => setSubjects(subjects.map((s, i) => i === idx ? { ...s, passingMarks: e.target.value } : s))} />
              <Button variant="danger" type="button" onClick={() => setSubjects(subjects.filter((_, i) => i !== idx))} disabled={subjects.length === 1}>
                Remove
              </Button>
            </div>
          ))}
          <Button variant="secondary" type="button" onClick={() => setSubjects([...subjects, { name: '', totalMarks: 100, passingMarks: 40 }])}>
            + Add Subject
          </Button>
          <p className="text-sm text-slate-500">
            Total Maximum Marks: <strong>{subjects.reduce((s, subj) => s + (Number(subj.totalMarks) || 0), 0)}</strong>
          </p>
        </Card>
      )}

      {step === 2 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="sticky top-0 bg-white py-2 pr-3">Roll No</th>
                <th className="sticky top-0 bg-white py-2 pr-3">Name</th>
                <th className="sticky top-0 bg-white py-2 pr-3">Father Name</th>
                {subjects.filter((s) => s.name).map((s) => (
                  <th key={s.name} className="sticky top-0 bg-white py-2 pr-3">{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((student, idx) => (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="py-1.5 pr-3"><Input value={student.rollNumber} onChange={(e) => setStudents(students.map((s, i) => i === idx ? { ...s, rollNumber: e.target.value } : s))} /></td>
                  <td className="py-1.5 pr-3"><Input value={student.name} onChange={(e) => setStudents(students.map((s, i) => i === idx ? { ...s, name: e.target.value } : s))} /></td>
                  <td className="py-1.5 pr-3"><Input value={student.fatherName} onChange={(e) => setStudents(students.map((s, i) => i === idx ? { ...s, fatherName: e.target.value } : s))} /></td>
                  {subjects.filter((s) => s.name).map((subj) => (
                    <td key={subj.name} className="py-1.5 pr-3">
                      <Input type="number" min={0} max={subj.totalMarks} value={student.marks[subj.name] || ''}
                        onChange={(e) => setStudents(students.map((s, i) => i === idx ? { ...s, marks: { ...s.marks, [subj.name]: e.target.value } } : s))} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {students.length === 0 && <p className="py-4 text-sm text-slate-500">Set the student strength in Step 1 first.</p>}
        </Card>
      )}

      {step === 3 && (
        <Card className="overflow-x-auto">
          <p className="mb-3 text-sm text-slate-500">Review the calculated preview below, then generate the final result.</p>
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3">Pos</th>
                <th className="py-2 pr-3">Roll No</th>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Total</th>
                <th className="py-2 pr-3">%</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((s) => (
                <tr key={s.rollNumber} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{s.position}</td>
                  <td className="py-2 pr-3">{s.rollNumber}</td>
                  <td className="py-2 pr-3">{s.name}</td>
                  <td className="py-2 pr-3">{s.totalObtained}/{s.totalMax}</td>
                  <td className="py-2 pr-3">{s.percentage}%</td>
                  <td className="py-2 pr-3"><StatusBadge status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="secondary" type="button" onClick={goBack} disabled={step === 0}>Back</Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={goNext}>Next</Button>
        ) : (
          <Button type="button" onClick={handleGenerate} disabled={submitting}>
            {submitting ? 'Generating...' : 'Generate Result'}
          </Button>
        )}
      </div>

      <Modal
        open={!!resumeDraft}
        onClose={discardDraft}
        title="Resume unfinished result?"
        footer={
          <>
            <Button variant="secondary" onClick={discardDraft}>Start Fresh</Button>
            <Button onClick={resumeFromDraft}>Resume</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          You have an unfinished result{resumeDraft?.basicInfo?.class ? ` for Class ${resumeDraft.basicInfo.class}${resumeDraft.basicInfo.section ? ' - ' + resumeDraft.basicInfo.section : ''}` : ''}.
          Would you like to pick up where you left off?
        </p>
      </Modal>
    </div>
  );
}
