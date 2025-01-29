'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { validateCompetitionCode } from '@/lib/validation/competition-code';

export default function JoinCompetitionPage() {
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

      router.push(`/competitions/${data.competition.id}`);
    } catch (error: any) {
      setIsInvalid(true);
      setError("Invalid competition code");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link 
            href="/competitions" 
            className="text-sm font-light tracking-wider text-foreground dark:text-white opacity-70 hover:opacity-100 hover:text-green-400 transition-all inline-flex items-center gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Competitions
          </Link>
        </div>
      </nav>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader className="space-y-4">
            <CardTitle className="text-3xl">Join Competition</CardTitle>
            <CardDescription className="text-lg">
              Enter the competition code provided by your instructor to join.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Input
                    id="code"
                    placeholder="Enter competition code"
                    value={code}
                    onChange={handleCodeChange}
                    disabled={isLoading}
                    className={cn(
                      "w-full text-lg p-6",
                      (error || isInvalid) && "border-red-500 focus-visible:ring-red-500"
                    )}
                    autoComplete="off"
                    autoFocus
                  />
                  {(error || isInvalid) && (
                    <div className="flex items-center gap-2 text-red-500 text-sm mt-2">
                      <AlertCircle className="h-4 w-4" />
                      <span>{error || "Invalid competition code"}</span>
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  The competition code should be provided by your instructor. It can contain letters, numbers, and hyphens.
                </p>
              </div>
              <Button 
                type="submit" 
                size="lg"
                className="w-full text-lg py-6" 
                disabled={!code || isLoading || !!error}
              >
                {isLoading ? "Joining..." : "Join Competition"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
} 
