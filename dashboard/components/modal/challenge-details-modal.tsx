'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Challenge } from '@/constants/data';

interface ChallengeDetailsModalProps {
  challenge: Challenge | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ChallengeDetailsModal: React.FC<ChallengeDetailsModalProps> = ({
  challenge,
  isOpen,
  onClose
}) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted || !challenge) {
    return null;
  }

  return (
    <Modal
      title="Challenge Details"
      description="Details of the selected challenge."
      isOpen={isOpen}
      onClose={onClose}
    >
      <div className="space-y-2">
        <div><strong>Created:</strong> {challenge.time_alive}</div>
        <div><strong>User ID:</strong> {challenge.user_id}</div>
        <div><strong>Challenge Image:</strong> {challenge.challenge_image}</div>
        <div><strong>Challenge URL:</strong> <a href={challenge.challenge_url} target="_blank" rel="noopener noreferrer"
                                                className="text-blue-600 underline">{challenge.challenge_url}</a></div>
        <div><strong>Status:</strong> {challenge.status}</div>
        <div><strong>Flag:</strong> {challenge.flag}</div>
      </div>
      <div className="flex w-full items-center justify-end space-x-2 pt-6">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
};
