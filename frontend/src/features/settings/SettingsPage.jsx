import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { settingsApi } from '../../api/settingsApi';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';

export default function SettingsPage() {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsApi.get().then(({ data }) => setForm(data.settings));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await settingsApi.update(form);
      setForm(data.settings);
      toast.success('Settings updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  }

  if (!form) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-800">System Settings</h1>
      <Card>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="System Name" value={form.systemName || ''} onChange={(e) => setForm({ ...form, systemName: e.target.value })} />
          <Input label="School Name" value={form.schoolName || ''} onChange={(e) => setForm({ ...form, schoolName: e.target.value })} />
          <Input label="Admin Email" type="email" value={form.adminEmail || ''} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
          <Input label="Admin Phone" value={form.adminPhone || ''} onChange={(e) => setForm({ ...form, adminPhone: e.target.value })} />
          <Input label="Logo URL" value={form.logoUrl || ''} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} />
          <Input label="Default Academic Year" value={form.defaultAcademicYear || ''} onChange={(e) => setForm({ ...form, defaultAcademicYear: e.target.value })} />
          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
