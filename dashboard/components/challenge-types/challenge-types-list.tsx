import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChallengeTypeRowActions } from './challenge-type-row-actions';
import Link from 'next/link';

interface ChallengeType {
  id: string;
  name: string;
  challenges: { id: string }[];
}

interface ChallengeTypesListProps {
  challengeTypes: ChallengeType[];
}

export function ChallengeTypesList({ challengeTypes }: ChallengeTypesListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Challenge Types</CardTitle>
        <CardDescription>All available challenge types in the system</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type Name</TableHead>
                <TableHead className="w-[150px]">Associated Challenges</TableHead>
                <TableHead className="w-[150px]">Type ID</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {challengeTypes.map((type) => (
                <TableRow key={type.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">
                    {type.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {type.challenges.length} {type.challenges.length === 1 ? 'challenge' : 'challenges'}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    <code className="text-xs">{type.id}</code>
                  </TableCell>
                  <TableCell>
                    <ChallengeTypeRowActions
                      typeId={type.id}
                      typeName={type.name}
                      challengeCount={type.challenges.length}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {challengeTypes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    No challenge types found. Install a type to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
} 