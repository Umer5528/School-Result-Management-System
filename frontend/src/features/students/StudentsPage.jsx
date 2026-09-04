import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, RotateCcw, Trash2, UploadCloud, UserX } from 'lucide-react';
import { studentsApi } from '../../api/studentsApi';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import { useDebounce } from '../../hooks/useDebounce';

const emptyForm = { rollNumber: '', name: '', fatherName: '', class: '', section: '', academicYear: '', studentId: '' };

export default function StudentsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  // Defaults to Active so deactivating a student visibly removes them
  // from the default view instead of appearing to do nothing.
  const [filters, setFilters] = useState({ class: '', section: '', academicYear: '', search: '', status: 'active' });
  const debouncedSearch = useDebounce(filters.search);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Bulk import state
  const [importOpen, setImportOpen] = useState(false);
  const [importMeta, setImportMeta] = useState({ class: '', section: '', academicYear: '' });
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);

  function load() {
    setLoading(true);
    const params = { class: filters.class, section: filters.section, academicYear: filters.academicYear, search: debouncedSearch };
    if (filters.status !== 'all') params.active = filters.status === 'active';
    studentsApi
      .list(params)
      .then(({ data }) => setItems(data.items))
      .finally(() => setLoading(false));
  }

  useEffect(load, [debouncedSearch, filters.class, filters.section, filters.academicYear, filters.status]); // eslint-disable-line

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await studentsApi.create(form);
      toast.success('Student added');
      setModalOpen(false);
      setForm(emptyForm);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add student');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id) {
    try {
      await studentsApi.deactivate(id);
      toast.success('Student deactivated');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to deactivate');
    }
  }

  async function handleReactivate(id) {
    try {
      await studentsApi.reactivate(id);
      toast.success('Student reactivated');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reactivate');
    }
  }

  async function handleDelete(student) {
    if (!window.confirm(`Permanently delete ${student.name} (Roll ${student.rollNumber})? This cannot be undone.`)) return;
    try {
      await studentsApi.remove(student._id);
      toast.success('Student deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete student');
    }
  }

  // Paste-friendly bulk import: one student per line, tab or comma separated
  // "rollNumber, name, fatherName" -- matches how a teacher's spreadsheet
  // roster is usually laid out, so they can paste straight from Excel.
  async function handleBulkImport(e) {
    e.preventDefault();
    const rows = importText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\t|,/).map((p) => p.trim());
        return { rollNumber: parts[0] || '', name: parts[1] || '', fatherName: parts[2] || '' };
      });

    if (rows.length === 0) {
      toast.error('Paste at least one student row');
      return;
    }
    setImporting(true);
    try {
      const { data } = await studentsApi.bulkImport({ ...importMeta, students: rows });
      toast.success(`${data.count} students imported`);
      setImportOpen(false);
      setImportText('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800">Students</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            <UploadCloud size={16} /> Bulk Import
          </Button>
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} /> Add Student
          </Button>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          <Input placeholder="Search name / roll / ID" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
          <Input placeholder="Class" value={filters.class} onChange={(e) => setFilters({ ...filters, class: e.target.value })} />
          <Input placeholder="Section" value={filters.section} onChange={(e) => setFilters({ ...filters, section: e.target.value })} />
          <Input placeholder="Academic Year" value={filters.academicYear} onChange={(e) => setFilters({ ...filters, academicYear: e.target.value })} />
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : items.length === 0 ? (
          <EmptyState title="No students yet" description="Add students individually or bulk import a class roster." />
        ) : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3">Roll No</th>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Father Name</th>
                <th className="py-2 pr-3">Class</th>
                <th className="py-2 pr-3">Section</th>
                <th className="py-2 pr-3">Year</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s._id} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{s.rollNumber}</td>
                  <td className="py-2 pr-3 font-medium text-slate-800">{s.name}</td>
                  <td className="py-2 pr-3">{s.fatherName || '-'}</td>
                  <td className="py-2 pr-3">{s.class}</td>
                  <td className="py-2 pr-3">{s.section || '-'}</td>
                  <td className="py-2 pr-3">{s.academicYear}</td>
                  <td className="py-2 pr-3">
                    {s.active ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Active</span>
                    ) : (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">Inactive</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-3">
                      {s.active ? (
                        <button onClick={() => handleDeactivate(s._id)} className="text-slate-400 hover:text-amber-600" title="Deactivate">
                          <UserX size={16} />
                        </button>
                      ) : (
                        <button onClick={() => handleReactivate(s._id)} className="text-slate-400 hover:text-emerald-600" title="Reactivate">
                          <RotateCcw size={16} />
                        </button>
                      )}
                      <button onClick={() => handleDelete(s)} className="text-slate-400 hover:text-red-600" title="Delete permanently">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Student"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? 'Saving...' : 'Add Student'}</Button>
          </>
        }
      >
        <form className="space-y-3" onSubmit={handleCreate}>
          <Input label="Roll Number" required value={form.rollNumber} onChange={(e) => setForm({ ...form, rollNumber: e.target.value })} />
          <Input label="Student Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Father Name" value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Class" required value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })} />
            <Input label="Section" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />
          </div>
          <Input label="Academic Year" required value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} />
        </form>
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Bulk Import Students"
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkImport} disabled={importing}>{importing ? 'Importing...' : 'Import'}</Button>
          </>
        }
      >
        <form className="space-y-3" onSubmit={handleBulkImport}>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Class" required value={importMeta.class} onChange={(e) => setImportMeta({ ...importMeta, class: e.target.value })} />
            <Input label="Section" value={importMeta.section} onChange={(e) => setImportMeta({ ...importMeta, section: e.target.value })} />
          </div>
          <Input label="Academic Year" required value={importMeta.academicYear} onChange={(e) => setImportMeta({ ...importMeta, academicYear: e.target.value })} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Paste roster (one per line)</label>
            <textarea
              className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
              rows={8}
              placeholder={'1, Ali Khan, Ahmed Khan\n2, Hamza Khan, Rashid Khan'}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <p className="text-xs text-slate-400">Roll number, name, father name — comma or tab separated. Paste straight from Excel.</p>
          </div>
        </form>
      </Modal>
    </div>
  );
}
