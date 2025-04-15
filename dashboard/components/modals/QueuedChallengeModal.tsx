import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useDisclosure } from '@/hooks/use-disclosure';
import QueuedChallengeStatus from '../challenges/QueuedChallengeStatus';

interface QueuedChallengeStatusData {
  instanceId: string;
  taskId: string;
  queuePosition?: number;
  priority?: number;
}

export default function QueuedChallengeModal() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [statusData, setStatusData] = useState<QueuedChallengeStatusData | null>(null);

  useEffect(() => {
    // Listen for custom event to show the modal
    const handleShowEvent = (event: CustomEvent<QueuedChallengeStatusData>) => {
      setStatusData(event.detail);
      onOpen();
    };

    window.addEventListener('showQueuedChallengeStatus', handleShowEvent as EventListener);

    return () => {
      window.removeEventListener('showQueuedChallengeStatus', handleShowEvent as EventListener);
    };
  }, [onOpen]);

  const handleDeploymentComplete = (url: string) => {
    // Close modal after short delay
    setTimeout(() => {
      onClose();
      // Refresh the page to show updated status
      window.location.reload();
    }, 2000);
  };

  const handleError = (error: string) => {
    // Just log the error, don't close the modal
    console.error('Deployment error:', error);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Challenge Deployment Status</DialogTitle>
          <Button 
            variant="ghost" 
            className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        </DialogHeader>
        
        <div className="p-4">
          {statusData ? (
            <QueuedChallengeStatus
              instanceId={statusData.instanceId}
              taskId={statusData.taskId}
              queuePosition={statusData.queuePosition}
              priority={statusData.priority}
              onDeploymentComplete={handleDeploymentComplete}
              onError={handleError}
            />
          ) : (
            <p>Loading challenge status...</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 