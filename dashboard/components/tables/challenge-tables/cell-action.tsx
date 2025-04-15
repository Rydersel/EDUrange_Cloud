'use client';
import { AlertModal } from '@/components/modal/alert-modal';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Challenge } from '@/constants/data';
import { Edit, MoreHorizontal, Trash } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, MouseEvent, useEffect, useRef } from 'react';
import { toast } from "@/components/ui/use-toast";

interface CellActionProps {
  data: Challenge;
  updateChallengeStatus: (id: string, status: string) => void;
}

export const CellAction: React.FC<CellActionProps> = ({ data, updateChallengeStatus }) => {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const statusPollRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up any polling on unmount
  useEffect(() => {
    return () => {
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
      }
    };
  }, []);

  const onConfirm = async () => {
    setLoading(true);
    updateChallengeStatus(data.id, 'TERMINATING');
    try {
      const response = await fetch(`/api/challenges/terminate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ instanceId: data.id }),
      });
      
      if (response.ok) {
        // Show immediate feedback to user
        toast({
          title: "Termination initiated",
          description: "The challenge is being terminated. This may take a minute.",
          variant: "default",
        });
        
        // Start polling for status updates instead of arbitrary timeout
        startStatusPolling(data.id);
      } else {
        const result = await response.json();
        toast({
          title: "Termination failed",
          description: result.error || 'Failed to initiate challenge termination',
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error terminating challenge:', error);
      toast({
        title: "Error",
        description: 'An error occurred while terminating the challenge',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  // Poll for status updates
  const startStatusPolling = (instanceId: string) => {
    // Clear any existing polling
    if (statusPollRef.current) {
      clearInterval(statusPollRef.current);
    }
    
    // Create counter for attempts
    let attempts = 0;
    const maxAttempts = 40; // 2 minutes (3s * 40)
    
    statusPollRef.current = setInterval(async () => {
      try {
        attempts++;
        const response = await fetch(`/api/challenges/status?instanceId=${instanceId}`);
        
        if (response.ok) {
          const data = await response.json();
          updateChallengeStatus(instanceId, data.status);
          
          // Stop polling when terminal state is reached
          if (['TERMINATED', 'ERROR'].includes(data.status)) {
            if (statusPollRef.current) {
              clearInterval(statusPollRef.current);
              statusPollRef.current = null;
            }
            
            // Show appropriate message
            if (data.status === 'TERMINATED') {
              toast({
                title: "Challenge terminated",
                description: "The challenge has been successfully terminated.",
                variant: "default",
              });
            } else {
              toast({
                title: "Termination issue",
                description: "There was a problem terminating the challenge. It has been marked for manual cleanup.",
                variant: "destructive",
              });
            }
            
            router.refresh();
          }
        } else {
          console.error('Status polling failed');
          // Don't immediately stop on error - might be temporary
          if (attempts >= 5) { // Stop after 5 consecutive failures
            if (statusPollRef.current) {
              clearInterval(statusPollRef.current);
              statusPollRef.current = null;
            }
          }
        }
        
        // Safety measure - stop after max attempts
        if (attempts >= maxAttempts) {
          if (statusPollRef.current) {
            clearInterval(statusPollRef.current);
            statusPollRef.current = null;
          }
          router.refresh();
        }
      } catch (error) {
        console.error('Error polling status:', error);
        if (attempts >= 5) { // Stop after 5 consecutive failures
          if (statusPollRef.current) {
            clearInterval(statusPollRef.current);
            statusPollRef.current = null;
          }
        }
      }
    }, 3000); // Poll every 3 seconds
  };

  const handleDropdownClick = (e: MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
        loading={loading}
      />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0" onClick={handleDropdownClick}>
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={handleDropdownClick}>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>

          <DropdownMenuItem onClick={() => setOpen(true)}>
            <Trash className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
