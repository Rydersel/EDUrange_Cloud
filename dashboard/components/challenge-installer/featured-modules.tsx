import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Download, Clock, User, Tag } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ChallengeModuleFile } from '@/types/challenge-module';

interface FeaturedModulesProps {
  onModuleSelected: (data: ChallengeModuleFile) => void;
}

interface ModuleCard {
  filename: string;
  data: ChallengeModuleFile;
}

const FeaturedModules = ({ onModuleSelected }: FeaturedModulesProps) => {
  const [modules, setModules] = useState<ModuleCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchModules = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Fetch the list of featured modules
        const response = await fetch('/api/admin/featured-modules');
        
        if (!response.ok) {
          throw new Error('Failed to fetch featured modules');
        }
        
        const data = await response.json();
        setModules(data.modules);
      } catch (err) {
        console.error('Error fetching modules:', err);
        setError('Failed to load featured modules. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchModules();
  }, []);

  const handleSelectModule = (module: ChallengeModuleFile) => {
    onModuleSelected(module);
  };

  // Function to count total challenges and questions in a module
  const getChallengeStats = (module: ChallengeModuleFile) => {
    const challengeCount = module.challenges.length;
    const questionCount = module.challenges.reduce(
      (sum, challenge) => sum + challenge.questions.length, 
      0
    );
    return { challengeCount, questionCount };
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="overflow-hidden">
            <CardHeader className="pb-2">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <div className="flex gap-2 mt-4">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-16" />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Skeleton className="h-10 w-full" />
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (modules.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No modules found</AlertTitle>
        <AlertDescription>
          No featured modules are currently available. Try uploading your own module instead.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {modules.map((module) => {
        const { challengeCount, questionCount } = getChallengeStats(module.data);
        
        return (
          <Card key={module.filename} className="overflow-hidden transition-all hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{module.data.moduleName}</CardTitle>
              <CardDescription>{module.data.moduleDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 items-center text-sm text-muted-foreground">
                  <div className="flex items-center">
                    <User className="mr-1 h-3 w-3" />
                    {module.data.author}
                  </div>
                  <div className="flex items-center">
                    <Tag className="mr-1 h-3 w-3" />
                    v{module.data.version}
                  </div>
                  <div className="flex items-center">
                    <Clock className="mr-1 h-3 w-3" />
                    {new Date(module.data.createdAt).toLocaleDateString()}
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="bg-primary/10">
                    {challengeCount} Challenge{challengeCount !== 1 ? 's' : ''}
                  </Badge>
                  <Badge variant="outline" className="bg-primary/10">
                    {questionCount} Question{questionCount !== 1 ? 's' : ''}
                  </Badge>
                  
                  {/* Show unique challenge types */}
                  {Array.from(new Set(module.data.challenges.map(c => c.challengeType || 'Unknown'))).map(type => (
                    <Badge key={type} variant="outline" className="bg-secondary/10">
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full" 
                onClick={() => handleSelectModule(module.data)}
              >
                <Download className="mr-2 h-4 w-4" />
                Select Module
              </Button>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
};

export default FeaturedModules; 