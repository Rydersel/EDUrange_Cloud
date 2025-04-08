'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Upload, AlertCircle, CheckCircle, PackagePlus, Download, Clock, User, Tag, ChevronDown, FileCheck, Loader2, X } from 'lucide-react';
import { useToast } from "@/components/ui/use-toast"
import { PackManifest } from '@/types/pack-manifest';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ZipFileUploader } from "@/components/challenge-installer/zip-file-uploader";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChallengeMetadata {
  id: string;
  name: string;
  description?: string;
  difficulty?: string;
}

interface FeaturedPackInfo {
  filename: string;
  metadata: PackManifest;
  challenges: ChallengeMetadata[];
}

type PackForReview = 
  | { type: 'file'; file: File } 
  | { type: 'featured'; packInfo: FeaturedPackInfo } 
  | null;

const getDifficultyBadgeVariant = (difficulty?: string): "default" | "destructive" | "outline" | "secondary" => {
    switch (difficulty?.toLowerCase()) {
        case 'beginner': return 'default';
        case 'intermediate': return 'secondary';
        case 'advanced': return 'outline';
        case 'expert': return 'destructive';
        default: return 'outline';
    }
};

export default function ChallengeInstallerClient() {
  const router = useRouter();
  const { data: session } = useSession();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [featuredPacks, setFeaturedPacks] = useState<FeaturedPackInfo[]>([]);
  const [isLoadingFeatured, setIsLoadingFeatured] = useState(true);
  const [featuredError, setFeaturedError] = useState<string | null>(null);
  const [installingFeaturedPack, setInstallingFeaturedPack] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [isLoadingUpload, setIsLoadingUpload] = useState(false);
  const [packForReview, setPackForReview] = useState<PackForReview>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'browse' && featuredPacks.length === 0) {
      const fetchFeaturedPacks = async () => {
        setIsLoadingFeatured(true);
        setFeedbackError(null);
        setFeedbackSuccess(null);
        try {
          const response = await fetch('/api/admin/packs/featured');
          if (!response.ok) {
            let errorData = { error: 'Failed to fetch featured packs' };
            try {
              errorData = await response.json();
            } catch (e) { /* Ignore JSON parse error */ }
            throw new Error(errorData.error || 'Failed to fetch featured packs');
          }
          const data = await response.json();
          setFeaturedPacks(data.packs || []);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'An unknown error occurred';
          setFeedbackError(message);
          console.error("Error fetching featured packs:", error);
          toast({
            title: "Error Loading Featured Packs",
            description: message,
            variant: "destructive",
          });
        } finally {
          setIsLoadingFeatured(false);
        }
      };
      fetchFeaturedPacks();
    }
  }, [activeTab, featuredPacks.length, toast]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.type === 'application/zip' || file.name.endsWith('.zip')) {
        setSelectedFile(file);
        setFeedbackError(null);
        setFeedbackSuccess(null);
      } else {
        setSelectedFile(null);
        setFeedbackError('Invalid file type. Please upload a .zip file.');
        toast({ variant: "destructive", title: "Invalid File Type", description: "Please upload a .zip file." });
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      setUploadProgress(50);
      const response = await fetch('/api/admin/packs/upload', {
        method: 'POST',
        body: formData,
      });
      setUploadProgress(100);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Upload failed with status: ${response.status}`);
      }
      
      setFeedbackSuccess(data.message || 'Pack uploaded and installed successfully!');
      toast({ title: "Success", description: data.message || 'Pack uploaded successfully!' });
      setSelectedFile(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during upload.';
      setFeedbackError(errorMessage);
      toast({ variant: "destructive", title: "Upload Failed", description: errorMessage });
    } finally {
      setIsUploading(false);
    }
  };

  const handleInstallFeaturedPack = async (packFilename: string) => {
    setInstallingFeaturedPack(packFilename);
    setFeedbackError(null);
    setFeedbackSuccess(null);
    
    try {
      const response = await fetch('/api/admin/packs/upload', { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filename: packFilename }),
      });
      
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Installation failed with status: ${response.status}`);
      }
      
      setFeedbackSuccess(data.message || `Pack '${packFilename}' installed successfully!`);
      toast({ title: "Success", description: data.message || `Pack '${packFilename}' installed successfully!` });
      
    } catch (error) {
       const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during installation.';
      setFeedbackError(errorMessage);
      toast({ variant: "destructive", title: "Installation Failed", description: errorMessage });
    } finally {
      setInstallingFeaturedPack(null);
    }
  };

  const clearMessages = () => {
    setFeedbackError(null);
    setFeedbackSuccess(null);
  };

  const handleFileUpload = async (file: File | null) => {
    if (!file) {
      clearMessages();
      return;
    }

    // Basic client-side type check
    if (!file.name.endsWith('.zip') && file.type !== 'application/zip') {
        setFeedbackError('Invalid file type. Please upload a .zip file.');
        setFeedbackSuccess(null);
        return;
    }

    clearMessages(); // Clear previous messages before new upload
    setIsLoadingUpload(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/admin/packs/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }

      setFeedbackSuccess(result.message || 'Pack uploaded successfully!');
      toast({
        title: "Pack Upload Successful",
        description: result.message || `Successfully installed challenges from ${file.name}.`,
      });
      // Optionally refresh featured packs if needed, or trigger navigation
      // router.refresh(); 
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred during upload.';
      console.error("Upload error:", error);
      setFeedbackError(message);
      toast({
        title: "Upload Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingUpload(false);
    }
  };

  const handleSelectUploadedFileForReview = () => {
    if (!selectedFile) return;
    clearMessages();
    setPackForReview({ type: 'file', file: selectedFile });
    setActiveTab('review');
  };

  const handleSelectFeaturedForReview = (packInfo: FeaturedPackInfo) => {
    clearMessages();
    setPackForReview({ type: 'featured', packInfo: packInfo });
    setActiveTab('review');
  };

  const handleCancelReview = () => {
    setPackForReview(null);
    clearMessages();
    setActiveTab('browse');
  };

  const handleInstall = async () => {
    if (!packForReview) return;
    if (!session?.user?.id) {
      toast({ 
        variant: "destructive", 
        title: "Authentication Error", 
        description: "You must be logged in to install challenges." 
      });
      return;
    }

    setIsInstalling(true);
    setInstallError(null);
    setInstallSuccess(null);

    try {
      if (packForReview.type === 'file') {
        // Handle file upload installation
        const formData = new FormData();
        formData.append('file', packForReview.file);

        const response = await fetch('/api/admin/packs/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || `Installation failed with status: ${response.status}`);
        }

        const data = await response.json();
        setInstallSuccess(data.message || 'Pack installed successfully!');
        toast({ title: "Success", description: data.message || 'Pack installed successfully!' });
      } else if (packForReview.type === 'featured') {
        // Use the full pack upload API endpoint instead of trying to manually install a challenge
        const response = await fetch('/api/admin/packs/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filename: packForReview.packInfo.filename
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || `Installation failed with status: ${response.status}`);
        }

        const data = await response.json();
        setInstallSuccess(data.message || 'Pack installed successfully!');
        toast({ title: "Success", description: data.message || 'Pack installed successfully!' });
      }

      // Clear the review state after successful installation
      setPackForReview(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during installation.';
      setInstallError(errorMessage);
      toast({ variant: "destructive", title: "Installation Failed", description: errorMessage });
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight">Install Challenges</h2>
          <p className="text-muted-foreground">Choose from our featured modules or upload your own CDF pack to install new challenges.</p>
        </div>

        <Tabs defaultValue="upload" value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="border-b">
            <TabsList className="installer-tabs w-full grid grid-cols-3 gap-4">
              <TabsTrigger 
                value="upload" 
                className="installer-tab data-[state=active]:border-primary"
                disabled={isUploading || !!installingFeaturedPack || !!packForReview}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload Pack (.zip)
              </TabsTrigger>
              <TabsTrigger 
                value="browse"
                className="installer-tab data-[state=active]:border-primary"
                disabled={isUploading || !!installingFeaturedPack || !!packForReview}
              >
                <PackagePlus className="mr-2 h-4 w-4" />
                Browse Featured Packs
              </TabsTrigger>
              <TabsTrigger 
                value="review"
                className="installer-tab data-[state=active]:border-primary"
                disabled={!packForReview}
              >
                <FileCheck className="mr-2 h-4 w-4" />
                Review and Install
              </TabsTrigger>
            </TabsList>
          </div>

          <style jsx global>{`
            .installer-tabs {
              background-color: transparent !important;
              border-radius: 0 !important;
            }
            .installer-tab {
              border-radius: 0 !important;
              border-bottom: 2px solid transparent;
            }
            .installer-tab[data-state="active"] {
              border-bottom-color: var(--primary);
              background-color: transparent !important;
              box-shadow: none !important;
            }
          `}</style>

          <TabsContent value="upload" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Upload Challenge Pack</CardTitle>
                <CardDescription>
                  Upload a custom challenge pack in .zip format containing a pack.json manifest and challenge CDF files.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                 <ZipFileUploader
                   onFileUpload={handleFileUpload}
                   isLoading={isLoadingUpload}
                   error={feedbackError}
                   successMessage={feedbackSuccess}
                   clearMessages={clearMessages}
                 />
                 {selectedFile && (
                   <div className="mt-4">
                     <Button 
                       onClick={handleSelectUploadedFileForReview}
                       disabled={!selectedFile || !!packForReview}
                     >
                       <FileCheck className="mr-2 h-4 w-4" />
                       Review Pack
                     </Button>
                     <p className="text-sm text-muted-foreground mt-2">Selected: {selectedFile.name}</p>
                   </div>
                 )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="browse" className="mt-4 space-y-4">
            {isLoadingFeatured && <p className="p-4">Loading featured packs...</p>}
            {featuredError && <Alert variant="destructive" className="m-4"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{featuredError}</AlertDescription></Alert>}
            {!isLoadingFeatured && !featuredError && featuredPacks.length === 0 && <p className="p-4">No featured packs found.</p>}
            {!isLoadingFeatured && !featuredError && featuredPacks.length > 0 && (
              <ScrollArea className="h-[70vh]">
                <div className="space-y-4 pr-4">
                  {featuredPacks.map((pack) => (
                    <Card key={pack.metadata.id || pack.filename} className="overflow-hidden transition-all hover:shadow-md">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg">{pack.metadata.name || pack.filename}</CardTitle>
                        <CardDescription>{pack.metadata.description || "No description available."}</CardDescription>
                        <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground pt-2">
                           {pack.metadata.author && (
                             <div className="flex items-center">
                               <User className="mr-1 h-3 w-3" /> 
                               {pack.metadata.author}
                             </div>
                           )}
                           <div className="flex items-center">
                             <Tag className="mr-1 h-3 w-3" />
                             v{pack.metadata.version}
                           </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                          <h4 className="font-semibold text-sm">Challenges ({pack.challenges.length}):</h4>
                           <ul className="list-disc pl-5 text-sm space-y-1 max-h-40 overflow-y-auto border rounded p-2 bg-muted/50">
                             {pack.challenges.map((challenge, idx) => (
                               <li key={challenge.id || idx}>
                                  {challenge.name}
                                  {challenge.difficulty && <span className="ml-2 text-xs bg-secondary text-secondary-foreground p-1 rounded">{challenge.difficulty}</span>}
                               </li>
                             ))}
                             {pack.challenges.length === 0 && <li className="text-muted-foreground">No challenge details found in manifest.</li>}
                           </ul>
                      </CardContent>
                      <CardFooter>
                           <Button 
                             size="sm" 
                             className="w-full"
                             onClick={() => handleSelectFeaturedForReview(pack)}
                             disabled={isInstalling}
                           >
                            <FileCheck className="mr-2 h-4 w-4" />
                            Review Pack
                          </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="review" className="mt-4">
             <Card>
               <CardHeader>
                  <CardTitle>Review and Install Pack</CardTitle>
                  {!packForReview && <CardDescription>Select a pack from the Upload or Browse tab first.</CardDescription>}
               </CardHeader>
               {packForReview && (
                  <CardContent className="space-y-4">
                     {packForReview.type === 'file' && (
                        <div>
                           <h3 className="font-semibold">Selected File:</h3>
                           <p>{packForReview.file.name}</p>
                           <p className="text-sm text-muted-foreground">Size: {(packForReview.file.size / 1024).toFixed(2)} KB</p>
                           <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">Note: Content preview is not available for uploaded files before installation.</p>
                        </div>
                     )}
                     {packForReview.type === 'featured' && (
                        <div>
                          <h3 className="font-semibold">Featured Pack: {packForReview.packInfo.metadata.name} (v{packForReview.packInfo.metadata.version})</h3>
                          <p className="text-sm text-muted-foreground">{packForReview.packInfo.metadata.description || "No description."}</p>
                          {packForReview.packInfo.metadata.author && <p className="text-xs text-muted-foreground">Author: {packForReview.packInfo.metadata.author}</p>}
                          
                          {/* Enhanced Challenge List Display */}
                          <h4 className="font-semibold mt-4 mb-2">Challenges ({packForReview.packInfo.challenges.length}):</h4>
                          <ScrollArea className="h-60 w-full rounded-md border p-3 bg-muted/20"> 
                            <div className="space-y-3">
                              {packForReview.packInfo.challenges.map((challenge, idx) => (
                                <div key={challenge.id || idx} className="p-3 border rounded bg-background/50 shadow-sm">
                                  <p className="font-medium text-sm">{challenge.name}</p>
                                  {challenge.description && <p className="text-xs text-muted-foreground mt-1">{challenge.description}</p>}
                                  {challenge.difficulty && (
                                     <Badge variant={getDifficultyBadgeVariant(challenge.difficulty)} className="capitalize mt-2 text-xs">
                                       {challenge.difficulty}
                                     </Badge>
                                  )}
                                </div>
                              ))}
                              {packForReview.packInfo.challenges.length === 0 && <p className="text-sm text-muted-foreground p-2">No challenge details found.</p>}
                            </div>
                          </ScrollArea>
                          {/* End Enhanced Challenge List */}
                        </div>
                     )}

                     {installError && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Installation Error</AlertTitle>
                          <AlertDescription>{installError}</AlertDescription>
                        </Alert>
                     )}
                     {installSuccess && (
                        <Alert>
                          <FileCheck className="h-4 w-4" />
                          <AlertTitle>Installation Successful</AlertTitle>
                          <AlertDescription>{installSuccess}</AlertDescription>
                        </Alert>
                     )}

                     {/* Action Buttons */}
                     <div className="flex gap-4 pt-4">
                        <Button 
                          onClick={handleInstall} 
                          disabled={!packForReview || isInstalling || !!installSuccess}
                        >
                           {isInstalling ? (
                              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Installing...</>
                           ) : (
                              <><Download className="mr-2 h-4 w-4" /> Install Pack</>
                           )}
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={handleCancelReview} 
                          disabled={isInstalling}
                        >
                           <X className="mr-2 h-4 w-4" />
                           Cancel
                        </Button>
                     </div>
                  </CardContent>
               )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
} 