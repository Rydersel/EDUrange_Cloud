import Header from '@/components/layout/header';
import Sidebar from '@/components/layout/sidebar';
import type { Metadata } from 'next';
import ModalWrapper from '@/components/modals/ModalWrapper';

export const metadata: Metadata = {
  title: 'EDUrange Cloud Dashboard',
  description: 'EDUrange Cloud Dashboard'
};

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden pt-16">{children}</main>
      </div>
      
      {/* Modals that need to be available throughout the admin interface */}
      <ModalWrapper />
    </>
  );
}
