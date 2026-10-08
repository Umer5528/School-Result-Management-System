import React, { useEffect, useState, useMemo } from 'react';
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
  Filter,
  Layers,
  Link as LinkIcon,
  Lock,
  Pencil,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  Trash2,
  Unlock,
  X,
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

  // Accordion / collapse state for Class cards
  const [expandedClasses, setExpandedClasses] = useState({});

  // Accordion for Subject Links section
  const [linksSectionExpanded, setLinksSectionExpanded] = useState(true);

  // Filters state
  const [classFilter, setClassFilter] = useState('ALL');
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [sectionFilter, setSectionFilter] = useState('ALL');
  const [subjectFilter, setSubjectFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

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

  // Regenerate confirmation modal
  const [regeneratingTarget, setRegeneratingTarget] = useState(null); // { subjectId, name }

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
      // Auto-expand all classes by default for immediate visibility
      if (data.session?.classes) {
        const expanded = {};
        data.session.classes.forEach((c) => {
          expanded[c._id] = true;
        });
        setExpandedClasses(expanded);
      }
    });
  }

  useEffect(load, [id]); // eslint-disable-line

  function toggleClassExpand(classId) {
    setExpandedClasses((prev) => ({ ...prev, [classId]: !prev[classId] }));
  }

  function expandAll() {
    const exp = {};
    (session?.classes || []).forEach((c) => {
      exp[c._id] = true;
    });
    setExpandedClasses(exp);
  }

  function collapseAll() {
    setExpandedClasses({});
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
    setRegeneratingTarget({ subjectId, name });
  };

  // Inspect submitted marks for a specific class
  async function openClassMarks(subject, targetClass) {
    if (!targetClass) return;
    const classObj = {
      classId: targetClass._id || targetClass.classId,
      className: targetClass.name || targetClass.className,
      group: targetClass.group || '',
      section: targetClass.section || '',
      displayName: targetClass.displayName || targetClass.name,
    };
    setInspectingSubject(subject);
    setInspectingClass(classObj);
    setEditMode(false);
    setLoadingDetail(true);
    setSubmissionDetail(null);
    try {
      const targetSubjId = subject?.linkSubjectId || subject?._id;
      const { data } = await resultSessionsApi.getSubjectSubmission(id, targetSubjId, classObj.classId);
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
    if (!submissionDetail?.rows) return;
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
    if (!inspectingSubject || !inspectingClass || !submissionDetail?.rows) return;
    setActionBusy(true);
    try {
      const targetSubjId = inspectingSubject.linkSubjectId || inspectingSubject._id;
      await resultSessionsApi.editSubjectSubmission(
        id,
        targetSubjId,
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
    if (!inspectingSubject || !inspectingClass || !submissionDetail) return;
    setActionBusy(true);
    try {
      const targetSubjId = inspectingSubject.linkSubjectId || inspectingSubject._id;
      const action =
        submissionDetail.status === 'LOCKED' ? resultSessionsApi.unlockSubject : resultSessionsApi.lockSubject;
      await action(id, targetSubjId, inspectingClass.classId);
      toast.success(submissionDetail.status === 'LOCKED' ? 'Class unlocked' : 'Class locked');
      openClassMarks(inspectingSubject, inspectingClass);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setActionBusy(false);
    }
  }

  // REOPEN CLASS RESULTS
  function promptReopen(subject, targetClass) {
    if (!targetClass) return;
    setReopeningTarget({
      subject,
      classSub: {
        classId: targetClass._id || targetClass.classId,
        className: targetClass.name || targetClass.className,
        displayName: targetClass.displayName || targetClass.name,
      },
    });
  }

  async function confirmReopen() {
    if (!reopeningTarget?.classSub) return;
    const { subject, classSub } = reopeningTarget;
    setActionBusy(true);
    try {
      const targetSubjId = subject?.linkSubjectId || subject?._id;
      await resultSessionsApi.reopenSubject(id, targetSubjId, classSub.classId);
      toast.success(`${classSub.displayName || classSub.className} ${subject?.name || ''} results reopened. The same link can now be used again.`);
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
    if (!targetClass) return;
    const classLabel = targetClass.displayName || targetClass.name;
    if (
      !window.confirm(
        `Generate official final result for ${classLabel}? Marks for all subjects will be locked into calculated rankings.`
      )
    )
      return;
    setFinalizingClassId(targetClass._id);
    try {
      const { data } = await resultSessionsApi.generateClassFinal(id, targetClass._id);
      toast.success(`Final result for ${classLabel} generated!`);
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
        toast.success(`${c?.displayName || c?.name} result data permanently deleted`);
        setDeleteModalState({ open: false, isEntireExam: false, targetClass: null });
        load();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to permanently delete');
    } finally {
      setDeleteBusy(false);
    }
  }

  // Extract filter options
  const uniqueClassNames = useMemo(() => {
    if (!session?.classes) return [];
    return Array.from(new Set(session.classes.map((c) => c.name).filter(Boolean)));
  }, [session]);

  const uniqueGroups = useMemo(() => {
    if (!session?.classes) return [];
    return Array.from(new Set(session.classes.map((c) => c.group).filter(Boolean)));
  }, [session]);

  const uniqueSections = useMemo(() => {
    if (!session?.classes) return [];
    return Array.from(new Set(session.classes.map((c) => c.section).filter(Boolean)));
  }, [session]);

  const uniqueSubjectNames = useMemo(() => {
    if (!session) return [];
    const set = new Set();
    (session.subjects || []).forEach((s) => set.add(s.name));
    (session.classes || []).forEach((c) => {
      (c.subjects || []).forEach((s) => set.add(s.name));
    });
    return Array.from(set).sort();
  }, [session]);

  // Filtered classes list
  const filteredClasses = useMemo(() => {
    if (!session?.classes) return [];
    return session.classes.filter((c) => {
      if (classFilter !== 'ALL' && c.name !== classFilter) return false;
      if (groupFilter !== 'ALL' && (c.group || '') !== groupFilter) return false;
      if (sectionFilter !== 'ALL' && (c.section || '') !== sectionFilter) return false;

      const cSubjects = c.subjects && c.subjects.length > 0 ? c.subjects : session.subjects || [];

      if (subjectFilter !== 'ALL') {
        const hasSubj = cSubjects.some(
          (s) => s.name?.trim().toLowerCase() === subjectFilter.trim().toLowerCase()
        );
        if (!hasSubj) return false;
      }

      const isFinalized = !!c.finalResultId;
      const isReady =
        !isFinalized &&
        (c.pendingSubjectsCount === 0 || (cSubjects.length > 0 && cSubjects.every((s) => s.submitted)));
      const isPending = !isFinalized && !isReady;

      if (statusFilter === 'FINALIZED' && !isFinalized) return false;
      if (statusFilter === 'READY' && !isReady) return false;
      if (statusFilter === 'PENDING' && !isPending) return false;

      if (searchTerm.trim()) {
        const query = searchTerm.trim().toLowerCase();
        const label = (c.displayName || `${c.name} ${c.group || ''}`).toLowerCase();
        const hasInSubjects = cSubjects.some((s) => s.name?.toLowerCase().includes(query));
        if (!label.includes(query) && !hasInSubjects) return false;
      }

      return true;
    });
  }, [session, classFilter, groupFilter, sectionFilter, subjectFilter, statusFilter, searchTerm]);

  const hasActiveFilters =
    classFilter !== 'ALL' ||
    groupFilter !== 'ALL' ||
    sectionFilter !== 'ALL' ||
    subjectFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    searchTerm.trim() !== '';

  function resetFilters() {
    setClassFilter('ALL');
    setGroupFilter('ALL');
    setSectionFilter('ALL');
    setSubjectFilter('ALL');
    setStatusFilter('ALL');
    setSearchTerm('');
  }

  if (!session) return <Skeleton className="h-64 w-full" />;

  const everActivated = (session.subjects || []).some((s) => s.linkStatus !== null);
  const examClasses = session.classes || [{ _id: session._id, name: session.class }];
  const allFinalized = examClasses.length > 0 && examClasses.every((c) => !!c.finalResultId);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 1. HEADER CARD */}
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1.5">
              <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-[11px] sm:text-xs font-semibold text-brand-700">
                Multi-Class / Group Exam
              </span>
              {session.submissionStatus === 'ACTIVE' ? (
                <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] sm:text-xs font-medium text-emerald-700">
                  🟢 Submission Active
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] sm:text-xs font-medium text-slate-600">
                  🔴 Submission Off
                </span>
              )}
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-800 break-words">{session.examName || session.examType}</h1>
            <p className="text-xs text-slate-500 mt-1">
              Academic Session: <strong>{session.academicYear}</strong> • Exam Date:{' '}
              {new Date(session.resultDate).toLocaleDateString()}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <Button variant="danger" size="sm" onClick={promptDeleteEntireExam} className="text-xs">
              <Trash2 size={14} /> Delete Exam
            </Button>
          </div>
        </div>

        {/* Participating Classes & Groups */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Participating Classes & Groups ({examClasses.length})
          </p>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {examClasses.map((c) => {
              const classStudents = session.students.filter(
                (s) =>
                  (s.classId && s.classId.toString() === c._id.toString()) ||
                  (s.class === c.name && (!c.group || s.group === c.group))
              );
              return (
                <div
                  key={c._id}
                  className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700"
                >
                  <span className="font-bold text-slate-800">{c?.displayName || c?.name}</span>
                  {c.section && !c?.displayName?.includes(c.section) && (
                    <span className="text-slate-400">({c.section})</span>
                  )}
                  <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] text-slate-600">
                    {c.studentCount || classStudents.length} students
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
        <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-4 rounded-xl bg-slate-50/80 p-2.5 sm:p-3 text-xs sm:text-sm sm:grid-cols-4">
          <div>
            <p className="text-[11px] text-slate-500">Classes & Groups</p>
            <p className="text-sm sm:text-base font-bold text-slate-800">{examClasses.length}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">Total Students</p>
            <p className="text-sm sm:text-base font-bold text-slate-800">{session.students.length}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">Unique Subjects</p>
            <p className="text-sm sm:text-base font-bold text-slate-800">{session.subjects.length}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">Finalized Classes</p>
            <p className="text-sm sm:text-base font-bold text-emerald-600">
              {examClasses.filter((c) => !!c.finalResultId).length} / {examClasses.length}
            </p>
          </div>
        </div>
      </Card>

      {/* 2. ACTIVATION TOOLBAR */}
      {!allFinalized && (
        <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {everActivated ? 'Subject Submission Links Active' : 'Generate Secure Submission Links'}
            </p>
            <p className="text-xs text-slate-500">
              {everActivated
                ? 'One link per unique subject covers only its authorized classes and groups.'
                : 'Generates subject-specific submission links that respect each class/group configuration.'}
            </p>
          </div>
          <div className="shrink-0">
            {session.submissionStatus === 'ACTIVE' ? (
              <Button variant="danger" size="sm" onClick={handleDeactivateAll} disabled={busy} className="w-full sm:w-auto text-xs">
                Turn Off Pending Links
              </Button>
            ) : (
              <Button size="sm" onClick={handleActivate} disabled={busy} className="w-full sm:w-auto text-xs">
                {everActivated ? 'Turn On Submission' : 'Generate Subject Links'}
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* 3. SUBMISSION MONITORING DASHBOARD (SECTION 7 REQUIREMENT) */}
      <Card className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-800">Class & Group Submission Monitoring</h2>
            <p className="text-xs text-slate-500">
              Track independent subject submission progress, marks entry, and finalization for each class/group.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={expandAll}
              className="font-semibold text-brand-600 hover:text-brand-800 hover:underline"
            >
              Expand All
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={collapseAll}
              className="font-semibold text-slate-500 hover:text-slate-700 hover:underline"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* FILTERS TOOLBAR - RESPONSIVE 2-COL TO 6-COL GRID */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs rounded-xl bg-slate-50 p-2.5 sm:p-3">
          {/* Class Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Class / Year
            </label>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-brand-500 focus:outline-hidden"
            >
              <option value="ALL">All Classes ({uniqueClassNames.length})</option>
              {uniqueClassNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Group Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Group / Stream
            </label>
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-brand-500 focus:outline-hidden"
            >
              <option value="ALL">All Groups ({uniqueGroups.length})</option>
              {uniqueGroups.map((grp) => (
                <option key={grp} value={grp}>
                  {grp}
                </option>
              ))}
            </select>
          </div>

          {/* Section Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Section
            </label>
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-brand-500 focus:outline-hidden"
            >
              <option value="ALL">All Sections</option>
              {uniqueSections.map((sec) => (
                <option key={sec} value={sec}>
                  Section {sec}
                </option>
              ))}
            </select>
          </div>

          {/* Subject Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Subject
            </label>
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-brand-500 focus:outline-hidden"
            >
              <option value="ALL">All Subjects ({uniqueSubjectNames.length})</option>
              {uniqueSubjectNames.map((subj) => (
                <option key={subj} value={subj}>
                  {subj}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-brand-500 focus:outline-hidden"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending Subjects</option>
              <option value="READY">Ready to Finalize</option>
              <option value="FINALIZED">Finalized</option>
            </select>
          </div>

          {/* Search Term */}
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Search
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white pl-7 pr-2 py-1.5 text-xs text-slate-700 focus:border-brand-500 focus:outline-hidden"
              />
              <Search size={13} className="absolute left-2 top-2 text-slate-400" />
            </div>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between text-xs text-slate-500 bg-brand-50/50 px-3 py-1.5 rounded-lg border border-brand-100">
            <span>
              Showing {filteredClasses.length} of {examClasses.length} classes/groups matching active filters
            </span>
            <button
              onClick={resetFilters}
              className="font-semibold text-brand-600 hover:underline inline-flex items-center gap-1"
            >
              <X size={12} /> Clear Filters
            </button>
          </div>
        )}

        {/* CLASS/GROUP MONITORING CARDS LIST */}
        <div className="space-y-4">
          {filteredClasses.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">
              No classes match your filter criteria.
            </div>
          ) : (
            filteredClasses.map((c) => {
              const isExpanded = expandedClasses[c._id] ?? true;
              const isFinalized = !!c.finalResultId;
              const configuredSubjects =
                c.subjects && c.subjects.length > 0 ? c.subjects : session.subjects || [];
              const submittedSubjectsCount = configuredSubjects.filter((s) => s.submitted).length;
              const pendingSubjectsCount = configuredSubjects.length - submittedSubjectsCount;
              const isReady = !isFinalized && configuredSubjects.length > 0 && pendingSubjectsCount === 0;
              const percent =
                configuredSubjects.length > 0
                  ? Math.round((submittedSubjectsCount / configuredSubjects.length) * 100)
                  : 0;

              return (
                <div
                  key={c._id}
                  className={`rounded-xl border transition-all ${
                    isFinalized
                      ? 'border-emerald-200 bg-white shadow-2xs'
                      : isReady
                      ? 'border-brand-300 bg-white shadow-2xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  {/* Class Header */}
                  <div className="p-3.5 sm:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <h3 className="text-sm sm:text-base font-bold text-slate-800 break-words">
                            {c?.displayName || c?.name}
                          </h3>
                          {c.section && !c?.displayName?.includes(c.section) && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                              Section {c.section}
                            </span>
                          )}
                          {isFinalized ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                              <CheckCircle2 size={11} /> Finalized
                            </span>
                          ) : isReady ? (
                            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-800 flex items-center gap-1">
                              <Sparkles size={11} /> Ready to Finalize
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 flex items-center gap-1">
                              <Clock size={11} /> Pending ({submittedSubjectsCount}/{configuredSubjects.length})
                            </span>
                          )}
                        </div>

                        {/* Quick Stats Summary */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                          <span>
                            Students: <strong>{c.studentCount}</strong>
                          </span>
                          <span className="hidden sm:inline">•</span>
                          <span>
                            Subjects: <strong>{configuredSubjects.length}</strong>
                          </span>
                          <span className="hidden sm:inline">•</span>
                          <span className="text-emerald-700">
                            Submitted: <strong>{submittedSubjectsCount}</strong>
                          </span>
                          <span className="hidden sm:inline">•</span>
                          <span className="text-amber-700">
                            Pending: <strong>{pendingSubjectsCount}</strong>
                          </span>
                          <span className="hidden sm:inline">•</span>
                          <span>
                            Progress: <strong>{percent}%</strong>
                          </span>
                        </div>
                      </div>

                      {/* Right Actions & Expand Chevron */}
                      <div className="flex items-center justify-between sm:justify-end gap-1.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        {isFinalized ? (
                          <Button
                            size="sm"
                            onClick={() => navigate(`/results/${c.finalResultId}`)}
                            className="text-xs py-1"
                          >
                            <ExternalLink size={13} /> View Result
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={!isReady || finalizingClassId === c._id}
                            onClick={() => handleGenerateFinalClass(c)}
                            className="text-xs py-1"
                            title={
                              isReady
                                ? 'All subjects submitted. Generate official ranking and result'
                                : `Submit all ${configuredSubjects.length} subjects first`
                            }
                          >
                            <Sparkles size={13} />{' '}
                            {finalizingClassId === c._id ? 'Generating...' : 'Finalize Result'}
                          </Button>
                        )}

                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => promptDeleteClass(c)}
                          title={`Permanently delete ${c?.displayName || c?.name} result data`}
                          className="px-2 py-1"
                        >
                          <Trash2 size={13} />
                        </Button>

                        <button
                          type="button"
                          onClick={() => toggleClassExpand(c._id)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                          title={isExpanded ? 'Collapse subjects' : 'Expand subjects'}
                        >
                          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </button>
                      </div>
                    </div>

                    {/* Progress Bar for THIS Class/Group only */}
                    <div className="mt-2.5 h-1.5 sm:h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          isFinalized
                            ? 'bg-emerald-500'
                            : isReady
                            ? 'bg-brand-500'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  {/* Class Subjects Breakdown Table (Desktop) / Cards (Mobile) */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/50 p-2.5 sm:p-4">
                      {/* MOBILE CARD VIEW FOR SUBJECTS (under 768px) */}
                      <div className="block md:hidden space-y-2.5">
                        {configuredSubjects.map((s) => {
                          const isSub = s.submitted;
                          const isFilteredSubject =
                            subjectFilter !== 'ALL' &&
                            s.name?.trim().toLowerCase() === subjectFilter.trim().toLowerCase();

                          return (
                            <div
                              key={s._id}
                              className={`rounded-lg border p-3 bg-white space-y-2 shadow-2xs ${
                                isFilteredSubject ? 'border-brand-300 ring-1 ring-brand-100' : 'border-slate-200'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className="font-bold text-sm text-slate-800 truncate">{s.name}</p>
                                    {isFilteredSubject && (
                                      <span className="rounded bg-brand-100 px-1 py-0.2 text-[9px] text-brand-700 font-semibold">
                                        filtered
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-500 mt-0.5">
                                    Total: <strong>{s.totalMarks}</strong> • Pass: <strong>{s.passingMarks}</strong>
                                  </p>
                                </div>

                                <div>
                                  {s.status === 'LOCKED' ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                      <Lock size={10} /> Locked
                                    </span>
                                  ) : isSub ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                                      <CheckCircle2 size={10} /> Submitted
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                      <Clock size={10} /> Pending
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-md">
                                <span>Marks Entry:</span>
                                <span className={isSub ? 'font-semibold text-emerald-700' : 'text-slate-400'}>
                                  {isSub ? `${s.submittedCount || s.studentCount} / ${s.studentCount} entered` : `0 / ${s.studentCount} entered`}
                                </span>
                              </div>

                              {s.submittedAt && (
                                <p className="text-[10px] text-slate-400">
                                  Submitted: {new Date(s.submittedAt).toLocaleDateString()} {new Date(s.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  {s.submittedVia && ` via ${s.submittedVia === 'public' ? 'link' : 'teacher'}`}
                                </p>
                              )}

                              {/* Action Buttons */}
                              <div className="flex items-center gap-2 pt-1">
                                {isSub ? (
                                  <>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => openClassMarks(s, c)}
                                      className="flex-1 text-xs py-1"
                                    >
                                      View Marks
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => promptReopen(s, c)}
                                      className="text-xs py-1"
                                    >
                                      Reopen
                                    </Button>
                                  </>
                                ) : s.submissionToken ? (
                                  <button
                                    onClick={() => copy(submissionUrl(s.submissionToken), 'Link')}
                                    className="text-xs font-semibold text-brand-600 hover:underline inline-flex items-center gap-1 py-1"
                                  >
                                    <Copy size={11} /> Copy Public Link
                                  </button>
                                ) : (
                                  <span className="text-xs text-slate-400 italic">Link Inactive</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* DESKTOP TABLE VIEW (768px and up) */}
                      <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 bg-white">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                            <tr>
                              <th className="px-3 py-2">Subject Name</th>
                              <th className="px-3 py-2">Configuration</th>
                              <th className="px-3 py-2">Status</th>
                              <th className="px-3 py-2">Student Marks Completion</th>
                              <th className="px-3 py-2">Submission Date/Time</th>
                              <th className="px-3 py-2 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {configuredSubjects.map((s) => {
                              const isSub = s.submitted;
                              const isFilteredSubject =
                                subjectFilter !== 'ALL' &&
                                s.name?.trim().toLowerCase() === subjectFilter.trim().toLowerCase();

                              return (
                                <tr
                                  key={s._id}
                                  className={`transition-colors ${
                                    isFilteredSubject
                                      ? 'bg-brand-50/40 font-medium'
                                      : 'hover:bg-slate-50/80'
                                  }`}
                                >
                                  {/* Subject Name */}
                                  <td className="px-3 py-2.5 font-bold text-slate-800">
                                    <div className="flex items-center gap-1.5">
                                      <span>{s.name}</span>
                                      {isFilteredSubject && (
                                        <span className="rounded bg-brand-100 px-1 py-0.2 text-[10px] text-brand-700">
                                          filtered
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Marks Config */}
                                  <td className="px-3 py-2.5 text-slate-600">
                                    Total: <strong>{s.totalMarks}</strong> • Pass:{' '}
                                    <strong>{s.passingMarks}</strong>
                                  </td>

                                  {/* Status */}
                                  <td className="px-3 py-2.5">
                                    {s.status === 'LOCKED' ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                        <Lock size={11} /> Locked
                                      </span>
                                    ) : isSub ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                        <CheckCircle2 size={11} /> Submitted
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                        <Clock size={11} /> Pending
                                      </span>
                                    )}
                                  </td>

                                  {/* Student Marks Entry Completion */}
                                  <td className="px-3 py-2.5 text-slate-700">
                                    {isSub ? (
                                      <span className="font-semibold text-emerald-700">
                                        {s.submittedCount || s.studentCount} / {s.studentCount} students entered
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">
                                        0 / {s.studentCount} students entered
                                      </span>
                                    )}
                                  </td>

                                  {/* Submission Date / Time */}
                                  <td className="px-3 py-2.5 text-slate-500">
                                    {s.submittedAt ? (
                                      <div>
                                        <p>{new Date(s.submittedAt).toLocaleString()}</p>
                                        <p className="text-[10px] text-slate-400">
                                          via {s.submittedVia === 'public' ? 'link submitter' : 'teacher'}
                                        </p>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 italic">Not submitted yet</span>
                                    )}
                                  </td>

                                  {/* Subject Actions */}
                                  <td className="px-3 py-2.5 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      {isSub ? (
                                        <>
                                          <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => openClassMarks(s, c)}
                                            className="text-xs py-1"
                                          >
                                            View Marks
                                          </Button>
                                          <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => promptReopen(s, c)}
                                            title="Reopen submission for this class only"
                                            className="text-xs py-1"
                                          >
                                            Reopen
                                          </Button>
                                        </>
                                      ) : s.submissionToken ? (
                                        <button
                                          onClick={() => copy(submissionUrl(s.submissionToken), 'Link')}
                                          className="text-xs font-semibold text-brand-600 hover:underline inline-flex items-center gap-1"
                                        >
                                          <Copy size={11} /> Copy Link
                                        </button>
                                      ) : (
                                        <span className="text-xs text-slate-400">Link Inactive</span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* 4. SUBJECT-SPECIFIC SUBMISSION LINKS (SECTION 4 REQUIREMENT) */}
      <Card className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-slate-800">Subject Submission Links</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {session.subjects.length} Unique Subjects
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Each link covers only the class/group combinations configured with that subject in this exam.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLinksSectionExpanded(!linksSectionExpanded)}
            className="text-xs font-semibold text-brand-600 hover:underline inline-flex items-center gap-1"
          >
            {linksSectionExpanded ? 'Hide Links Section' : 'Show Links Section'}
          </button>
        </div>

        {linksSectionExpanded && (
          <div className="space-y-3">
            {session.subjects.map((subj) => {
              const isComplete = subj.submitted;
              const submittedCount = subj.classesSubmitted || 0;
              const totalClassesCount = subj.totalClasses || 1;
              const percent = Math.round((submittedCount / totalClassesCount) * 100);
              const isRowBusy = rowBusy === subj._id;

              return (
                <div
                  key={subj._id}
                  className={`rounded-xl border p-3.5 sm:p-4 transition-all ${
                    isComplete
                      ? 'border-emerald-200 bg-white shadow-2xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <h3 className="text-sm sm:text-base font-bold text-slate-800">{subj.name}</h3>
                        {subj.linkStatus === 'DISABLED' ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                            Disabled
                          </span>
                        ) : isComplete ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 size={11} /> Complete
                          </span>
                        ) : submittedCount > 0 ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 flex items-center gap-1">
                            <Clock size={11} /> In Progress ({submittedCount}/{totalClassesCount})
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            Pending (0/{totalClassesCount})
                          </span>
                        )}
                      </div>

                      {/* Authorized Classes Covered by this Subject Link */}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          Authorized Classes ({totalClassesCount}):
                        </span>
                        {subj.classSubmissions?.map((cs) => {
                          const isCsDone = cs.status === 'SUBMITTED' || cs.status === 'LOCKED';
                          return (
                            <span
                              key={cs.classId}
                              className={`rounded-md px-1.5 sm:px-2 py-0.5 text-[11px] font-medium border ${
                                isCsDone
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-slate-50 text-slate-700 border-slate-200'
                              }`}
                            >
                              {cs?.displayName || `${cs?.className || ''}${cs?.group ? ` ${cs.group}` : ''}`}
                              {isCsDone ? ' ✓' : ''}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    <div className="text-left sm:text-right text-xs text-slate-500 shrink-0">
                      <strong>
                        {submittedCount} / {totalClassesCount} Submitted ({percent}%)
                      </strong>
                    </div>
                  </div>

                  {/* Submission Link Action Bar - RESPONSIVE MOBILE WRAP */}
                  {subj.submissionToken ? (
                    <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 sm:p-2.5 border border-slate-100 text-xs">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-slate-500 text-[11px]">Token:</span>
                        <code className="rounded bg-white px-2 py-0.5 font-mono font-bold text-slate-800 border border-slate-200 text-xs">
                          {subj.submissionToken}
                        </code>
                        <button
                          onClick={() => copy(subj.submissionToken, 'Code')}
                          className="text-slate-500 hover:text-slate-800 inline-flex items-center gap-0.5 text-[11px]"
                          title="Copy Token"
                        >
                          <Copy size={11} /> Copy Code
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-200">
                        <button
                          onClick={() => copy(submissionUrl(subj.submissionToken), 'Link')}
                          className="font-semibold text-brand-600 hover:underline inline-flex items-center gap-0.5 text-[11px]"
                        >
                          Copy URL
                        </button>
                        <button
                          onClick={() => shareLink(subj.name, subj.submissionToken)}
                          className="font-semibold text-brand-600 hover:underline inline-flex items-center gap-0.5 text-[11px]"
                        >
                          <Share2 size={11} /> Share
                        </button>
                        <button
                          onClick={() => handleRegenerate(subj._id, subj.name)}
                          disabled={isRowBusy}
                          className="text-slate-500 hover:text-slate-800 inline-flex items-center gap-0.5 text-[11px]"
                          title="Regenerate this link (old link stops working immediately)"
                        >
                          <RefreshCw size={11} /> New Link
                        </button>
                        {subj.linkStatus === 'DISABLED' ? (
                          <button
                            onClick={() => handleEnable(subj._id)}
                            disabled={isRowBusy}
                            className="font-semibold text-emerald-600 hover:underline text-[11px] ml-auto"
                          >
                            Re-enable
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDisable(subj._id)}
                            disabled={isRowBusy}
                            className="font-semibold text-red-500 hover:underline text-[11px] ml-auto"
                          >
                            Disable
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-slate-400 italic">
                      Activate submission to generate secure links for this subject.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 5. INSPECT & EDIT MARKS MODAL (PER CLASS & SUBJECT) */}
      <Modal
        open={!!inspectingSubject}
        onClose={() => {
          setInspectingSubject(null);
          setInspectingClass(null);
        }}
        title={
          inspectingSubject && inspectingClass
            ? `${inspectingSubject.name || ''} — ${inspectingClass?.displayName || inspectingClass?.className || 'Class'} Marks`
            : ''
        }
        footer={
          submissionDetail && !editMode ? (
            <div className="flex flex-wrap items-center gap-2 justify-end w-full">
              {submissionDetail.status !== 'LOCKED' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => promptReopen(inspectingSubject, inspectingClass)}
                  disabled={actionBusy}
                  className="text-xs"
                >
                  Reopen This Class
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={toggleLock} disabled={actionBusy} className="text-xs">
                {submissionDetail.status === 'LOCKED' ? (
                  <>
                    <Unlock size={13} /> Unlock
                  </>
                ) : (
                  <>
                    <Lock size={13} /> Lock
                  </>
                )}
              </Button>
              {submissionDetail.status !== 'LOCKED' && (
                <Button size="sm" onClick={enterEditMode} disabled={actionBusy} className="text-xs">
                  <Pencil size={13} /> Edit Marks
                </Button>
              )}
            </div>
          ) : editMode ? (
            <div className="flex flex-wrap items-center gap-2 justify-end w-full">
              <Button variant="secondary" size="sm" onClick={() => setEditMode(false)} disabled={actionBusy} className="text-xs">
                Cancel
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={actionBusy} className="text-xs">
                {actionBusy ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          ) : null
        }
      >
        {loadingDetail ? (
          <Skeleton className="h-48 w-full" />
        ) : !submissionDetail ? null : editMode ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
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
            <div className="max-h-64 sm:max-h-72 space-y-2 overflow-y-auto pr-1">
              {(submissionDetail.rows || []).map((r) => (
                <div key={r.rollNumber} className="flex items-center gap-2 sm:gap-3 py-1">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs sm:text-sm font-medium text-slate-800">{r.name}</p>
                    <p className="text-[11px] text-slate-400">Roll {r.rollNumber}</p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={editTotal}
                    className="w-20 sm:w-24 text-center font-bold text-xs sm:text-sm"
                    value={editMarks[r.rollNumber] ?? ''}
                    onChange={(e) => setEditMarks({ ...editMarks, [r.rollNumber]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs text-slate-500">
              <span className="break-words">
                Class:{' '}
                <strong>
                  {inspectingClass?.displayName || inspectingClass?.className || submissionDetail?.className || 'Class'}
                </strong>{' '}
                • Submitted{' '}
                {submissionDetail.submittedAt
                  ? new Date(submissionDetail.submittedAt).toLocaleString()
                  : 'N/A'}{' '}
                via {submissionDetail.submittedVia === 'public' ? 'link submitter' : 'teacher'}
              </span>
              {submissionDetail.status === 'LOCKED' && (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 flex items-center gap-1">
                  <Lock size={11} /> Locked
                </span>
              )}
            </div>

            <div className="max-h-72 sm:max-h-80 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="px-2.5 sm:px-3 py-2">Roll</th>
                    <th className="px-2.5 sm:px-3 py-2">Name</th>
                    <th className="px-2.5 sm:px-3 py-2">Marks</th>
                    <th className="px-2.5 sm:px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(submissionDetail.rows || []).map((r) => (
                    <tr key={r.rollNumber}>
                      <td className="px-2.5 sm:px-3 py-1.5 font-mono text-xs text-slate-600">{r.rollNumber}</td>
                      <td className="px-2.5 sm:px-3 py-1.5 font-medium text-slate-800">{r.name}</td>
                      <td className="px-2.5 sm:px-3 py-1.5 font-bold text-slate-700">
                        {r.obtained}/{r.totalMarks}
                      </td>
                      <td className="px-2.5 sm:px-3 py-1.5">
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

      {/* 6. REOPEN CONFIRMATION MODAL */}
      <Modal
        open={!!reopeningTarget}
        onClose={() => setReopeningTarget(null)}
        title="Reopen Results?"
        footer={
          <div className="flex items-center gap-2 justify-end w-full">
            <Button variant="secondary" size="sm" onClick={() => setReopeningTarget(null)} disabled={actionBusy}>
              Cancel
            </Button>
            <Button size="sm" onClick={confirmReopen} disabled={actionBusy}>
              {actionBusy ? 'Reopening...' : 'Reopen Results'}
            </Button>
          </div>
        }
      >
        {reopeningTarget && (
          <div className="space-y-3 text-xs sm:text-sm text-slate-600">
            <p>
              Reopen <strong>{reopeningTarget.classSub?.displayName || reopeningTarget.classSub?.className}</strong> marks for{' '}
              <strong>{reopeningTarget.subject?.name}</strong>?
            </p>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
              This will clear the submitted marks for{' '}
              {reopeningTarget.classSub?.displayName || reopeningTarget.classSub?.className} and allow the
              submitter to enter and resubmit using the same link. Other classes and groups will remain
              completely unaffected.
            </div>
          </div>
        )}
      </Modal>

      {/* 7. REGENERATE LINK CONFIRMATION MODAL */}
      <Modal
        open={!!regeneratingTarget}
        onClose={() => setRegeneratingTarget(null)}
        title="Regenerate Subject Submission Link?"
        footer={
          <div className="flex items-center gap-2 justify-end w-full">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRegeneratingTarget(null)}
              disabled={rowBusy === regeneratingTarget?.subjectId}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={rowBusy === regeneratingTarget?.subjectId}
              onClick={() => {
                if (!regeneratingTarget) return;
                const { subjectId } = regeneratingTarget;
                setRegeneratingTarget(null);
                withRowBusy(subjectId, async () => {
                  await resultSessionsApi.regenerateSubjectToken(id, subjectId);
                  toast.success('New link generated');
                });
              }}
            >
              Regenerate Link
            </Button>
          </div>
        }
      >
        {regeneratingTarget && (
          <div className="space-y-3 text-xs sm:text-sm text-slate-600">
            <p>
              Are you sure you want to generate a new submission link for{' '}
              <strong>{regeneratingTarget.name}</strong>?
            </p>
            <ul className="list-inside list-disc space-y-1 text-xs text-slate-500">
              <li>The old link will stop working immediately.</li>
              <li>Existing submitted marks for all classes remain safe and intact.</li>
              <li>Class submission statuses will remain untouched.</li>
              <li>Submitters must use the new link to access or submit remaining classes.</li>
            </ul>
          </div>
        )}
      </Modal>

      {/* 8. STRONG PERMANENT DELETION MODAL (SECTION 9 REQUIREMENT) */}
      <PermanentDeleteModal
        open={deleteModalState.open}
        onClose={() => setDeleteModalState({ open: false, isEntireExam: false, targetClass: null })}
        onConfirm={executePermanentDeletion}
        title={
          deleteModalState.isEntireExam
            ? 'Delete Entire Examination Permanently?'
            : `Delete ${deleteModalState.targetClass?.displayName || deleteModalState.targetClass?.name} Result Permanently?`
        }
        examName={session.examName || session.examType}
        targetName={
          deleteModalState.isEntireExam
            ? 'Entire Examination (All Classes)'
            : deleteModalState.targetClass?.displayName || deleteModalState.targetClass?.name
        }
        targetLabel={deleteModalState.isEntireExam ? 'Scope' : 'Class / Group'}
        isEntireExam={deleteModalState.isEntireExam}
        busy={deleteBusy}
      />
    </div>
  );
}
