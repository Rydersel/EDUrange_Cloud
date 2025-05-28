'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCompetitionJoin } from '@/lib/hooks/use-competition-join';

interface JoinCompetitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JoinCompetitionDialog({ open, onOpenChange }: JoinCompetitionDialogProps) {
  // Use the shared hook for competition joining logic
  const {
    code,
    isLoading,
    error,
    isInvalid,
    handleCodeChange,
    handleSubmit
  } = useCompetitionJoin(() => onOpenChange(false));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join Competition</DialogTitle>
          <DialogDescription>
            Enter the competition code provided by your instructor to join.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Input
                id="code"
                placeholder="Enter competition code"
                value={code}
                onChange={handleCodeChange}
                disabled={isLoading}
                className={cn(
                  "w-full",
                  (error || isInvalid) && "border-red-500 focus-visible:ring-red-500"
                )}
                autoComplete="off"
                autoFocus
              />
              {(error || isInvalid) && (
                <div className="flex items-center gap-2 text-red-500 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>{error || "Invalid competition code"}</span>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              The competition code should be provided by your instructor. It can contain letters, numbers, and hyphens.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={!code || isLoading || !!error}
            >
              {isLoading ? "Joining..." : "Join Competition"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
} 
