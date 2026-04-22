'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { Topbar } from '@/components/dashboard/Topbar';
import { useAuth } from '@/components/providers/AuthProvider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const hasStoredToken = typeof window !== 'undefined' && !!localStorage.getItem('ph_token');
    if (!loading && !token && !hasStoredToken) {
      router.push('/login');
    }
  }, [token, loading, router]);

  if (loading) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-violet-500"></div>
      </div>
    );
  }

  if (!token) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-60 min-w-0">
        <Topbar userEmail={user?.email} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
