import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Check, CheckSquare, Plus, Square, X } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { studentsApi } from '../../api/studentsApi';
import { resultSessionsApi } from '../../api/resultSessionsApi';

const STEPS = ['Exam Details', 'Select Students', 'Subjects', 'Review & Activate'];
const EXAM_TYPES = [
  'First Term Examination',
  'Second Term Examination',
  'Mid Term Examination',
  'Final Term Examination',
  'Annual Examination',
  'Monthly Test',
  'Pre-Board',
  'Board Preparation',
  'Other',
];

export default function CreateResultSessionWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [examDetails, setExamDetails] = useState({
    examName: '',
    examType: 'First Term Examination',
    resultDate: '',
    academicYear: '',
    schoolName: '',
    schoolAddress: '',
    schoolPhone: '',
  });

  const [groups, setGroups] = useState(null);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [customClassInput, setCustomClassInput] = useState('');

  const [roster, setRoster] = useState([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [rosterSearch, setRosterSearch] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');

  const [subjects, setSubjects] = useState([
    { name: '', totalMarks: 100, passingMarks: 40, allowSubmitterConfig: false },
  ]);

  useEffect(() => {
    studentsApi
      .groups()
      .then(({ data }) => {
        setGroups(data);
        if (data.length > 0 && !examDetails.academicYear) {
          setExamDetails((prev) => ({ ...prev, academicYear: data[0].academicYear }));
        }
        if (data.length === 1) {
          setSelectedClasses([data[0].class]);
        }
      })
      .finally(() => setLoadingGroups(false));
  }, []); // eslint-disable-line

  const availableClassNames = useMemo(() => {
    const list = [...new Set((groups || []).map((g) => g.class).filter(Boolean))];
    return list;
  }, [groups]);

  const yearOptions = useMemo(() => {
    const list = [...new Set((groups || []).map((g) => g.academicYear).filter(Boolean))];
    return list;
  }, [groups]);

  function toggleClassSelection(className) {
    setSelectedClasses((prev) =>
      prev.includes(className) ? prev.filter((c) => c !== className) : [...prev, className]
    );
  }

  function addCustomClass() {
    const val = customClassInput.trim();
    if (!val) return;
    if (!selectedClasses.includes(val)) {
      setSelectedClasses((prev) => [...prev, val]);
    }
    setCustomClassInput('');
  }

  // Load students for all selected classes
  function loadRoster() {
    if (selectedClasses.length === 0) return;
    setLoadingRoster(true);

    Promise.all(
      selectedClasses.map((className) =>
        studentsApi
          .list({ class: className, academicYear: examDetails.academicYear || undefined, active: true, limit: 500 })
          .then(({ data }) => data.items || [])
          .catch(() => [])
      )
    )
      .then((results) => {
        const combined = results.flat();
        // deduplicate by _id
        const unique = [];
        const seen = new Set();
        combined.forEach((s) => {
          if (!seen.has(s._id)) {
            seen.add(s._id);
            unique.push(s);
          }
        });
        setRoster(unique);
        // By default, select all active students in the selected classes
        setSelectedIds(new Set(unique.map((s) => s._id)));
      })
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

  function selectClassStudents(className) {
    const idsInClass = roster.filter((s) => s.class === className).map((s) => s._id);
    setSelectedIds((prev) => new Set([...prev, ...idsInClass]));
  }

  function deselectClassStudents(className) {
    const idsInClass = new Set(roster.filter((s) => s.class === className).map((s) => s._id));
    setSelectedIds((prev) => new Set([...prev].filter((id) => !idsInClass.has(id))));
  }

  const filteredRoster = roster.filter((s) => {
    if (classFilter !== 'ALL' && s.class !== classFilter) return false;
    if (!rosterSearch) return true;
    const q = rosterSearch.toLowerCase();
    return s.name.toLowerCase().includes(q) || String(s.rollNumber).toLowerCase().includes(q);
  });

  // Count selected per class
  const classCounts = useMemo(() => {
    const map = {};
    selectedClasses.forEach((c) => {
      const total = roster.filter((s) => s.class === c).length;
      const sel = roster.filter((s) => s.class === c && selectedIds.has(s._id)).length;
      map[c] = { total, selected: sel };
    });
    return map;
  }, [selectedClasses, roster, selectedIds]);

  function goNext() {
    if (step === 0) {
      if (selectedClasses.length === 0) {
        toast.error('Please select at least one class for this exam');
        return;
      }
      if (!examDetails.examType || !examDetails.resultDate) {
        toast.error('Please select Exam Type and Result Date');
        return;
      }
    }
    if (step === 1 && selectedIds.size === 0) {
      toast.error('Select at least one student');
      return;
    }
    if (step === 2) {
      const validSubjs = subjects.filter((s) => s.name.trim());
      if (validSubjs.length === 0) {
        toast.error('Add at least one subject with a valid name');
        return;
      }
      for (const subj of validSubjs) {
        if (Number(subj.passingMarks) > Number(subj.totalMarks)) {
          toast.error(`Passing marks cannot exceed total marks for ${subj.name}`);
          return;
        }
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleCreateAndActivate() {
    setSubmitting(true);
    try {
      const validSubjects = subjects
        .filter((s) => s.name.trim())
        .map((s) => ({
          name: s.name.trim(),
          totalMarks: Number(s.totalMarks),
          passingMarks: Number(s.passingMarks),
          allowSubmitterConfig: !!s.allowSubmitterConfig,
        }));

      const payload = {
        examName: examDetails.examName.trim() || undefined,
        examType: examDetails.examType,
        resultDate: examDetails.resultDate,
        academicYear: examDetails.academicYear || '2026-2027',
        classes: selectedClasses.map((c) => ({ name: c, section: '' })),
        class: selectedClasses.join(', '),
        schoolInfo: {
          name: examDetails.schoolName.trim() || undefined,
          address: examDetails.schoolAddress.trim() || undefined,
          phone: examDetails.schoolPhone.trim() || undefined,
        },
        studentIds: [...selectedIds],
        subjects: validSubjects,
      };

      const { data } = await resultSessionsApi.create(payload);
      toast.success('Result session created for multiple classes');
      navigate(`/result-sessions/${data.session._id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create result session');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800">New Multi-Class Exam Session</h1>
      </div>

      {/* Stepper */}
      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, idx) => (
          <div
            key={label}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              idx === step
                ? 'bg-brand-600 text-white shadow-sm'
                : idx < step
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {idx + 1}. {label}
          </div>
        ))}
      </div>

      {/* STEP 0: EXAM DETAILS & MULTI-CLASS SELECTION */}
      {step === 0 && (
        <Card className="space-y-6">
          {!loadingGroups && availableClassNames.length === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              You haven't registered any students yet.{' '}
              <Link to="/students" className="font-medium underline">
                Add students first
              </Link>
              , then return here.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Exam Name (optional)"
              placeholder="e.g. First Term Examination"
              value={examDetails.examName}
              onChange={(e) => setExamDetails({ ...examDetails, examName: e.target.value })}
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Exam Type</label>
              <select
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={examDetails.examType}
                onChange={(e) => setExamDetails({ ...examDetails, examType: e.target.value })}
              >
                {EXAM_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <Input
              label="Result Date"
              type="date"
              required
              value={examDetails.resultDate}
              onChange={(e) => setExamDetails({ ...examDetails, resultDate: e.target.value })}
            />

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Academic Year</label>
              <select
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={examDetails.academicYear}
                onChange={(e) => setExamDetails({ ...examDetails, academicYear: e.target.value })}
              >
                <option value="">Select year</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
                {!yearOptions.includes('2026-2027') && <option value="2026-2027">2026-2027</option>}
              </select>
            </div>

            <Input
              label="School Name (optional)"
              value={examDetails.schoolName}
              onChange={(e) => setExamDetails({ ...examDetails, schoolName: e.target.value })}
            />
            <Input
              label="School Address (optional)"
              value={examDetails.schoolAddress}
              onChange={(e) => setExamDetails({ ...examDetails, schoolAddress: e.target.value })}
            />
          </div>

          {/* MULTI-CLASS SELECTION SECTION */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <label className="text-sm font-semibold text-slate-800">
                  Select Classes for this Exam (Multi-Class Support)
                </label>
                <p className="text-xs text-slate-500">
                  Select all classes participating in this exam. One submission link per subject will be generated for all selected classes.
                </p>
              </div>
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 border border-brand-200">
                {selectedClasses.length} selected
              </span>
            </div>

            {/* Registered class buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              {availableClassNames.map((c) => {
                const isSelected = selectedClasses.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleClassSelection(c)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                      isSelected
                        ? 'bg-brand-600 text-white shadow-sm ring-2 ring-brand-500 ring-offset-1'
                        : 'bg-white text-slate-700 border border-slate-300 hover:border-brand-300 hover:bg-slate-50'
                    }`}
                  >
                    {isSelected && <Check size={16} className="text-white" />}
                    <span>{c}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom class entry if needed */}
            <div className="flex items-center gap-2 pt-2">
              <Input
                placeholder="Or enter additional class name (e.g. 1st Year, 2nd Year)"
                value={customClassInput}
                onChange={(e) => setCustomClassInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomClass();
                  }
                }}
                className="max-w-md bg-white text-sm"
              />
              <Button type="button" variant="secondary" onClick={addCustomClass}>
                <Plus size={15} /> Add
              </Button>
            </div>

            {/* Selected classes pill list */}
            {selectedClasses.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs font-medium text-slate-500 mr-1">Classes in this exam:</span>
                {selectedClasses.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 border border-slate-200 shadow-2xs"
                  >
                    {c}
                    <button
                      type="button"
                      onClick={() => toggleClassSelection(c)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* STEP 1: SELECT STUDENTS PER CLASS */}
      {step === 1 && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Roster for {selectedClasses.join(', ')} ({filteredRoster.length} students loaded)
              </p>
              <p className="text-xs text-slate-500">
                Review and toggle students included in this exam.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={selectAll}>
                Select All
              </Button>
              <Button variant="secondary" size="sm" onClick={deselectAll}>
                Deselect All
              </Button>
            </div>
          </div>

          {/* Class Filter Bar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
            <span className="text-xs font-medium text-slate-500">Filter view:</span>
            <button
              type="button"
              onClick={() => setClassFilter('ALL')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                classFilter === 'ALL' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Classes ({roster.length})
            </button>
            {selectedClasses.map((c) => (
              <div key={c} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setClassFilter(c)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    classFilter === c ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {c} ({classCounts[c]?.selected ?? 0}/{classCounts[c]?.total ?? 0})
                </button>
                <button
                  type="button"
                  title={`Select all in ${c}`}
                  onClick={() => selectClassStudents(c)}
                  className="text-slate-400 hover:text-brand-600"
                >
                  <CheckSquare size={14} />
                </button>
                <button
                  type="button"
                  title={`Deselect all in ${c}`}
                  onClick={() => deselectClassStudents(c)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <Square size={14} />
                </button>
              </div>
            ))}
          </div>

          <Input
            placeholder="Search students by name or roll number"
            value={rosterSearch}
            onChange={(e) => setRosterSearch(e.target.value)}
            className="mb-3"
          />

          {loadingRoster ? (
            <div className="py-8 text-center text-sm text-slate-400">Loading student rosters...</div>
          ) : filteredRoster.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">
              No active students found for the selected classes.
            </p>
          ) : (
            <div className="max-h-96 space-y-1 overflow-y-auto divide-y divide-slate-100">
              {filteredRoster.map((s) => (
                <label
                  key={s._id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(s._id)}
                    onChange={() => toggleStudent(s._id)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 shrink-0"
                  />
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-600">
                    Roll {s.rollNumber}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="truncate text-sm font-medium text-slate-800">{s.name}</span>
                    {s.fatherName && <span className="ml-1 text-xs text-slate-400">s/o {s.fatherName}</span>}
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-200/80 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {s.class}
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span>
              Total selected: <strong className="text-slate-800">{selectedIds.size}</strong> of {roster.length} students
            </span>
            <div className="flex gap-2">
              {selectedClasses.map((c) => (
                <span key={c}>
                  {c}: <strong>{classCounts[c]?.selected ?? 0}</strong>
                </span>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* STEP 2: CONFIGURE SUBJECTS */}
      {step === 2 && (
        <Card className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Exam Subjects</h3>
            <p className="text-xs text-slate-500">
              Configure the subjects for this exam. Each subject will receive ONE unified submission link covering all {selectedClasses.length} classes.
            </p>
          </div>

          <div className="space-y-3">
            {subjects.map((subj, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3 sm:grid-cols-5 sm:items-center"
              >
                <div className="sm:col-span-2">
                  <Input
                    placeholder="Subject Name (e.g. Physics)"
                    value={subj.name}
                    onChange={(e) =>
                      setSubjects(
                        subjects.map((s, i) => (i === idx ? { ...s, name: e.target.value } : s))
                      )
                    }
                  />
                </div>
                <Input
                  label="Total"
                  type="number"
                  value={subj.totalMarks}
                  onChange={(e) =>
                    setSubjects(
                      subjects.map((s, i) => (i === idx ? { ...s, totalMarks: e.target.value } : s))
                    )
                  }
                />
                <Input
                  label="Pass"
                  type="number"
                  value={subj.passingMarks}
                  onChange={(e) =>
                    setSubjects(
                      subjects.map((s, i) => (i === idx ? { ...s, passingMarks: e.target.value } : s))
                    )
                  }
                />
                <div className="flex items-center justify-between sm:justify-end gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={subj.allowSubmitterConfig}
                      onChange={(e) =>
                        setSubjects(
                          subjects.map((s, i) =>
                            i === idx ? { ...s, allowSubmitterConfig: e.target.checked } : s
                          )
                        )
                      }
                      className="rounded border-slate-300"
                    />
                    Editable marks
                  </label>
                  <Button
                    variant="danger"
                    size="sm"
                    type="button"
                    onClick={() => setSubjects(subjects.filter((_, i) => i !== idx))}
                    disabled={subjects.length === 1}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button
            variant="secondary"
            type="button"
            onClick={() =>
              setSubjects([
                ...subjects,
                { name: '', totalMarks: 100, passingMarks: 40, allowSubmitterConfig: false },
              ])
            }
          >
            <Plus size={15} /> Add Another Subject
          </Button>
        </Card>
      )}

      {/* STEP 3: REVIEW & ACTIVATE */}
      {step === 3 && (
        <Card className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Review Multi-Class Exam Configuration</h3>
            <p className="text-xs text-slate-500">
              Verify all details before creating the session. You can activate links immediately or from the dashboard.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs font-medium text-slate-500">Exam Name / Type</p>
              <p className="font-semibold text-slate-800">{examDetails.examName || examDetails.examType}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Result Date</p>
              <p className="font-semibold text-slate-800">
                {examDetails.resultDate ? new Date(examDetails.resultDate).toLocaleDateString() : '-'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Participating Classes</p>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {selectedClasses.map((c) => (
                  <span
                    key={c}
                    className="rounded bg-brand-100 px-1.5 py-0.5 text-xs font-semibold text-brand-800"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Total Students</p>
              <p className="font-semibold text-slate-800">{selectedIds.size}</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Configured Subjects ({subjects.filter((s) => s.name.trim()).length})
            </h4>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
              {subjects
                .filter((s) => s.name.trim())
                .map((subj) => (
                  <div key={subj.name} className="rounded-md bg-slate-100 p-2.5 text-xs">
                    <p className="font-bold text-slate-800">{subj.name}</p>
                    <p className="text-slate-500">
                      Total: {subj.totalMarks} • Pass: {subj.passingMarks}
                    </p>
                  </div>
                ))}
            </div>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-800 space-y-1">
            <p className="font-semibold">✓ One Subject Link Architecture</p>
            <p>
              Each subject configured above will have <strong>exactly one secure submission link</strong>. When the Physics submitter opens their link, they will choose whether to enter marks for {selectedClasses.join(' or ')}.
            </p>
          </div>
        </Card>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-2">
        <Button variant="secondary" type="button" onClick={goBack} disabled={step === 0}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={goNext}>
            Next
          </Button>
        ) : (
          <Button type="button" onClick={handleCreateAndActivate} disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Multi-Class Exam Session'}
          </Button>
        )}
      </div>
    </div>
  );
}
