import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Upload, X } from 'lucide-react';

interface CDFUploaderProps {
  onPackProcessed: (pack: any) => void;
  isProcessing: boolean;
}

export function CDFUploader({ onPackProcessed, isProcessing }: CDFUploaderProps) {
  const { toast } = useToast();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.endsWith('.zip')) {
      toast({
        title: 'Invalid File Type',
        description: 'Please upload a .zip file containing your CDF pack.',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      toast({
        title: 'File Too Large',
        description: 'Please upload a file smaller than 10MB.',
        variant: 'destructive',
      });
      return;
    }

    setSelectedFile(file);
  }, [toast]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  }, [handleFileSelect]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/admin/packs/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Upload failed with status: ${response.status}`);
      }

      const data = await response.json();
      onPackProcessed(data);
      setSelectedFile(null);

      toast({
        title: 'Success',
        description: data.message || 'CDF pack uploaded and processed successfully.',
      });
    } catch (error) {
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload and process the CDF pack. Please try again.',
        variant: 'destructive',
      });
    }
  }, [selectedFile, onPackProcessed, toast]);

  const clearSelection = useCallback(() => {
    setSelectedFile(null);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload CDF Pack</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-lg p-6 text-center
            ${dragActive ? 'border-primary bg-primary/5' : 'border-muted'}
            ${selectedFile ? 'bg-muted' : ''}
          `}
        >
          {selectedFile ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2">
                <span className="font-medium">{selectedFile.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearSelection}
                  disabled={isProcessing}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Button
                onClick={handleUpload}
                disabled={isProcessing}
                className="w-full"
              >
                {isProcessing ? 'Processing...' : 'Upload and Process'}
              </Button>
            </div>
          ) : (
            <>
              <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
              <div className="mt-4 text-sm text-muted-foreground">
                <label
                  htmlFor="file-upload"
                  className="relative cursor-pointer rounded-md font-medium text-primary hover:text-primary/80"
                >
                  <span>Upload a file</span>
                  <input
                    id="file-upload"
                    name="file-upload"
                    type="file"
                    accept=".zip"
                    className="sr-only"
                    onChange={handleFileInput}
                    disabled={isProcessing}
                  />
                </label>
                {' '}or drag and drop
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                ZIP file up to 10MB
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 