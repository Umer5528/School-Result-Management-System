import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Check,
  CheckSquare,
  Copy,
  Plus,
  Square,
  Trash2,
  X,
  Layers,
  Sparkles,
} from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { studentsApi } from '../../api/studentsApi';
import { resultSessionsApi } from '../../api/resultSessionsApi';

const STEPS = ['Exam Details & Groups', 'Select Students', 'Configure Subjects', 'Review & Activate'];
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

const PRESET_SUBJECTS = [
  'English',
  'Urdu',
  'Islamic Studies',
  'Pakistan Studies',
  'Physics',
  'Chemistry',
  'Biology',
  'Mathematics',
  'Computer Science',
  'Civics',
  'Economics',
];

function makeComboKey(name, group = '', section = '') {
  return `${name.trim()}__${(group || '').trim()}__${(section || '').trim()}`;
}

function makeDisplayName(name, group = '', section = '') {
  const parts = [name.trim()];
  if (group && group.trim()) parts.push(group.trim());
  if (section && section.trim()) parts.push(`(${section.trim()})`);
  return parts.join(' ');
}

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

  const [registeredGroups, setRegisteredGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  // Array of selected combinations: [{ id, name, group, section, displayName }]
  const [selectedCombos, setSelectedCombos] = useState([]);

  // Custom class/group adder input
  const [customClass, setCustomClass] = useState('');
  const [customGroup, setCustomGroup] = useState('');
  const [customSection, setCustomSection] = useState('');

  // Roster state
  const [roster, setRoster] = useState([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [rosterSearch, setRosterSearch] = useState('');
  const [comboFilter, setComboFilter] = useState('ALL');

  // Per-combination subjects dictionary: { [comboId]: [ { id, name, totalMarks, passingMarks, allowSubmitterConfig } ] }
  const [subjectsByCombo, setSubjectsByCombo] = useState({});
  const [activeComboId, setActiveComboId] = useState('');

  // Copy helper state
  const [copySourceComboId, setCopySourceComboId] = useState('');

  useEffect(() => {
    studentsApi
      .groups()
      .then(({ data }) => {
        setRegisteredGroups(data || []);
        if (data && data.length > 0 && !examDetails.academicYear) {
          setExamDetails((prev) => ({ ...prev, academicYear: data[0].academicYear }));
        }
      })
      .finally(() => setLoadingGroups(false));
  }, []); // eslint-disable-line

  const yearOptions = useMemo(() => {
    const list = [...new Set((registeredGroups || []).map((g) => g.academicYear).filter(Boolean))];
    return list;
  }, [registeredGroups]);

  // Available registered combination cards
  const availableCombos = useMemo(() => {
    return (registeredGroups || []).map((g) => {
      const id = makeComboKey(g.class, g.group, g.section);
      const displayName = makeDisplayName(g.class, g.group, g.section);
      return {
        id,
        name: g.class,
        group: g.group || '',
        section: g.section || '',
        displayName,
        count: g.count,
        academicYear: g.academicYear,
      };
    });
  }, [registeredGroups]);

  function toggleComboSelection(combo) {
    setSelectedCombos((prev) => {
      const exists = prev.some((c) => c.id === combo.id);
      if (exists) {
        return prev.filter((c) => c.id !== combo.id);
      }
      return [...prev, combo];
    });
  }

  function addCustomCombo() {
    const cName = customClass.trim();
    if (!cName) {
      toast.error('Enter a class name (e.g. 1st Year)');
      return;
    }
    const cGroup = customGroup.trim();
    const cSec = customSection.trim();
    const id = makeComboKey(cName, cGroup, cSec);
    const displayName = makeDisplayName(cName, cGroup, cSec);

    if (selectedCombos.some((c) => c.id === id)) {
      toast.error('This class/group combination is already selected');
      return;
    }

    const newCombo = { id, name: cName, group: cGroup, section: cSec, displayName };
    setSelectedCombos((prev) => [...prev, newCombo]);
    setCustomClass('');
    setCustomGroup('');
    setCustomSection('');
    toast.success(`Added ${displayName}`);
  }

  // Load students for all selected combinations
  function loadRoster() {
    if (selectedCombos.length === 0) return;
    setLoadingRoster(true);

    Promise.all(
      selectedCombos.map((combo) =>
        studentsApi
          .list({
            class: combo.name,
            group: combo.group || undefined,
            section: combo.section || undefined,
            academicYear: examDetails.academicYear || undefined,
            active: true,
            limit: 500,
          })
          .then(({ data }) => data.items || [])
          .catch(() => [])
      )
    )
      .then((results) => {
        const combined = results.flat();
        const unique = [];
        const seen = new Set();
        combined.forEach((s) => {
          if (!seen.has(s._id)) {
            seen.add(s._id);
            unique.push(s);
          }
        });
        setRoster(unique);
        setSelectedIds(new Set(unique.map((s) => s._id)));
      })
      .finally(() => setLoadingRoster(false));
  }

  useEffect(() => {
    if (step === 1) loadRoster();
  }, [step]); // eslint-disable-line

  // Initialize subjects dictionary for each selected combo
  useEffect(() => {
    if (selectedCombos.length > 0) {
      setSubjectsByCombo((prev) => {
        const next = { ...prev };
        selectedCombos.forEach((c) => {
          if (!next[c.id] || next[c.id].length === 0) {
            next[c.id] = [
              { id: '1', name: 'English', totalMarks: 100, passingMarks: 33, allowSubmitterConfig: false },
              { id: '2', name: 'Urdu', totalMarks: 100, passingMarks: 33, allowSubmitterConfig: false },
            ];
          }
        });
        return next;
      });
      if (!activeComboId || !selectedCombos.some((c) => c.id === activeComboId)) {
        setActiveComboId(selectedCombos[0]?.id || '');
      }
    }
  }, [selectedCombos]); // eslint-disable-line

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

  function selectComboStudents(combo) {
    const idsInCombo = roster
      .filter((s) => s.class === combo.name && (!combo.group || s.group === combo.group))
      .map((s) => s._id);
    setSelectedIds((prev) => new Set([...prev, ...idsInCombo]));
  }

  function deselectComboStudents(combo) {
    const idsInCombo = new Set(
      roster
        .filter((s) => s.class === combo.name && (!combo.group || s.group === combo.group))
        .map((s) => s._id)
    );
    setSelectedIds((prev) => new Set([...prev].filter((id) => !idsInCombo.has(id))));
  }

  const filteredRoster = roster.filter((s) => {
    if (comboFilter !== 'ALL') {
      const matched = selectedCombos.find((c) => c.id === comboFilter);
      if (matched && (s.class !== matched.name || (matched.group && s.group !== matched.group))) {
        return false;
      }
    }
    if (!rosterSearch) return true;
    const q = rosterSearch.toLowerCase();
    return s.name.toLowerCase().includes(q) || String(s.rollNumber).toLowerCase().includes(q);
  });

  const comboCounts = useMemo(() => {
    const map = {};
    selectedCombos.forEach((c) => {
      const total = roster.filter(
        (s) => s.class === c.name && (!c.group || s.group === c.group)
      ).length;
      const sel = roster.filter(
        (s) => s.class === c.name && (!c.group || s.group === c.group) && selectedIds.has(s._id)
      ).length;
      map[c.id] = { total, selected: sel };
    });
    return map;
  }, [selectedCombos, roster, selectedIds]);

  // Subject management for active combination
  const currentSubjects = subjectsByCombo[activeComboId] || [];

  function updateCurrentSubjects(updater) {
    setSubjectsByCombo((prev) => ({
      ...prev,
      [activeComboId]: typeof updater === 'function' ? updater(prev[activeComboId] || []) : updater,
    }));
  }

  function addSubjectToActive(name = '', totalMarks = 100, passingMarks = 33) {
    updateCurrentSubjects((list) => [
      ...list,
      {
        id: Date.now().toString() + Math.random().toString().slice(2, 6),
        name,
        totalMarks,
        passingMarks,
        allowSubmitterConfig: false,
      },
    ]);
  }

  function removeSubjectFromActive(idx) {
    updateCurrentSubjects((list) => list.filter((_, i) => i !== idx));
  }

  function handleAddPreset(presetName) {
    if (currentSubjects.some((s) => s.name.trim().toLowerCase() === presetName.toLowerCase())) {
      toast.error(`${presetName} is already added in this group`);
      return;
    }
    addSubjectToActive(presetName, 100, 33);
  }

  function handleCopyConfiguration() {
    if (!copySourceComboId) {
      toast.error('Select a source class/group to copy from');
      return;
    }
    if (copySourceComboId === activeComboId) {
      toast.error('Source and destination cannot be the same');
      return;
    }

    const sourceSubjects = subjectsByCombo[copySourceComboId] || [];
    if (sourceSubjects.length === 0) {
      toast.error('Source class/group has no subjects configured');
      return;
    }

    // Deep clone with independent IDs
    const cloned = sourceSubjects.map((s) => ({
      ...s,
      id: Date.now().toString() + Math.random().toString().slice(2, 6),
    }));

    updateCurrentSubjects(cloned);
    const sourceCombo = selectedCombos.find((c) => c.id === copySourceComboId);
    const activeCombo = selectedCombos.find((c) => c.id === activeComboId);
    toast.success(
      `Copied ${cloned.length} subjects from ${sourceCombo?.displayName} to ${activeCombo?.displayName}`
    );
  }

  function goNext() {
    if (step === 0) {
      if (selectedCombos.length === 0) {
        toast.error('Please select at least one class/group combination');
        return;
      }
      if (!examDetails.examType || !examDetails.resultDate) {
        toast.error('Please enter Exam Type and Result Date');
        return;
      }
    }
    if (step === 1 && selectedIds.size === 0) {
      toast.error('Select at least one student for this examination');
      return;
    }
    if (step === 2) {
      // Validate every selected combo has at least one valid subject
      for (const combo of selectedCombos) {
        const subjs = subjectsByCombo[combo.id] || [];
        const valid = subjs.filter((s) => s.name && s.name.trim());
        if (valid.length === 0) {
          toast.error(`${combo.displayName} has no valid subjects configured`);
          setActiveComboId(combo.id);
          return;
        }
        for (const s of valid) {
          if (Number(s.passingMarks) > Number(s.totalMarks)) {
            toast.error(
              `Passing marks cannot exceed total marks for ${s.name} in ${combo.displayName}`
            );
            setActiveComboId(combo.id);
            return;
          }
        }
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleCreateSession() {
    setSubmitting(true);
    try {
      const classesPayload = selectedCombos.map((combo) => {
        const subjs = (subjectsByCombo[combo.id] || [])
          .filter((s) => s.name && s.name.trim())
          .map((s) => ({
            name: s.name.trim(),
            totalMarks: Number(s.totalMarks),
            passingMarks: Number(s.passingMarks),
            allowSubmitterConfig: !!s.allowSubmitterConfig,
          }));

        return {
          name: combo.name,
          group: combo.group || '',
          section: combo.section || '',
          displayName: combo.displayName,
          subjects: subjs,
        };
      });

      const payload = {
        examName: examDetails.examName.trim() || undefined,
        examType: examDetails.examType,
        resultDate: examDetails.resultDate,
        academicYear: examDetails.academicYear || '2026-2027',
        classes: classesPayload,
        schoolInfo: {
          name: examDetails.schoolName.trim() || undefined,
          address: examDetails.schoolAddress.trim() || undefined,
          phone: examDetails.schoolPhone.trim() || undefined,
        },
        studentIds: [...selectedIds],
      };

      const { data } = await resultSessionsApi.create(payload);
      toast.success('Exam session created with class & group specific subjects');
      navigate(`/result-sessions/${data.session._id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create exam session');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">New Class & Group-Wise Examination</h1>
          <p className="text-xs text-slate-500">
            Configure different subjects, marks, and rosters for each class and academic stream independently.
          </p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, idx) => (
          <div
            key={label}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
              idx === step
                ? 'bg-brand-600 text-white shadow-sm ring-2 ring-brand-400 ring-offset-1'
                : idx < step
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {idx + 1}. {label}
          </div>
        ))}
      </div>

      {/* STEP 0: EXAM DETAILS & CLASS/GROUP SELECTION */}
      {step === 0 && (
        <Card className="space-y-6">
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

          {/* CLASS & GROUP SELECTION SECTION */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <label className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Layers size={16} className="text-brand-600" />
                  Select Class & Academic Group Combinations
                </label>
                <p className="text-xs text-slate-500 mt-0.5">
                  Each selected group (e.g. 1st Year Arts, 1st Year Pre-Med) will maintain its own independent subjects and results.
                </p>
              </div>
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 border border-brand-200">
                {selectedCombos.length} selected
              </span>
            </div>

            {/* Registered combinations buttons */}
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Registered in Institution ({availableCombos.length})
              </span>
              {loadingGroups ? (
                <p className="text-xs text-slate-400">Loading registered classes...</p>
              ) : availableCombos.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                  No student classes registered yet.{' '}
                  <Link to="/students" className="font-medium underline">
                    Add students in Students Page
                  </Link>{' '}
                  or add custom combinations below.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {availableCombos.map((combo) => {
                    const isSelected = selectedCombos.some((c) => c.id === combo.id);
                    return (
                      <button
                        key={combo.id}
                        type="button"
                        onClick={() => toggleComboSelection(combo)}
                        className={`flex items-center justify-between rounded-lg p-2.5 text-left text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-brand-600 text-white shadow-sm ring-2 ring-brand-500 ring-offset-1'
                            : 'bg-white text-slate-700 border border-slate-200 hover:border-brand-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-bold truncate">{combo.displayName}</p>
                          <p className={`text-[10px] ${isSelected ? 'text-brand-100' : 'text-slate-400'}`}>
                            {combo.count} student(s) • {combo.academicYear}
                          </p>
                        </div>
                        {isSelected && <Check size={16} className="text-white shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Add Custom Combination */}
            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
              <span className="text-xs font-semibold text-slate-700">Add Additional Combination</span>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                <Input
                  placeholder="Class (e.g. 2nd Year)"
                  value={customClass}
                  onChange={(e) => setCustomClass(e.target.value)}
                  className="text-xs"
                />
                <Input
                  placeholder="Group (e.g. Computer Science)"
                  value={customGroup}
                  onChange={(e) => setCustomGroup(e.target.value)}
                  className="text-xs"
                />
                <Input
                  placeholder="Section (optional)"
                  value={customSection}
                  onChange={(e) => setCustomSection(e.target.value)}
                  className="text-xs"
                />
                <Button type="button" variant="secondary" size="sm" onClick={addCustomCombo}>
                  <Plus size={14} /> Add Combination
                </Button>
              </div>
            </div>

            {/* Selected combinations pill list */}
            {selectedCombos.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs font-medium text-slate-500 mr-1">Selected combinations:</span>
                {selectedCombos.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 border border-slate-200 shadow-2xs"
                  >
                    {c.displayName}
                    <button
                      type="button"
                      onClick={() => toggleComboSelection(c)}
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

      {/* STEP 1: SELECT STUDENTS */}
      {step === 1 && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Roster for Selected Classes ({filteredRoster.length} students loaded)
              </p>
              <p className="text-xs text-slate-500">
                Select the students eligible to participate in this exam.
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

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
            <span className="text-xs font-medium text-slate-500">Filter view:</span>
            <button
              type="button"
              onClick={() => setComboFilter('ALL')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                comboFilter === 'ALL'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Groups ({roster.length})
            </button>
            {selectedCombos.map((c) => (
              <div key={c.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setComboFilter(c.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    comboFilter === c.id
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {c.displayName} ({comboCounts[c.id]?.selected ?? 0}/{comboCounts[c.id]?.total ?? 0})
                </button>
                <button
                  type="button"
                  title={`Select all in ${c.displayName}`}
                  onClick={() => selectComboStudents(c)}
                  className="text-slate-400 hover:text-brand-600"
                >
                  <CheckSquare size={14} />
                </button>
                <button
                  type="button"
                  title={`Deselect all in ${c.displayName}`}
                  onClick={() => deselectComboStudents(c)}
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
              No active students found for the selected combinations.
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
                    {s.fatherName && (
                      <span className="ml-1 text-xs text-slate-400">s/o {s.fatherName}</span>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-200/80 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {s.class} {s.group && `• ${s.group}`}
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span>
              Total selected: <strong className="text-slate-800">{selectedIds.size}</strong> of {roster.length} students
            </span>
            <div className="flex flex-wrap gap-2">
              {selectedCombos.map((c) => (
                <span key={c.id}>
                  {c.displayName}: <strong>{comboCounts[c.id]?.selected ?? 0}</strong>
                </span>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* STEP 2: CLASS/GROUP-SPECIFIC SUBJECT CONFIGURATION */}
      {step === 2 && (
        <Card className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Independent Subject Configuration by Class/Group
              </h2>
              <p className="text-xs text-slate-500">
                Configure subjects, total marks, and passing marks for each class/group separately.
              </p>
            </div>
          </div>

          {/* Group Tabs */}
          <div className="flex flex-wrap gap-2">
            {selectedCombos.map((combo) => {
              const subCount = (subjectsByCombo[combo.id] || []).filter((s) => s.name?.trim()).length;
              const isActive = combo.id === activeComboId;
              return (
                <button
                  key={combo.id}
                  type="button"
                  onClick={() => setActiveComboId(combo.id)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm ring-2 ring-brand-400 ring-offset-1'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <span>{combo.displayName}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {subCount} subjs
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Group Header & Fast Tools */}
          {activeComboId && (
            <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-brand-900">
                    Configuring: {selectedCombos.find((c) => c.id === activeComboId)?.displayName}
                  </h3>
                  <p className="text-xs text-brand-700">
                    Add subjects or copy settings from another group.
                  </p>
                </div>

                {/* COPY CONFIGURATION FEATURE */}
                {selectedCombos.length > 1 && (
                  <div className="flex items-center gap-2 bg-white rounded-lg p-1.5 border border-slate-200 shadow-2xs">
                    <span className="text-xs font-medium text-slate-600 pl-1">Copy from:</span>
                    <select
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      value={copySourceComboId}
                      onChange={(e) => setCopySourceComboId(e.target.value)}
                    >
                      <option value="">Select class/group</option>
                      {selectedCombos
                        .filter((c) => c.id !== activeComboId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.displayName} ({(subjectsByCombo[c.id] || []).length} subjects)
                          </option>
                        ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={handleCopyConfiguration}
                    >
                      <Copy size={13} /> Copy
                    </Button>
                  </div>
                )}
              </div>

              {/* Quick Preset Buttons */}
              <div className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Quick Add Subjects
                </span>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {PRESET_SUBJECTS.map((p) => {
                    const alreadyAdded = currentSubjects.some(
                      (s) => s.name.trim().toLowerCase() === p.toLowerCase()
                    );
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handleAddPreset(p)}
                        className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                          alreadyAdded
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-white text-slate-700 border border-slate-300 hover:border-brand-500 hover:text-brand-600 shadow-2xs'
                        }`}
                        disabled={alreadyAdded}
                      >
                        + {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Subjects List for Active Group */}
              <div className="space-y-3 pt-2">
                {currentSubjects.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">
                    No subjects configured yet for this group. Add one below or use quick presets.
                  </p>
                ) : (
                  currentSubjects.map((subj, idx) => (
                    <div
                      key={subj.id || idx}
                      className="grid grid-cols-1 sm:grid-cols-5 gap-3 rounded-lg border border-slate-200 bg-white p-3 items-center shadow-2xs"
                    >
                      <div className="sm:col-span-2">
                        <Input
                          placeholder="Subject Name (e.g. Physics)"
                          value={subj.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateCurrentSubjects((list) =>
                              list.map((s, i) => (i === idx ? { ...s, name: val } : s))
                            );
                          }}
                        />
                      </div>
                      <Input
                        label="Total"
                        type="number"
                        value={subj.totalMarks}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateCurrentSubjects((list) =>
                            list.map((s, i) => (i === idx ? { ...s, totalMarks: val } : s))
                          );
                        }}
                      />
                      <Input
                        label="Pass"
                        type="number"
                        value={subj.passingMarks}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateCurrentSubjects((list) =>
                            list.map((s, i) => (i === idx ? { ...s, passingMarks: val } : s))
                          );
                        }}
                      />
                      <div className="flex items-center justify-between sm:justify-end gap-2">
                        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={subj.allowSubmitterConfig}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              updateCurrentSubjects((list) =>
                                list.map((s, i) => (i === idx ? { ...s, allowSubmitterConfig: checked } : s))
                              );
                            }}
                            className="rounded border-slate-300"
                          />
                          Editable
                        </label>
                        <Button
                          variant="danger"
                          size="sm"
                          type="button"
                          onClick={() => removeSubjectFromActive(idx)}
                          disabled={currentSubjects.length === 1}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-between items-center pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => addSubjectToActive('', 100, 33)}
                >
                  <Plus size={14} /> Add Another Subject
                </Button>
                <span className="text-xs font-semibold text-slate-600">
                  Total Max Marks:{' '}
                  <strong className="text-slate-800">
                    {currentSubjects.reduce((acc, s) => acc + (Number(s.totalMarks) || 0), 0)}
                  </strong>
                </span>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* STEP 3: REVIEW & ACTIVATE */}
      {step === 3 && (
        <Card className="space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-800">
              Review Class & Group Examination Configuration
            </h2>
            <p className="text-xs text-slate-500">
              Verify independent configurations for each class/group before creating the exam session.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs font-medium text-slate-500">Exam Name / Type</p>
              <p className="font-bold text-slate-800">{examDetails.examName || examDetails.examType}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Result Date</p>
              <p className="font-bold text-slate-800">
                {examDetails.resultDate ? new Date(examDetails.resultDate).toLocaleDateString() : '-'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Academic Year</p>
              <p className="font-bold text-slate-800">{examDetails.academicYear}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Total Students</p>
              <p className="font-bold text-slate-800">{selectedIds.size}</p>
            </div>
          </div>

          {/* Breakdown per Class/Group */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800">
              Independent Class/Group Configurations ({selectedCombos.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedCombos.map((combo) => {
                const subjs = (subjectsByCombo[combo.id] || []).filter((s) => s.name?.trim());
                const totalMax = subjs.reduce((acc, s) => acc + (Number(s.totalMarks) || 0), 0);
                const studentCount = comboCounts[combo.id]?.selected ?? 0;
                return (
                  <div key={combo.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">{combo.displayName}</h4>
                        <p className="text-xs text-slate-500">{studentCount} students enrolled</p>
                      </div>
                      <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700 border border-brand-200">
                        Max: {totalMax} marks
                      </span>
                    </div>

                    <div className="space-y-1.5 border-t border-slate-100 pt-2">
                      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Configured Subjects ({subjs.length})
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {subjs.map((s) => (
                          <div
                            key={s.name}
                            className="rounded bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-xs flex justify-between items-center"
                          >
                            <span className="font-semibold text-slate-800 truncate pr-1">{s.name}</span>
                            <span className="text-slate-500 text-[11px] shrink-0">
                              {s.totalMarks} (Pass: {s.passingMarks})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Unified Subject Links Architecture Banner */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-900 space-y-1.5">
            <p className="font-bold flex items-center gap-1.5 text-sm">
              <Sparkles size={16} className="text-emerald-700" />
              Unified Public Subject Links Architecture
            </p>
            <p>
              When activated, the system generates <strong>one secure link per unique subject</strong>.
              Each link will only cover the class/groups where that subject is configured:
            </p>
            <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-emerald-800">
              <li>Submitters only see the classes authorized for their subject.</li>
              <li>Marks and rankings for each group remain completely separate and independent.</li>
            </ul>
          </div>
        </Card>
      )}

      {/* Navigation Footer */}
      <div className="flex justify-between pt-2">
        <Button variant="secondary" type="button" onClick={goBack} disabled={step === 0}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={goNext}>
            Next
          </Button>
        ) : (
          <Button type="button" onClick={handleCreateSession} disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Exam Session'}
          </Button>
        )}
      </div>
    </div>
  );
}
