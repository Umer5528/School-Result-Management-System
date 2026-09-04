import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { teachersApi } from '../../api/teachersApi';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';

export default function PendingApprovalsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [reason, setReason] = useState('');

  function load() {
    setLoading(true);
    teachersApi.pending().then(({ data }) => setItems(data.items)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function approve(id) {
    try {
      await teachersApi.approve(id);
      toast.success('Teacher approved');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve');
    }
  }

  async function confirmReject() {
    try {
      await teachersApi.reject(rejectTarget, reason);
      toast.success('Teacher rejected');
      setRejectTarget(null);
      setReason('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject');
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-800">Pending Registrations</h1>
      <Card>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : items.length === 0 ? (
          <EmptyState title="No pending registrations" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Designation</th>
                  <th className="py-2 pr-3">Registered</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-800">{t.name}</td>
                    <td className="py-2 pr-3">{t.email}</td>
                    <td className="py-2 pr-3">{t.designation}</td>
                    <td className="py-2 pr-3">{new Date(t.createdAt).toLocaleDateString()}</td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-2">
                        <Button onClick={() => approve(t.id)}>Approve</Button>
                        <Button variant="danger" onClick={() => setRejectTarget(t.id)}>Reject</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject this teacher's registration?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmReject}>Reject</Button>
          </>
        }
      >
        <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </div>
  );
}
