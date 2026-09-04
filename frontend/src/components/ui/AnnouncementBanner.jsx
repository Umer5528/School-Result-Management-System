import React, { useEffect, useState } from 'react';
import { AlertTriangle, Info, Megaphone, Wrench } from 'lucide-react';
import { announcementsApi } from '../../api/announcementsApi';

const ICONS = { information: Info, warning: AlertTriangle, maintenance: Wrench, important: Megaphone };
const STYLES = {
  information: 'bg-brand-50 text-brand-800 border-brand-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  maintenance: 'bg-slate-100 text-slate-700 border-slate-300',
  important: 'bg-red-50 text-red-800 border-red-200',
};

// Surfaces active announcements at the top of every dashboard page —
// per spec, announcements must be visible app-wide, not just on their
// own page. Fetched once per layout mount, dismissible per-session.
export default function AnnouncementBanner() {
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState([]);

  useEffect(() => {
    announcementsApi.list().then(({ data }) => setItems(data.announcements)).catch(() => {});
  }, []);

  const visible = items.filter((a) => !dismissed.includes(a._id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 px-4 pt-3 lg:px-8">
      {visible.map((a) => {
        const Icon = ICONS[a.type] || Info;
        return (
          <div key={a._id} className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${STYLES[a.type]}`}>
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <Icon size={16} className="mt-0.5 shrink-0" />
              <div className="min-w-0 break-words">
                <span className="font-medium">{a.title}:</span> {a.message}
              </div>
            </div>
            <button
              onClick={() => setDismissed((d) => [...d, a._id])}
              className="shrink-0 opacity-60 hover:opacity-100"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
