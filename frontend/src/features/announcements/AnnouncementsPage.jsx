import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { announcementsApi } from '../../api/announcementsApi';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';

const TYPE_STYLES = {
  information: 'border-brand-200 bg-brand-50 text-brand-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  maintenance: 'border-slate-300 bg-slate-100 text-slate-700',
  important: 'border-red-200 bg-red-50 text-red-800',
};

const emptyForm = { title: '', message: '', type: 'information', startDate: '', endDate: '' };

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    announcementsApi.list().then(({ data }) => setItems(data.announcements)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function handleCreate(e) {
    e.preventDefault();
    try {
      await announcementsApi.create(form);
      toast.success('Announcement created');
      setForm(emptyForm);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create announcement');
    }
  }

  async function remove(id) {
    try {
      await announcementsApi.remove(id);
      toast.success('Announcement deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">Announcements</h1>

      {user.role === 'super_admin' && (
        <Card>
          <form onSubmit={handleCreate} className="space-y-3">
            <Input label="Title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Message</label>
              <textarea
                required
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                rows={3}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="information">Information</option>
                <option value="warning">Warning</option>
                <option value="maintenance">Maintenance</option>
                <option value="important">Important</option>
              </select>
              <Input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              <Input type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
            <Button type="submit">Create Announcement</Button>
          </form>
        </Card>
      )}

      <div className="space-y-3">
        {!loading && items.length === 0 && <EmptyState title="No announcements" />}
        {items.map((a) => (
          <Card key={a._id} className={`border ${TYPE_STYLES[a.type]}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">{a.title}</p>
                <p className="mt-1 text-sm">{a.message}</p>
                <p className="mt-2 text-xs opacity-70">
                  {new Date(a.startDate).toLocaleDateString()} – {new Date(a.endDate).toLocaleDateString()}
                </p>
              </div>
              {user.role === 'super_admin' && (
                <button onClick={() => remove(a._id)} className="text-xs font-medium underline">Delete</button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
