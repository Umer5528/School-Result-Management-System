import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

import AuthLayout from './layouts/AuthLayout';
import DashboardLayout from './layouts/DashboardLayout';
import ProtectedRoute from './routes/ProtectedRoute';

import LoginPage from './features/auth/LoginPage';
import SignupPage from './features/auth/SignupPage';
import LandingPage from './features/public/LandingPage';
import SubmitResultPage from './features/public/SubmitResultPage';
import DashboardPage from './features/dashboard/DashboardPage';
import StudentsPage from './features/students/StudentsPage';
import ResultSessionsListPage from './features/resultSessions/ResultSessionsListPage';
import CreateResultSessionWizard from './features/resultSessions/CreateResultSessionWizard';
import ResultSessionDetailPage from './features/resultSessions/ResultSessionDetailPage';
import ResultsListPage from './features/results/ResultsListPage';
import ResultDetailsPage from './features/results/ResultDetailsPage';
import CreateResultWizard from './features/results/CreateResultWizard';
import TeacherManagementPage from './features/teachers/TeacherManagementPage';
import PendingApprovalsPage from './features/teachers/PendingApprovalsPage';
import TeacherProfilePage from './features/teachers/TeacherProfilePage';
import AdminResultSessionDetailPage from './features/teachers/AdminResultSessionDetailPage';
import AnnouncementsPage from './features/announcements/AnnouncementsPage';
import SettingsPage from './features/settings/SettingsPage';
import AuditLogsPage from './features/auditLogs/AuditLogsPage';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">Loading...</div>;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/submit" element={<SubmitResultPage />} />
      <Route path="/submit/:token" element={<SubmitResultPage />} />

      <Route element={<AuthLayout />}>
        <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <LoginPage />} />
        <Route path="/signup" element={user ? <Navigate to="/dashboard" /> : <SignupPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/results" element={<ResultsListPage />} />
          <Route path="/results/:id" element={<ResultDetailsPage />} />
          <Route path="/announcements" element={<AnnouncementsPage />} />

          <Route element={<ProtectedRoute roles={['teacher']} />}>
            <Route path="/results/create" element={<CreateResultWizard />} />
            <Route path="/students" element={<StudentsPage />} />
            <Route path="/result-sessions" element={<ResultSessionsListPage />} />
            <Route path="/result-sessions/new" element={<CreateResultSessionWizard />} />
            <Route path="/result-sessions/:id" element={<ResultSessionDetailPage />} />
          </Route>

          <Route element={<ProtectedRoute roles={['assistant_admin', 'super_admin']} permission="VIEW_TEACHERS" />}>
            <Route path="/teachers" element={<TeacherManagementPage />} />
            <Route path="/teachers/pending" element={<PendingApprovalsPage />} />
            <Route path="/teachers/:id" element={<TeacherProfilePage />} />
            <Route path="/teachers/:id/result-sessions/:sessionId" element={<AdminResultSessionDetailPage />} />
          </Route>

          <Route element={<ProtectedRoute roles={['assistant_admin', 'super_admin']} permission="VIEW_AUDIT_LOGS" />}>
            <Route path="/audit-logs" element={<AuditLogsPage />} />
          </Route>

          <Route element={<ProtectedRoute roles={['super_admin']} />}>
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/'} replace />} />
    </Routes>
  );
}
