import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';

export default function PermanentDeleteModal({
  open,
  onClose,
  onConfirm,
  title = 'Permanently Delete Result?',
  examName = '',
  targetName = '', // e.g. "1st Year" or "Entire Examination"
  targetLabel = 'Class', // e.g. "Class" or "Scope"
  isEntireExam = false,
  busy = false,
}) {
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    if (open) setConfirmText('');
  }, [open]);

  const isConfirmed = confirmText === 'DELETE';

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title=""
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!isConfirmed || busy}
            onClick={() => {
              if (isConfirmed) onConfirm();
            }}
          >
            {busy ? 'Deleting Permanently...' : 'Permanently Delete'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 text-red-600">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle size={20} />
          </div>
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
        </div>

        <p className="text-sm text-slate-600">You are about to permanently delete:</p>

        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          {examName && (
            <p className="text-slate-600">
              <span className="font-semibold text-slate-700">Exam:</span> {examName}
            </p>
          )}
          {targetName && (
            <p className="mt-1 text-slate-600">
              <span className="font-semibold text-slate-700">{targetLabel}:</span> {targetName}
            </p>
          )}
        </div>

        <div className="text-sm text-slate-600">
          <p className="font-medium text-slate-700">This will permanently remove:</p>
          <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs text-slate-500">
            <li>All subject marks {isEntireExam ? 'for all classes' : 'for this class'}</li>
            <li>Submission records and class tokens</li>
            <li>Final result calculations and positions</li>
            <li>Result status and statistics</li>
            <li>Related submission session data</li>
          </ul>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs font-medium text-amber-800">
          ⚠ Master student records will remain safe and intact in the school database.
        </div>

        <p className="text-xs font-bold text-red-600">This action cannot be undone.</p>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">
            Type <span className="rounded bg-slate-200 px-1 py-0.5 font-mono text-red-700">DELETE</span> to confirm:
          </label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE"
            className="border-red-300 focus:border-red-500 focus:ring-red-500 font-mono text-center tracking-wider"
            autoFocus
          />
        </div>
      </div>
    </Modal>
  );
}
