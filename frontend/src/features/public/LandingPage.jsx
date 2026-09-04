import React from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, ClipboardEdit } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div>
          <p className="text-lg font-semibold text-slate-800">SRMS</p>
          <p className="text-xs text-slate-400">School Result Management System</p>
        </div>
        <Link to="/login" className="text-sm font-medium text-brand-600">Sign in</Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold text-slate-800 sm:text-4xl">
          Manage exam results, the simple way
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-slate-500">
          Teachers can create classes, register students and enable result submission.
          Authorized result submitters can then enter subject-wise marks without creating an account.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            to="/signup"
            className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-8 shadow-sm transition hover:border-brand-300 hover:shadow-md"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <GraduationCap size={24} />
            </div>
            <p className="font-semibold text-slate-800">Register as Teacher</p>
            <p className="text-sm text-slate-500">
              Create classes, register students, and manage exam results
            </p>
          </Link>

          <Link
            to="/submit"
            className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-8 shadow-sm transition hover:border-brand-300 hover:shadow-md"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <ClipboardEdit size={24} />
            </div>
            <p className="font-semibold text-slate-800">Submit Result</p>
            <p className="text-sm text-slate-500">
              Have a submission code? Enter subject-wise marks — no account needed
            </p>
          </Link>
        </div>
      </main>
    </div>
  );
}
