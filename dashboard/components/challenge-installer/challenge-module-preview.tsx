import { useState, useEffect } from 'react';
import { ChallengeModuleFile, ChallengeInput, ChallengeQuestionInput } from '@/types/challenge-module';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, CheckCircle, Clock, Code, Edit, FileQuestion, Info, Pencil, Save, Server, User, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ChallengeModulePreviewProps {
  challengeModule: ChallengeModuleFile;
  onInstall: () => void;
  isInstalling: boolean;
  installError: string | null;
  installSuccess: boolean;
}

const ChallengeModulePreview = ({
  challengeModule: initialChallengeModule,
  onInstall,
  isInstalling,
  installError,
  installSuccess
}: ChallengeModulePreviewProps) => {
  const [challengeModule, setChallengeModule] = useState<ChallengeModuleFile>(initialChallengeModule);
  const [selectedChallengeIndex, setSelectedChallengeIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState('challenges');
  const [editingModule, setEditingModule] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<number | null>(null);

  const selectedChallenge = selectedChallengeIndex !== null ? challengeModule.challenges[selectedChallengeIndex] : null;

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'EASY':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'HARD':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'VERY_HARD':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const totalQuestions = challengeModule.challenges.reduce(
    (sum, challenge) => sum + challenge.questions.length,
    0
  );

  // Module editing handlers
  const handleModuleChange = (field: keyof ChallengeModuleFile, value: string) => {
    setChallengeModule({
      ...challengeModule,
      [field]: value
    });
  };

  // Challenge editing handlers
  const handleChallengeChange = (field: keyof ChallengeInput, value: string) => {
    if (selectedChallengeIndex === null) return;
    
    const updatedChallenges = [...challengeModule.challenges];
    updatedChallenges[selectedChallengeIndex] = {
      ...updatedChallenges[selectedChallengeIndex],
      [field]: value
    };
    
    setChallengeModule({
      ...challengeModule,
      challenges: updatedChallenges
    });
  };

  // Question editing handlers
  const handleQuestionChange = (questionIndex: number, field: keyof ChallengeQuestionInput, value: string | number) => {
    if (selectedChallengeIndex === null) return;
    
    const updatedChallenges = [...challengeModule.challenges];
    const updatedQuestions = [...updatedChallenges[selectedChallengeIndex].questions];
    
    updatedQuestions[questionIndex] = {
      ...updatedQuestions[questionIndex],
      [field]: field === 'points' || field === 'order' ? Number(value) : value
    };
    
    updatedChallenges[selectedChallengeIndex] = {
      ...updatedChallenges[selectedChallengeIndex],
      questions: updatedQuestions
    };
    
    setChallengeModule({
      ...challengeModule,
      challenges: updatedChallenges
    });
  };

  // Function to reset all changes back to the original module
  const handleReset = () => {
    setChallengeModule(JSON.parse(JSON.stringify(initialChallengeModule)));
    setSelectedChallengeIndex(null);
    setActiveTab('challenges');
    setEditingModule(false);
    setEditingChallenge(false);
    setEditingQuestion(null);
  };

  return (
    <div className="space-y-6 pb-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              {editingModule ? (
                <div className="space-y-2">
                  <Label htmlFor="moduleName">Module Name</Label>
                  <Input 
                    id="moduleName"
                    value={challengeModule.moduleName} 
                    onChange={(e) => handleModuleChange('moduleName', e.target.value)}
                    className="mb-2"
                  />
                  <Label htmlFor="moduleDescription">Module Description</Label>
                  <Textarea 
                    id="moduleDescription"
                    value={challengeModule.moduleDescription} 
                    onChange={(e) => handleModuleChange('moduleDescription', e.target.value)}
                    rows={2}
                  />
                </div>
              ) : (
                <>
                  <CardTitle className="mb-2">{challengeModule.moduleName}</CardTitle>
                  <CardDescription>{challengeModule.moduleDescription}</CardDescription>
                </>
              )}
            </div>
            <div className="flex items-center space-x-2">
              {editingModule ? (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setEditingModule(false)}
                >
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </Button>
              ) : (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setEditingModule(true)}
                  disabled={isInstalling || installSuccess}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
              <Badge variant="outline" className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {challengeModule.author}
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                <Code className="h-3 w-3" />
                v{challengeModule.version}
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(challengeModule.createdAt).toLocaleDateString()}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-primary/10 p-4 rounded-lg flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-foreground">{challengeModule.challenges.length}</span>
              <span className="text-sm text-muted-foreground">Challenges</span>
            </div>
            <div className="bg-primary/10 p-4 rounded-lg flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-foreground">{totalQuestions}</span>
              <span className="text-sm text-muted-foreground">Questions</span>
            </div>
            <div className="bg-primary/10 p-4 rounded-lg flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-foreground">
                {challengeModule.challenges.reduce((sum, challenge) => {
                  return sum + challenge.questions.reduce((qSum, q) => qSum + q.points, 0);
                }, 0)}
              </span>
              <span className="text-sm text-muted-foreground">Total Points</span>
            </div>
          </div>

          {/* Minimal tab navigation */}
          <div className="flex border-b mb-4">
            <button
              onClick={() => setActiveTab('challenges')}
              className={cn(
                "pb-2 px-4 text-sm font-medium transition-colors relative",
                activeTab === 'challenges' 
                  ? "text-primary border-b-2 border-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Challenges
            </button>
            <button
              onClick={() => setActiveTab('details')}
              className={cn(
                "pb-2 px-4 text-sm font-medium transition-colors relative",
                activeTab === 'details' 
                  ? "text-primary border-b-2 border-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Module Details
            </button>
          </div>

          {/* Tab content */}
          {activeTab === 'challenges' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {challengeModule.challenges.map((challenge, index) => (
                <Card 
                  key={index} 
                  className={cn(
                    "cursor-pointer transition-colors",
                    selectedChallengeIndex === index 
                      ? "border-primary border-2" 
                      : "hover:border-primary/50"
                  )}
                  onClick={() => setSelectedChallengeIndex(index)}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base mb-2">{challenge.name}</CardTitle>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <Badge className={getDifficultyColor(challenge.difficulty)}>
                          {challenge.difficulty}
                        </Badge>
                        <Badge variant="outline">
                          {challenge.challengeType || 'Full OS'}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="flex items-center gap-1">
                          <FileQuestion className="h-3 w-3" />
                          {challenge.questions.length}
                        </Badge>
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Server className="h-3 w-3" />
                          {challenge.appConfigs.length}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {challenge.description || 'No description provided'}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {activeTab === 'details' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Module Name</h3>
                <p>{challengeModule.moduleName}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Description</h3>
                <p>{challengeModule.moduleDescription}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Author</h3>
                <p>{challengeModule.author}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Version</h3>
                <p>{challengeModule.version}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Created At</h3>
                <p>{new Date(challengeModule.createdAt).toLocaleString()}</p>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button 
            variant="outline" 
            onClick={handleReset}
          >
            Reset
          </Button>
          <Button 
            onClick={() => onInstall()} 
            disabled={isInstalling || installSuccess}
          >
            {isInstalling ? 'Installing...' : installSuccess ? 'Installed' : 'Install Challenges'}
          </Button>
        </CardFooter>
      </Card>

      {installError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{installError}</AlertDescription>
        </Alert>
      )}

      {installSuccess && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-900/20 dark:border-green-500">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>
            Successfully installed {challengeModule.challenges.length} challenges from module &quot;{challengeModule.moduleName}&quot;
          </AlertDescription>
        </Alert>
      )}

      {selectedChallenge && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                {editingChallenge ? (
                  <div className="space-y-2">
                    <Label htmlFor="challengeName">Challenge Name</Label>
                    <Input 
                      id="challengeName"
                      value={selectedChallenge.name} 
                      onChange={(e) => handleChallengeChange('name', e.target.value)}
                      className="mb-2"
                    />
                    <Label htmlFor="challengeDescription">Challenge Description</Label>
                    <Textarea 
                      id="challengeDescription"
                      value={selectedChallenge.description || ''} 
                      onChange={(e) => handleChallengeChange('description', e.target.value)}
                      rows={2}
                    />
                  </div>
                ) : (
                  <>
                    <CardTitle className="mb-2">{selectedChallenge.name}</CardTitle>
                    <CardDescription>{selectedChallenge.description}</CardDescription>
                  </>
                )}
              </div>
              <div className="flex items-center space-x-2">
                {editingChallenge ? (
                  <>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setEditingChallenge(false)}
                    >
                      <Save className="h-4 w-4 mr-1" />
                      Save
                    </Button>
                    <div className="flex flex-col space-y-1">
                      <Label htmlFor="challengeDifficulty" className="text-xs">Difficulty</Label>
                      <select
                        id="challengeDifficulty"
                        value={selectedChallenge.difficulty}
                        onChange={(e) => handleChallengeChange('difficulty', e.target.value)}
                        className="h-8 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="EASY">EASY</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HARD">HARD</option>
                        <option value="VERY_HARD">VERY_HARD</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setEditingChallenge(true)}
                      disabled={isInstalling || installSuccess}
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Badge className={getDifficultyColor(selectedChallenge.difficulty)}>
                      {selectedChallenge.difficulty}
                    </Badge>
                  </>
                )}
                <Badge variant="outline">
                  {selectedChallenge.challengeType || 'Full OS'}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="questions">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <FileQuestion className="h-4 w-4" />
                    Questions ({selectedChallenge.questions.length})
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Content</TableHead>
                        <TableHead>Points</TableHead>
                        <TableHead>Answer</TableHead>
                        <TableHead className="w-[80px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedChallenge.questions.map((question, index) => (
                        <TableRow key={index}>
                          {editingQuestion === index ? (
                            <>
                              <TableCell>
                                <Input 
                                  type="number" 
                                  value={question.order} 
                                  onChange={(e) => handleQuestionChange(index, 'order', e.target.value)}
                                  className="w-16"
                                />
                              </TableCell>
                              <TableCell>
                                <select
                                  value={question.type}
                                  onChange={(e) => handleQuestionChange(index, 'type', e.target.value)}
                                  className="w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                >
                                  <option value="text">Text</option>
                                  <option value="flag">Flag</option>
                                </select>
                              </TableCell>
                              <TableCell>
                                <Input 
                                  value={question.content} 
                                  onChange={(e) => handleQuestionChange(index, 'content', e.target.value)}
                                />
                              </TableCell>
                              <TableCell>
                                <Input 
                                  type="number" 
                                  value={question.points} 
                                  onChange={(e) => handleQuestionChange(index, 'points', e.target.value)}
                                  className="w-16"
                                />
                              </TableCell>
                              <TableCell>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div>
                                        <Input 
                                          value={question.answer} 
                                          onChange={(e) => handleQuestionChange(index, 'answer', e.target.value)}
                                          className={question.type === 'flag' ? 'bg-muted cursor-not-allowed' : ''}
                                          disabled={question.type === 'flag'}
                                        />
                                      </div>
                                    </TooltipTrigger>
                                    {question.type === 'flag' && (
                                      <TooltipContent>
                                        <p>Flag answers are predefined in the challenge and should not be modified.</p>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                              <TableCell>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => setEditingQuestion(null)}
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell>{question.order}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{question.type}</Badge>
                              </TableCell>
                              <TableCell className="max-w-xs truncate">{question.content}</TableCell>
                              <TableCell>{question.points}</TableCell>
                              <TableCell className="max-w-xs truncate">{question.answer}</TableCell>
                              <TableCell>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingQuestion(index);
                                  }}
                                  disabled={isInstalling || installSuccess}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="appConfigs">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4" />
                    App Configurations ({selectedChallenge.appConfigs.length})
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>App ID</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Screen</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Settings</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedChallenge.appConfigs.map((config, index) => (
                        <TableRow key={index}>
                          <TableCell>{config.appId}</TableCell>
                          <TableCell>{config.title}</TableCell>
                          <TableCell>{config.screen}</TableCell>
                          <TableCell>{config.width}x{config.height}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {config.disabled && <Badge variant="outline">Disabled</Badge>}
                              {config.favourite && <Badge variant="outline">Favorite</Badge>}
                              {config.desktop_shortcut && <Badge variant="outline">Desktop</Badge>}
                              {config.launch_on_startup && <Badge variant="outline">Startup</Badge>}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="image">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Challenge Image
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="p-4 bg-muted rounded-md">
                    <code>{selectedChallenge.challengeImage}</code>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
          <CardFooter>
            <Button variant="outline" onClick={() => setSelectedChallengeIndex(null)}>
              Back to Challenges
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
};

export default ChallengeModulePreview; 