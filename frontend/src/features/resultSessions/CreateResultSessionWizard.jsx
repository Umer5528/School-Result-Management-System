import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { studentsApi } from '../../api/studentsApi';
import { resultSessionsApi } from '../../api/resultSessionsApi';

const STEPS = ['Exam Details', 'Select Students', 'Subjects', 'Review & Activate'];
const EXAM_TYPES = ['Monthly Test', 'Mid Term', 'Final Term', 'Annual Examination', 'Pre-Board', 'Board Preparation', 'Other'];

export default function CreateResultSessionWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [examDetails, setExamDetails] = useState({
    examName: '', examType: 'Monthly Test', resultDate: '', academicYear: '',
    class: '', section: '', schoolName: '', schoolAddress: '', schoolPhone: '',
  });

  const [roster, setRoster] = useState([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [rosterSearch, setRosterSearch] = useState('');

  const [subjects, setSubjects] = useState([{ name: '', totalMarks: 100, passingMarks: 40, allowSubmitterConfig: false }]);

  function loadRoster() {
    if (!examDetails.class) return;
    setLoadingRoster(true);
    studentsApi
      .list({ class: examDetails.class, section: examDetails.section, academicYear: examDetails.academicYear, active: true, limit: 500 })
      .then(({ data }) => setRoster(data.items))
      .finally(() => setLoadingRoster(false));
  }

  useEffect(() => {
    if (step === 1) loadRoster();
  }, [step]); // eslint-disable-line

  function toggleStudent(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelectedIds(new Set(filteredRoster.map((s) => s._id)));
  }
  function deselectAll() {
    setSelectedIds(new Set());
  }

  const filteredRoster = roster.filter((s) => {
    if (!rosterSearch) return true;
    const q = rosterSearch.toLowerCase();
    return s.name.toLowerCase().includes(q) || String(s.rollNumber).toLowerCase().includes(q);
  });

  function goNext() {
    if (step === 0) {
      if (!examDetails.class || !examDetails.academicYear || !examDetails.examType || !examDetails.resultDate) {
        toast.error('Please fill in Class, Academic Year, Exam Type and Result Date');
        return;
      }
    }
    if (step === 1 && selectedIds.size === 0) {
      toast.error('Select at least one student');
      return;
    }
    if (step === 2 && subjects.every((s) => !s.name)) {
      toast.error('Add at least one subject');
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleCreateAndActivate() {
    setSubmitting(true);
    try {
      const { data } = await resultSessionsApi.create({
        examName: examDetails.examName,
        examType: examDetails.examType,
        resultDate: examDetails.resultDate,
        academicYear: examDetails.academicYear,
        class: examDetails.class,
        section: examDetails.section,
        schoolInfo: { name: examDetails.schoolName, address: examDetails.schoolAddress, phone: examDetails.schoolPhone },
        studentIds: [...selectedIds],
        subjects: subjects
          .filter((s) => s.name)
          .map((s) => ({ ...s, totalMarks: Number(s.totalMarks), passingMarks: Number(s.passingMarks) })),
      });
      toast.success('Result session created');
      navigate(`/result-sessions/${data.session._id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create result session');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">New Result Session</h1>

      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, idx) => (
          <div
            key={label}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              idx === step ? 'bg-brand-600 text-white' : idx < step ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {idx + 1}. {label}
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Exam Name (optional)" value={examDetails.examName} onChange={(e) => setExamDetails({ ...examDetails, examName: e.target.value })} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Exam Type</label>
            <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={examDetails.examType}
              onChange={(e) => setExamDetails({ ...examDetails, examType: e.target.value })}>
              {EXAM_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <Input label="Result Date" type="date" required value={examDetails.resultDate} onChange={(e) => setExamDetails({ ...examDetails, resultDate: e.target.value })} />
          <Input label="Academic Year" required value={examDetails.academicYear} onChange={(e) => setExamDetails({ ...examDetails, academicYear: e.target.value })} />
          <Input label="Class" required value={examDetails.class} onChange={(e) => setExamDetails({ ...examDetails, class: e.target.value })} />
          <Input label="Section" value={examDetails.section} onChange={(e) => setExamDetails({ ...examDetails, section: e.target.value })} />
          <Input label="School Name (optional)" value={examDetails.schoolName} onChange={(e) => setExamDetails({ ...examDetails, schoolName: e.target.value })} />
          <Input label="School Address (optional)" value={examDetails.schoolAddress} onChange={(e) => setExamDetails({ ...examDetails, schoolAddress: e.target.value })} />
        </Card>
      )}

      {step === 1 && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-500">
              {loadingRoster ? 'Loading roster...' : `${filteredRoster.length} students in Class ${examDetails.class}${examDetails.section ? ' - ' + examDetails.section : ''}`}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={selectAll}>Select All</Button>
              <Button variant="secondary" onClick={deselectAll}>Deselect All</Button>
            </div>
          </div>
          <Input placeholder="Search students" value={rosterSearch} onChange={(e) => setRosterSearch(e.target.value)} className="mb-3" />
          {roster.length === 0 && !loadingRoster && (
            <p className="text-sm text-slate-500">
              No students found for this class/section/year. Add students on the Students page first.
            </p>
          )}
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {filteredRoster.map((s) => (
              <label key={s._id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                <input type="checkbox" checked={selectedIds.has(s._id)} onChange={() => toggleStudent(s._id)} className="shrink-0" />
                <span className="shrink-0 text-sm text-slate-500">{s.rollNumber}</span>
                <span className="truncate text-sm font-medium text-slate-800">{s.name}</span>
              </label>
            ))}
          </div>
          <p className="mt-3 text-sm font-medium text-slate-700">{selectedIds.size} selected</p>
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-4">
          {subjects.map((subj, idx) => (
            <div key={idx} className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-center">
              <Input placeholder="Subject Name" value={subj.name}
                onChange={(e) => setSubjects(subjects.map((s, i) => i === idx ? { ...s, name: e.target.value } : s))} />
              <Input placeholder="Total Marks" type="number" value={subj.totalMarks}
                onChange={(e) => setSubjects(subjects.map((s, i) => i === idx ? { ...s, totalMarks: e.target.value } : s))} />
              <Input placeholder="Passing Marks" type="number" value={subj.passingMarks}
                onChange={(e) => setSubjects(subjects.map((s, i) => i === idx ? { ...s, passingMarks: e.target.value } : s))} />
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={subj.allowSubmitterConfig}
                  onChange={(e) => setSubjects(subjects.map((s, i) => i === idx ? { ...s, allowSubmitterConfig: e.target.checked } : s))} />
                Let submitter set marks
              </label>
              <Button variant="danger" type="button" onClick={() => setSubjects(subjects.filter((_, i) => i !== idx))} disabled={subjects.length === 1}>
                Remove
              </Button>
            </div>
          ))}
          <Button variant="secondary" type="button" onClick={() => setSubjects([...subjects, { name: '', totalMarks: 100, passingMarks: 40, allowSubmitterConfig: false }])}>
            + Add Subject
          </Button>
        </Card>
      )}

      {step === 3 && (
        <Card className="space-y-3">
          <p className="text-sm text-slate-500">Review before activating public submission.</p>
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div><p className="text-slate-500">Exam</p><p className="font-medium">{examDetails.examName || examDetails.examType}</p></div>
            <div><p className="text-slate-500">Class</p><p className="font-medium">{examDetails.class}{examDetails.section ? ` - ${examDetails.section}` : ''}</p></div>
            <div><p className="text-slate-500">Students</p><p className="font-medium">{selectedIds.size}</p></div>
            <div><p className="text-slate-500">Subjects</p><p className="font-medium">{subjects.filter((s) => s.name).length}</p></div>
          </div>
          <p className="text-xs text-slate-400">
            Creating the session does not activate submission yet -- once created, you'll be able to turn on
            submission and get a separate unique link for each subject, ready to share individually.
          </p>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="secondary" type="button" onClick={goBack} disabled={step === 0}>Back</Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={goNext}>Next</Button>
        ) : (
          <Button type="button" onClick={handleCreateAndActivate} disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Result Session'}
          </Button>
        )}
      </div>
    </div>
  );
}
