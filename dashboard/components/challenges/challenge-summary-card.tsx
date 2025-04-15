import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChallengeSummary } from '@/types/challenge';

interface ChallengeSummaryCardProps {
  summary: ChallengeSummary;
}

export function ChallengeSummaryCard({ summary }: ChallengeSummaryCardProps) {
  const { totalChallenges, totalTypes, totalQuestions, totalPoints } = summary;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Challenge Summary</CardTitle>
        <CardDescription>Overview of installed challenges by type and difficulty</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            value={totalChallenges}
            label="Total Challenges"
          />
          <StatCard
            value={totalTypes}
            label="Challenge Types"
          />
          <StatCard
            value={totalQuestions}
            label="Questions"
          />
          <StatCard
            value={totalPoints}
            label="Total Points"
          />
        </div>
      </CardContent>
    </Card>
  );
}

interface StatCardProps {
  value: number;
  label: string;
}

function StatCard({ value, label }: StatCardProps) {
  return (
    <div className="bg-primary/10 p-4 rounded-lg flex flex-col items-center justify-center">
      <span className="text-2xl font-bold text-foreground">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
} 