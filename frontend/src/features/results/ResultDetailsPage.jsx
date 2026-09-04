import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Download, FileSpreadsheet, Pencil } from 'lucide-react';
import { resultsApi } from '../../api/resultsApi';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/ui/Card';
import Skeleton from '../../components/ui/Skeleton';
import StatusBadge from '../../components/ui/StatusBadge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';

export default function ResultDetailsPage() {
  const { id } = useParams();
  const { user, hasPermission } = useAuth();
  const [result, setResult] = useState(null);
  const [downloading, setDownloading] = useState(null); // 'pdf' | 'excel' | null

  const [overriding, setOverriding] = useState(null); // the student row being overridden, or null
  const [overrideChoice, setOverrideChoice] = useState('PASS');
  const [overrideReason, setOverrideReason] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);

  useEffect(() => {
    resultsApi.get(id).then(({ data }) => setResult(data.result));
  }, [id]);

  async function handleDownload(type) {
    setDownloading(type);
    try {
      if (type === 'pdf') await resultsApi.downloadPdf(id);
      else await resultsApi.downloadExcel(id);
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to download ${type.toUpperCase()}`);
    } finally {
      setDownloading(null);
    }
  }

  function openOverride(student) {
    setOverriding(student);
    setOverrideChoice(student.overriddenStatus || student.status);
    setOverrideReason(student.overrideReason || '');
  }

  async function saveOverride() {
    setSavingOverride(true);
    try {
      const { data } = await resultsApi.overrideStudentStatus(id, overriding.rollNumber, {
        status: overrideChoice,
        reason: overrideReason || undefined,
      });
      setResult(data.result);
      toast.success('Student result updated');
      setOverriding(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update result');
    } finally {
      setSavingOverride(false);
    }
  }

  async function clearOverride() {
    setSavingOverride(true);
    try {
      const { data } = await resultsApi.overrideStudentStatus(id, overriding.rollNumber, { status: null });
      setResult(data.result);
      toast.success('Override cleared — reverted to calculated result');
      setOverriding(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to clear override');
    } finally {
      setSavingOverride(false);
    }
  }

  if (!result) {
    return <Skeleton className="h-64 w-full" />;
  }

  const isOwner = result.createdBy === user.id;
  const canOverride = isOwner || hasPermission('MANAGE_RESULTS');
  const sorted = [...result.students].sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">{result.schoolInfo?.name || 'School'}</h1>
            {result.schoolInfo?.address && <p className="text-sm text-slate-500">{result.schoolInfo.address}</p>}
            <p className="mt-2 text-sm font-medium text-slate-700">
              {result.examName || result.examType} — {result.academicYear}
            </p>
            <p className="text-sm text-slate-500">
              Class {result.class}{result.section ? ` - ${result.section}` : ''} • {new Date(result.resultDate).toLocaleDateString()}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => handleDownload('pdf')} disabled={downloading === 'pdf'}>
              <Download size={16} /> {downloading === 'pdf' ? 'Preparing...' : 'PDF'}
            </Button>
            <Button variant="secondary" onClick={() => handleDownload('excel')} disabled={downloading === 'excel'}>
              <FileSpreadsheet size={16} /> {downloading === 'excel' ? 'Preparing...' : 'Excel'}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2 pr-3">Pos</th>
              <th className="py-2 pr-3">Roll No</th>
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Father</th>
              {result.subjects.map((s) => (
                <th key={s.name} className="py-2 pr-3">{s.name}</th>
              ))}
              <th className="py-2 pr-3">Total</th>
              <th className="py-2 pr-3">%</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Remarks</th>
              {canOverride && <th className="py-2 pr-3" />}
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => {
              const marksBySubject = Object.fromEntries(s.marks.map((m) => [m.subject, m.obtained]));
              const effectiveStatus = s.overriddenStatus || s.status;
              const isOverridden = !!s.overriddenStatus && s.overriddenStatus !== s.status;
              const hasFailedSubjects = s.failedSubjects && s.failedSubjects.length > 0;
              return (
                <tr key={s.rollNumber} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{s.position}</td>
                  <td className="py-2 pr-3">{s.rollNumber}</td>
                  <td className="py-2 pr-3">{s.name}</td>
                  <td className="py-2 pr-3">{s.fatherName || '-'}</td>
                  {result.subjects.map((subj) => (
                    <td key={subj.name} className="py-2 pr-3">{marksBySubject[subj.name]}</td>
                  ))}
                  <td className="py-2 pr-3">{s.totalObtained}/{s.totalMax}</td>
                  <td className="py-2 pr-3">{s.percentage}%</td>
                  <td className="py-2 pr-3">
                    <StatusBadge status={effectiveStatus} />
                    {isOverridden && <span className="ml-1 text-[10px] font-medium text-amber-600">(overridden)</span>}
                  </td>
                  <td className="py-2 pr-3">
                    {hasFailedSubjects ? (
                      <span className="text-xs text-red-600">Failed: {s.failedSubjects.join(', ')}</span>
                    ) : (
                      <span className="text-xs text-slate-300">-</span>
                    )}
                  </td>
                  {canOverride && (
                    <td className="py-2 pr-3">
                      <button onClick={() => openOverride(s)} className="text-slate-400 hover:text-slate-700" title="Override result">
                        <Pencil size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Summary</h2>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div><p className="text-slate-500">Total Students</p><p className="font-semibold">{result.statistics.totalStudents}</p></div>
          <div><p className="text-slate-500">Passed</p><p className="font-semibold text-emerald-600">{result.statistics.passed}</p></div>
          <div><p className="text-slate-500">Failed</p><p className="font-semibold text-red-600">{result.statistics.failed}</p></div>
          <div><p className="text-slate-500">Pass %</p><p className="font-semibold">{result.statistics.passPercentage}%</p></div>
          <div><p className="text-slate-500">Highest</p><p className="font-semibold">{result.statistics.highest}</p></div>
          <div><p className="text-slate-500">Lowest</p><p className="font-semibold">{result.statistics.lowest}</p></div>
          <div><p className="text-slate-500">Average</p><p className="font-semibold">{result.statistics.average}</p></div>
        </div>
      </Card>

      <Modal
        open={!!overriding}
        onClose={() => setOverriding(null)}
        title={overriding ? `Override Result — ${overriding.name}` : ''}
        footer={
          <>
            {overriding?.overriddenStatus && (
              <Button variant="secondary" onClick={clearOverride} disabled={savingOverride}>
                Clear Override
              </Button>
            )}
            <Button onClick={saveOverride} disabled={savingOverride}>
              {savingOverride ? 'Saving...' : 'Save'}
            </Button>
          </>
        }
      >
        {overriding && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="text-slate-500">Calculated result (permanent record — never changes)</p>
              <p className="mt-1 font-medium text-slate-800">
                {overriding.status}
                {overriding.failedSubjects?.length > 0 && (
                  <span className="ml-2 text-red-600">— Failed: {overriding.failedSubjects.join(', ')}</span>
                )}
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Final decision</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={overrideChoice === 'PASS'} onChange={() => setOverrideChoice('PASS')} />
                  Pass
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={overrideChoice === 'FAIL'} onChange={() => setOverrideChoice('FAIL')} />
                  Fail
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Reason (optional, kept in the audit log)</label>
              <textarea
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                rows={3}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g. Borderline case, promoted by teacher discretion"
              />
            </div>

            {overriding.failedSubjects?.length > 0 && (
              <p className="text-xs text-slate-400">
                Even if you set this to Pass, "Failed: {overriding.failedSubjects.join(', ')}" will still show on the
                result, PDF, and Excel — the calculated record is never erased, only the final decision changes.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
