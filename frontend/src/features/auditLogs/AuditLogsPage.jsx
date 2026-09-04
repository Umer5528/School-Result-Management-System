import React, { useEffect, useState } from 'react';
import { auditApi } from '../../api/auditApi';
import Card from '../../components/ui/Card';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';

export default function AuditLogsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auditApi.list({ limit: 50 }).then(({ data }) => setItems(data.items)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-800">Activity Logs</h1>
      <Card>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : items.length === 0 ? (
          <EmptyState title="No activity recorded yet" />
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {items.map((log) => (
              <li key={log._id} className="py-3">
                <p>
                  <span className="font-medium text-slate-800">{log.user?.name || 'Unknown user'}</span>{' '}
                  <span className="text-slate-500">— {log.action.replace(/_/g, ' ').toLowerCase()}</span>
                </p>
                <p className="text-xs text-slate-400">{new Date(log.timestamp).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
