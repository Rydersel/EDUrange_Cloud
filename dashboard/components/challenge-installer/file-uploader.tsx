import { useState, useRef } from 'react';
import { Upload, FileUp, AlertCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ChallengeModuleFile, ChallengeInput, ChallengeQuestionInput, ChallengeAppConfigInput } from '@/types/challenge-module';
import { ChallengeDifficulty } from '@prisma/client';

interface FileUploaderProps {
  onFileLoaded: (data: ChallengeModuleFile) => void;
}

const FileUploader = ({ onFileLoaded }: FileUploaderProps) => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateModuleProperties = (data: any): string | null => {
    // Check required module properties
    if (!data.moduleName || typeof data.moduleName !== 'string') {
      return 'Module name is required and must be a string';
    }
    
    if (!data.moduleDescription || typeof data.moduleDescription !== 'string') {
      return 'Module description is required and must be a string';
    }
    
    if (!data.author || typeof data.author !== 'string') {
      return 'Author is required and must be a string';
    }
    
    if (!data.version || typeof data.version !== 'string') {
      return 'Version is required and must be a string';
    }
    
    if (!data.createdAt || typeof data.createdAt !== 'string') {
      return 'Created date is required and must be a string in ISO format';
    }
    
    // Validate date format
    try {
      const date = new Date(data.createdAt);
      if (isNaN(date.getTime())) {
        return 'Created date must be a valid date in ISO format (e.g., "2023-01-01T00:00:00Z")';
      }
    } catch (error) {
      return 'Created date must be a valid date in ISO format (e.g., "2023-01-01T00:00:00Z")';
    }
    
    return null;
  };

  const validateChallengeProperties = (challenge: any, index: number): string | null => {
    // Check required challenge properties
    if (!challenge.name || typeof challenge.name !== 'string') {
      return `Challenge #${index + 1}: Name is required and must be a string`;
    }
    
    if (!challenge.challengeImage || typeof challenge.challengeImage !== 'string') {
      return `Challenge #${index + 1} "${challenge.name}": Challenge image is required and must be a string`;
    }
    
    if (!challenge.difficulty) {
      return `Challenge #${index + 1} "${challenge.name}": Difficulty is required`;
    }
    
    // Validate difficulty enum
    const validDifficulties = ['EASY', 'MEDIUM', 'HARD', 'VERY_HARD'];
    if (!validDifficulties.includes(challenge.difficulty)) {
      return `Challenge #${index + 1} "${challenge.name}": Difficulty must be one of: ${validDifficulties.join(', ')}`;
    }
    
    // Validate challenge type
    if (!challenge.challengeType || typeof challenge.challengeType !== 'string') {
      return `Challenge #${index + 1} "${challenge.name}": Challenge type is required and must be a string`;
    }
    
    // Description is optional but must be a string if provided
    if (challenge.description !== undefined && challenge.description !== null && typeof challenge.description !== 'string') {
      return `Challenge #${index + 1} "${challenge.name}": Description must be a string`;
    }
    
    return null;
  };

  const validateAppConfigs = (challenge: any, index: number): string | null => {
    if (!challenge.appConfigs || !Array.isArray(challenge.appConfigs) || challenge.appConfigs.length === 0) {
      return `Challenge #${index + 1} "${challenge.name}": At least one app configuration is required`;
    }
    
    // Validate each app config
    for (let i = 0; i < challenge.appConfigs.length; i++) {
      const appConfig = challenge.appConfigs[i];
      
      if (!appConfig.appId || typeof appConfig.appId !== 'string') {
        return `Challenge #${index + 1} "${challenge.name}": App config #${i + 1} - App ID is required and must be a string`;
      }
      
      if (!appConfig.title || typeof appConfig.title !== 'string') {
        return `Challenge #${index + 1} "${challenge.name}": App config #${i + 1} - Title is required and must be a string`;
      }
      
      if (!appConfig.icon || typeof appConfig.icon !== 'string') {
        return `Challenge #${index + 1} "${challenge.name}": App config #${i + 1} - Icon is required and must be a string`;
      }
      
      if (appConfig.width === undefined || typeof appConfig.width !== 'number') {
        return `Challenge #${index + 1} "${challenge.name}": App config #${i + 1} - Width is required and must be a number`;
      }
      
      if (appConfig.width <= 0) {
        return `Challenge #${index + 1} "${challenge.name}": App config #${i + 1} - Width must be greater than zero`;
      }
      
      if (appConfig.height === undefined || typeof appConfig.height !== 'number') {
        return `Challenge #${index + 1} "${challenge.name}": App config #${i + 1} - Height is required and must be a number`;
      }
      
      if (appConfig.height <= 0) {
        return `Challenge #${index + 1} "${challenge.name}": App config #${i + 1} - Height must be greater than zero`;
      }
      
      if (!appConfig.screen || typeof appConfig.screen !== 'string') {
        return `Challenge #${index + 1} "${challenge.name}": App config #${i + 1} - Screen is required and must be a string`;
      }
      
      // Boolean properties should be boolean if provided
      if (appConfig.disabled !== undefined && typeof appConfig.disabled !== 'boolean') {
        return `Challenge #${index + 1} "${challenge.name}": App config #${i + 1} - Disabled must be a boolean`;
      }
      
      if (appConfig.favourite !== undefined && typeof appConfig.favourite !== 'boolean') {
        return `Challenge #${index + 1} "${challenge.name}": App config #${i + 1} - Favourite must be a boolean`;
      }
      
      if (appConfig.desktop_shortcut !== undefined && typeof appConfig.desktop_shortcut !== 'boolean') {
        return `Challenge #${index + 1} "${challenge.name}": App config #${i + 1} - Desktop shortcut must be a boolean`;
      }
      
      if (appConfig.launch_on_startup !== undefined && typeof appConfig.launch_on_startup !== 'boolean') {
        return `Challenge #${index + 1} "${challenge.name}": App config #${i + 1} - Launch on startup must be a boolean`;
      }
      
      // Validate additional_config is a valid JSON string if provided
      if (appConfig.additional_config !== undefined && appConfig.additional_config !== null) {
        if (typeof appConfig.additional_config !== 'string') {
          return `Challenge #${index + 1} "${challenge.name}": App config #${i + 1} - Additional config must be a JSON string`;
        }
        
        try {
          JSON.parse(appConfig.additional_config);
        } catch (error) {
          return `Challenge #${index + 1} "${challenge.name}": App config #${i + 1} - Additional config must be a valid JSON string`;
        }
      }
    }
    
    return null;
  };

  const validateQuestions = (challenge: any, index: number): string | null => {
    if (!challenge.questions || !Array.isArray(challenge.questions) || challenge.questions.length === 0) {
      return `Challenge #${index + 1} "${challenge.name}": At least one question is required`;
    }
    
    // Validate each question
    for (let i = 0; i < challenge.questions.length; i++) {
      const question = challenge.questions[i];
      
      if (!question.content || typeof question.content !== 'string') {
        return `Challenge #${index + 1} "${challenge.name}": Question #${i + 1} - Content is required and must be a string`;
      }
      
      if (!question.type || typeof question.type !== 'string') {
        return `Challenge #${index + 1} "${challenge.name}": Question #${i + 1} - Type is required and must be a string`;
      }
      
      // Validate question type
      const validTypes = ['text', 'flag'];
      if (!validTypes.includes(question.type)) {
        return `Challenge #${index + 1} "${challenge.name}": Question #${i + 1} - Type must be one of: ${validTypes.join(', ')}`;
      }
      
      if (question.points === undefined || typeof question.points !== 'number') {
        return `Challenge #${index + 1} "${challenge.name}": Question #${i + 1} - Points is required and must be a number`;
      }
      
      if (question.points <= 0) {
        return `Challenge #${index + 1} "${challenge.name}": Question #${i + 1} - Points must be greater than zero`;
      }
      
      if (!question.answer || typeof question.answer !== 'string') {
        return `Challenge #${index + 1} "${challenge.name}": Question #${i + 1} - Answer is required and must be a string`;
      }
      
      if (question.order === undefined || typeof question.order !== 'number') {
        return `Challenge #${index + 1} "${challenge.name}": Question #${i + 1} - Order is required and must be a number`;
      }
      
      if (question.order < 0) {
        return `Challenge #${index + 1} "${challenge.name}": Question #${i + 1} - Order must be 0 or greater`;
      }
    }
    
    // Check for duplicate question orders
    const orders = challenge.questions.map((q: any) => q.order);
    const uniqueOrders = new Set(orders);
    if (orders.length !== uniqueOrders.size) {
      return `Challenge #${index + 1} "${challenge.name}": Questions must have unique order values`;
    }
    
    return null;
  };

  const validateChallengeModule = (data: any): string | null => {
    // Validate module properties
    const moduleError = validateModuleProperties(data);
    if (moduleError) return moduleError;
    
    // Validate challenges array
    if (!data.challenges || !Array.isArray(data.challenges) || data.challenges.length === 0) {
      return 'At least one challenge is required';
    }
    
    // Validate each challenge
    for (let i = 0; i < data.challenges.length; i++) {
      const challenge = data.challenges[i];
      
      // Validate challenge properties
      const challengeError = validateChallengeProperties(challenge, i);
      if (challengeError) return challengeError;
      
      // Validate app configs
      const appConfigError = validateAppConfigs(challenge, i);
      if (appConfigError) return appConfigError;
      
      // Validate questions
      const questionError = validateQuestions(challenge, i);
      if (questionError) return questionError;
    }
    
    // Check for duplicate challenge names
    const challengeNames = data.challenges.map((c: any) => c.name);
    const uniqueNames = new Set(challengeNames);
    if (challengeNames.length !== uniqueNames.size) {
      return 'Challenge names must be unique within a module';
    }
    
    return null;
  };

  const processFile = (file: File) => {
    if (!file) return;
    
    // Check if file is JSON
    if (!file.name.endsWith('.json')) {
      setError('Only JSON files are supported');
      return;
    }

    setFileName(file.name);
    setError(null);
    setIsLoading(true);

    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        let data: any;
        
        try {
          data = JSON.parse(content);
        } catch (err) {
          setError('Invalid JSON format. Please check your file for syntax errors.');
          setIsLoading(false);
          return;
        }
        
        // Validate the module structure
        const validationError = validateChallengeModule(data);
        if (validationError) {
          setError(validationError);
          setIsLoading(false);
          return;
        }
        
        // If validation passes, cast to the expected type and pass to the callback
        onFileLoaded(data as ChallengeModuleFile);
        setIsLoading(false);
      } catch (err) {
        setError('Failed to process file. Please check the file format and try again.');
        setIsLoading(false);
      }
    };
    
    reader.onerror = () => {
      setError('Failed to read file');
      setIsLoading(false);
    };
    
    reader.readAsText(file);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  return (
    <div className="w-full">
      <div 
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
          ${isDragging ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-gray-400'}`}
        onClick={handleButtonClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".json"
          className="hidden"
        />
        
        <div className="flex flex-col items-center justify-center space-y-4">
          {fileName ? (
            <>
              <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium">{fileName}</p>
                <p className="text-xs text-muted-foreground">File loaded successfully</p>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setFileName(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
              >
                Change File
              </Button>
            </>
          ) : (
            <>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Click to upload or drag and drop</p>
                <p className="text-xs text-muted-foreground">JSON file (max. 10MB)</p>
              </div>
              <Button variant="default" size="sm">
                <FileUp className="mr-2 h-4 w-4" />
                Select File
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default FileUploader; 