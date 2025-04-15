'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Trash2, Info, AlertCircle, FileQuestion } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ChallengeTypeRowActionsProps {
  typeId: string;
  typeName: string;
  challengeCount: number;
}

export function ChallengeTypeRowActions({ typeId, typeName, challengeCount }: ChallengeTypeRowActionsProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      setDeleteError(null);
      
      const response = await fetch(`/api/admin/challenge-types/${typeId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete challenge type');
      }

      toast({
        title: 'Challenge type deleted',
        description: `Successfully deleted challenge type "${typeName}"`,
      });

      // Refresh the page to update the list
      router.refresh();
    } catch (error) {
      console.error('Error deleting challenge type:', error);
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete challenge type');
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete challenge type',
        variant: 'destructive',
      });
    } finally {
      // Only close dialog on success
      if (!deleteError) {
        setShowDeleteDialog(false);
      }
      setIsDeleting(false);
    }
  };

  const canDelete = challengeCount === 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={() => setShowDeleteDialog(true)}
            className={`${!canDelete ? 'text-muted-foreground cursor-not-allowed' : 'text-destructive focus:text-destructive'}`}
            disabled={!canDelete}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              toast({
                title: 'Challenge Type Details',
                description: `Type ID: ${typeId}\nName: ${typeName}\nAssociated Challenges: ${challengeCount}`,
              });
            }}
          >
            <Info className="mr-2 h-4 w-4" />
            View Details
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Challenge Type</AlertDialogTitle>
            <AlertDialogDescription>
              {canDelete ? (
                <>
                  <p className="mb-2">
                    This will permanently delete the challenge type <strong>{typeName}</strong> from both the database and instance manager.
                  </p>
                  <p>All type definition files and supporting files will be removed. This action cannot be undone.</p>
                </>
              ) : (
                <Alert variant="destructive" className="mt-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Cannot Delete</AlertTitle>
                  <AlertDescription>
                    This type has {challengeCount} associated {challengeCount === 1 ? 'challenge' : 'challenges'}.
                    You must delete all challenges of this type before you can delete the type itself.
                  </AlertDescription>
                </Alert>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteError && (
            <Alert variant="destructive" className="mt-2">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting || !canDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
} 