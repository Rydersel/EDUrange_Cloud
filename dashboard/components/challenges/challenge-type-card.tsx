import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Challenge, ChallengesByType } from '@/types/challenge';
import { ChallengeRowActions } from './challenge-row-actions';
import Link from 'next/link';
import { ChallengeDifficulty } from '@prisma/client';

interface ChallengeTypeCardProps {
  typeName: string;
  challenges: Challenge[];
}

export function ChallengeTypeCard({ typeName, challenges }: ChallengeTypeCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{typeName} Challenges</CardTitle>
        <CardDescription>{challenges.length} challenges of this type</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead>Questions</TableHead>
                <TableHead>Apps</TableHead>
                <TableHead>Pack ID</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {challenges.map((challenge) => (
                <TableRow key={challenge.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/challenges/${challenge.id}`}
                      className="text-foreground hover:underline"
                    >
                      {challenge.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge className={getDifficultyColor(challenge.difficulty)}>
                      {challenge.difficulty}
                    </Badge>
                  </TableCell>
                  <TableCell>{challenge.questions?.length || 0}</TableCell>
                  <TableCell>{challenge.appConfigs?.length || 0}</TableCell>
                  <TableCell className="max-w-xs truncate">
                    <code className="text-xs">{challenge.pack_id || 'N/A'}</code>
                  </TableCell>
                  <TableCell>
                    <ChallengeRowActions
                      challengeId={challenge.id}
                      challengeName={challenge.name}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// Get difficulty badge color
function getDifficultyColor(difficulty: ChallengeDifficulty) {
  const colors = {
    EASY: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    HARD: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    EXPERT: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
  };
  return colors[difficulty] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
}
