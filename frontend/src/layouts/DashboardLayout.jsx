import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  GraduationCap,
  FileText,
  FilePlus2,
  ClipboardList,
  Users,
  Megaphone,
  ScrollText,
  Settings as SettingsIcon,
  Menu,
  X,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AnnouncementBanner from '../components/ui/AnnouncementBanner';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['teacher', 'assistant_admin', 'super_admin'] },
  { to: '/students', label: 'Students', icon: GraduationCap, roles: ['teacher'] },
  { to: '/results', label: 'Results', icon: FileText, roles: ['teacher', 'assistant_admin', 'super_admin'] },
  { to: '/result-sessions', label: 'Result Submissions', icon: ClipboardList, roles: ['teacher'] },
  { to: '/results/create', label: 'Create Result', icon: FilePlus2, roles: ['teacher'] },
  { to: '/teachers', label: 'Teachers', icon: Users, roles: ['assistant_admin', 'super_admin'], permission: 'VIEW_TEACHERS' },
  { to: '/announcements', label: 'Announcements', icon: Megaphone, roles: ['teacher', 'assistant_admin', 'super_admin'] },
  { to: '/audit-logs', label: 'Activity Logs', icon: ScrollText, roles: ['assistant_admin', 'super_admin'], permission: 'VIEW_AUDIT_LOGS' },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, roles: ['super_admin'] },
];

function SidebarContent({ onNavigate, onClose }) {
  const { user, hasPermission, logout } = useAuth();
  const visible = navItems.filter(
    (item) => item.roles.includes(user.role) && (!item.permission || hasPermission(item.permission))
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 py-6">
        <div>
          <p className="text-lg font-semibold text-slate-800">SRMS</p>
          <p className="text-xs text-slate-400">School Result Management</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 lg:hidden" aria-label="Close menu">
            <X size={20} />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {visible.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-100 p-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          <LogOut size={18} />
          Log out
        </button>
      </div>
    </div>
  );
}

export default function DashboardLayout() {
  const { user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">
            <SidebarContent onNavigate={() => setDrawerOpen(false)} onClose={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-3 py-3 sm:px-4 lg:px-8">
          <button className="lg:hidden" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
            <Menu size={22} />
          </button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-800">{user.name}</p>
              <p className="text-xs capitalize text-slate-400">{user.role.replace('_', ' ')}</p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {user.name?.[0]?.toUpperCase()}
            </div>
          </div>
        </header>
        <AnnouncementBanner />
        <main className="p-3 sm:p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
