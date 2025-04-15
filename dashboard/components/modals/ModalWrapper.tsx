'use client';

import dynamic from 'next/dynamic';

// Dynamically import the modal with ssr: false since it's a client component
const QueuedChallengeModal = dynamic(
  () => import('./QueuedChallengeModal'),
  { ssr: false }
);

/**
 * Client component wrapper for modals
 * This component serves as a container for all modals that need to be available throughout the admin interface
 */
export default function ModalWrapper() {
  return (
    <>
      <QueuedChallengeModal />
    </>
  );
} 