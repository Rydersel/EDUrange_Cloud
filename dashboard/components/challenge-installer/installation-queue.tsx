import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { PackagePlus, X, AlertCircle, ChevronRight } from 'lucide-react';

interface Question {
  id: string;
  title: string;
  points: number;
}

interface Challenge {
  id: string;
  name: string;
  description?: string;
  challengeType: {
    id: string;
    name: string;
  };
  questions: Question[];
  isTypeInstalled: boolean;
}

interface Pack {
  id: string;
  name: string;
  description?: string;
  challenges: Challenge[];
}

interface InstallationQueueProps {
  packs: Pack[];
  onRemoveChallenge: (packId: string, challengeId: string) => void;
  onRemovePack: (packId: string) => void;
  onInstall: () => void;
  isInstalling: boolean;
}

export function InstallationQueue({
  packs,
  onRemoveChallenge,
  onRemovePack,
  onInstall,
  isInstalling
}: InstallationQueueProps) {
  const [expandedPacks, setExpandedPacks] = useState<string[]>([]);

  const totalChallenges = packs.reduce((sum, pack) => sum + pack.challenges.length, 0);
  const invalidChallenges = packs.reduce((sum, pack) => 
    sum + pack.challenges.filter(c => !c.isTypeInstalled).length, 0);

  const togglePack = (packId: string) => {
    setExpandedPacks(current =>
      current.includes(packId)
        ? current.filter(id => id !== packId)
        : [...current, packId]
    );
  };

  if (packs.length === 0) {
    return (
      <Card className="mt-6">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center text-center space-y-3 py-12">
            <PackagePlus className="h-12 w-12 text-muted-foreground" />
            <div className="text-xl font-semibold">No Challenges Selected</div>
            <div className="text-sm text-muted-foreground">
              Select challenges from featured modules or upload a CDF pack to begin installation
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle>Installation Queue</CardTitle>
          <div className="flex items-center gap-2">
            {invalidChallenges > 0 && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {invalidChallenges} Invalid
              </Badge>
            )}
            <Badge variant="secondary">
              {totalChallenges} Challenge{totalChallenges !== 1 ? 's' : ''}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <Accordion type="multiple" className="w-full">
            {packs.map((pack) => (
              <AccordionItem key={pack.id} value={pack.id}>
                <div className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-2 flex-1">
                    <AccordionTrigger className="hover:no-underline py-0 [&[data-state=open]>svg]:rotate-90">
                      <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200" />
                    </AccordionTrigger>
                    <div>
                      <div className="font-medium">{pack.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {pack.challenges.length} Challenge{pack.challenges.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemovePack(pack.id)}
                    className="ml-2"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <AccordionContent>
                  <div className="space-y-4 ml-6">
                    {pack.challenges.map((challenge) => (
                      <div key={challenge.id} className="relative">
                        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{challenge.name}</span>
                              {!challenge.isTypeInstalled && (
                                <Badge variant="destructive" className="text-xs">
                                  Type Not Installed
                                </Badge>
                              )}
                            </div>
                            {challenge.description && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {challenge.description}
                              </p>
                            )}
                            <div className="mt-2">
                              <div className="text-sm font-medium">Questions:</div>
                              <div className="grid grid-cols-2 gap-2 mt-1">
                                {challenge.questions.map((question) => (
                                  <div
                                    key={question.id}
                                    className="flex items-center justify-between text-sm p-2 bg-muted rounded"
                                  >
                                    <span className="truncate">{question.title}</span>
                                    <Badge variant="secondary">{question.points} pts</Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onRemoveChallenge(pack.id, challenge.id)}
                            className="shrink-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </ScrollArea>
        <Separator className="my-4" />
        <div className="flex justify-end">
          <Button
            onClick={onInstall}
            disabled={isInstalling || invalidChallenges > 0}
            className="w-full sm:w-auto"
          >
            {isInstalling ? 'Installing...' : 'Install Selected Challenges'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
} 