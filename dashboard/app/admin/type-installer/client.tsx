'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle, InfoIcon } from 'lucide-react';
import { useToast } from "@/components/ui/use-toast";
import { Label } from "@/components/ui/label";
import { CTDFileUploader } from "@/components/challenge-installer/ctd-file-uploader";

export default function TypeInstallerClient() {
  const router = useRouter();
  const { data: session } = useSession();
  const { toast } = useToast();
  const [isLoadingUpload, setIsLoadingUpload] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  const clearMessages = () => {
    setFeedbackError(null);
    setFeedbackSuccess(null);
  };

  const handleFileUpload = async (file: File) => {
    if (!file) {
      clearMessages();
      return;
    }

    // Basic client-side type check
    if (!file.name.endsWith('.json') && !file.name.endsWith('.ctd.json')) {
      setFeedbackError('Invalid file type. Please upload a .json or .ctd.json file.');
      setFeedbackSuccess(null);
      return;
    }

    clearMessages(); // Clear previous messages before new upload
    setIsLoadingUpload(true);

    const formData = new FormData();
    formData.append('file', file);
    // Indicate this is a CTD (Challenge Type Definition) upload
    formData.append('type', 'ctd');

    try {
      const response = await fetch('/api/admin/challenge-types/upload', {
        method: 'POST',
        body: formData,
      });

      // Try to get the response body as JSON or text
      let resultBody;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        resultBody = await response.json();
      } else {
        resultBody = { text: await response.text() };
      }

      if (!response.ok) {
        throw new Error(
          resultBody.error || 
          `HTTP error! Status: ${response.status} - ${response.statusText}. ` +
          `Details: ${JSON.stringify(resultBody)}`
        );
      }

      setFeedbackSuccess(resultBody.message || 'Challenge Type Definition uploaded successfully!');
      toast({
        title: "Challenge Type Upload Successful",
        description: resultBody.message || `Successfully installed challenge type from ${file.name}.`,
      });
      
      // Wait for a moment, then redirect back to the types page
      setTimeout(() => {
        router.push('/admin/types');
        router.refresh();
      }, 2000);
      
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

  return (
    <div className="w-full p-4">
      <Card>
        <CardHeader>
          <CardTitle>Challenge Type Definition Uploader</CardTitle>
          <CardDescription>
            Upload new Challenge Type Definition (CTD) files to expand the types of challenges available in EduRange.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {feedbackSuccess && (
            <Alert
              variant="default"
              className="mb-6"
            >
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>{feedbackSuccess}</AlertDescription>
            </Alert>
          )}

          {feedbackError && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{feedbackError}</AlertDescription>
            </Alert>
          )}

          <Alert className="mb-6">
            <InfoIcon className="h-4 w-4" />
            <AlertTitle>CTD Upload Guidelines</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-5 space-y-1">
                <li>Upload a <strong>.ctd.json</strong> file containing the challenge type definition</li>
                <li>The file must follow the CTD schema format</li>
                <li>Each CTD defines a specific challenge type with its configuration options</li>
                <li>CTD files define how challenges of this type are created and configured</li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div>
              <Label htmlFor="ctd-upload">Challenge Type Definition File</Label>
              <CTDFileUploader
                onFileUpload={handleFileUpload}
                isLoading={isLoadingUpload}
                error={feedbackError}
                successMessage={feedbackSuccess}
                clearMessages={clearMessages}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 