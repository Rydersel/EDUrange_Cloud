import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CircleIcon, DatabaseIcon } from 'lucide-react';

interface TypesSummary {
  totalTypes: number;
  totalAssociatedChallenges: number;
}

interface ChallengeTypeSummaryCardProps {
  summary: TypesSummary;
}

export function ChallengeTypeSummaryCard({ summary }: ChallengeTypeSummaryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Challenge Types Overview</CardTitle>
        <CardDescription>Summary of installed challenge types</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-muted/50">
            <CardContent className="p-4 flex flex-row items-center gap-4">
              <div className="h-10 w-10 rounded-full flex items-center justify-center bg-primary/10">
                <CircleIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Total Types</p>
                <p className="text-2xl font-bold">{summary.totalTypes}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-muted/50">
            <CardContent className="p-4 flex flex-row items-center gap-4">
              <div className="h-10 w-10 rounded-full flex items-center justify-center bg-primary/10">
                <DatabaseIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Associated Challenges</p>
                <p className="text-2xl font-bold">{summary.totalAssociatedChallenges}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
} 