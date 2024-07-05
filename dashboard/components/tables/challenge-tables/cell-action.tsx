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
import { useState, MouseEvent } from 'react';

interface CellActionProps {
  data: Challenge;
  updateChallengeStatus: (id: string, status: string) => void;
}

export const CellAction: React.FC<CellActionProps> = ({ data, updateChallengeStatus }) => {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const onConfirm = async () => {
    setLoading(true);
    updateChallengeStatus(data.id, 'Completing');
    try {
      const response = await fetch('https://eductf.rydersel.cloud/instance-manager/api/end-challenge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deployment_name: data.id }), // Ensure this matches the expected key
      });
      if (response.ok) {
        setTimeout(() => {
          router.refresh(); // Refresh the page or re-fetch the data to update the list
        }, 20000); // Wait for 20 seconds to simulate deletion delay
      } else {
        const result = await response.json();
        alert(result.error || 'Failed to delete the challenge');
      }
    } catch (error) {
      console.error('Error deleting challenge:', error);
      alert('An error occurred while deleting the challenge');
    } finally {
      setLoading(false);
      setOpen(false);
    }
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
