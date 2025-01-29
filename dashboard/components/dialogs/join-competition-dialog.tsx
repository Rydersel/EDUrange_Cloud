'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { validateCompetitionCode } from '@/lib/validation/competition-code';

interface JoinCompetitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JoinCompetitionDialog({ open, onOpenChange }: JoinCompetitionDialogProps) {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInvalid, setIsInvalid] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCode = e.target.value;
    setCode(newCode);
    setIsInvalid(false);
    const validation = validateCompetitionCode(newCode);
    setError(validation.error);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateCompetitionCode(code);
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/competitions/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        setIsInvalid(true);
        setError("Invalid competition code");
        return;
      }

      const data = await response.json();
      toast({
        title: "Success!",
        description: "You've successfully joined the competition.",
      });

      onOpenChange(false);
      router.refresh();
      router.push(`/competitions/${data.competition.id}`);
    } catch (error: any) {
      setIsInvalid(true);
      setError("Invalid competition code");
    } finally {
      setIsLoading(false);
    }
  };

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
