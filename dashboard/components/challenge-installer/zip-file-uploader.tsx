"use client";

import type React from "react";
import { useState, useRef } from "react";
import { Upload, FileUp, AlertCircle, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";

interface ZipFileUploaderProps {
  onFileUpload: (file: File) => void;
  isLoading: boolean;
  error: string | null;
  successMessage: string | null;
  clearMessages: () => void;
}

export function ZipFileUploader({
  onFileUpload,
  isLoading,
  error,
  successMessage,
  clearMessages,
}: ZipFileUploaderProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    if (!file) return;

    if (!file.name.endsWith(".zip") && file.type !== "application/zip") {
      onFileUpload(file);
      setFileName(null);
      return;
    }

    setFileName(file.name);
    clearMessages();
    onFileUpload(file);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleButtonClick = () => {
    clearMessages();
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

  const resetUploader = (e?: React.MouseEvent<HTMLButtonElement>) => {
    e?.stopPropagation();
    setFileName(null);
    clearMessages();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="w-full">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer relative ${
          isLoading ? "cursor-wait opacity-60" : ""
        }
          ${
            isDragging
              ? "border-primary bg-primary/5"
              : error
              ? "border-destructive bg-destructive/5"
              : successMessage && fileName
              ? "border-green-500 bg-green-500/5"
              : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
          }`}
        onClick={!isLoading ? handleButtonClick : undefined}
        onDragEnter={!isLoading ? handleDragEnter : undefined}
        onDragLeave={!isLoading ? handleDragLeave : undefined}
        onDragOver={!isLoading ? handleDragOver : undefined}
        onDrop={!isLoading ? handleDrop : undefined}
      >
        {isLoading && (
           <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10 rounded-lg">
             <Loader2 className="h-8 w-8 animate-spin text-primary" />
           </div>
        )}

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".zip,application/zip"
          className="hidden"
          disabled={isLoading}
        />

        <div className="flex flex-col items-center justify-center space-y-4">
          {successMessage && fileName ? (
            <>
              <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium">{fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {successMessage}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={resetUploader}
                disabled={isLoading}
              >
                Upload Another
              </Button>
            </>
          ) : error && fileName ? (
            <>
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                 <AlertCircle className="h-6 w-6 text-destructive" />
               </div>
               <div>
                 <p className="text-sm font-medium">{fileName}</p>
                 <p className="text-xs text-destructive">
                   Upload failed (see error below)
                 </p>
               </div>
               <Button
                 variant="outline"
                 size="sm"
                 onClick={resetUploader}
                 disabled={isLoading}
               >
                 Try Again
               </Button>
            </>
           ) : fileName ? (
            <>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                 <FileUp className="h-6 w-6 text-primary" />
               </div>
               <div>
                 <p className="text-sm font-medium">{fileName}</p>
                 <p className="text-xs text-muted-foreground">
                   Ready to upload
                 </p>
               </div>
               <Button
                 variant="outline"
                 size="sm"
                 onClick={resetUploader}
                 disabled={isLoading}
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
                <p className="text-sm font-medium">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-muted-foreground">
                  ZIP file (Challenge Pack)
                </p>
              </div>
              <Button variant="default" size="sm" disabled={isLoading}>
                <FileUp className="mr-2 h-4 w-4" />
                Select File
              </Button>
            </>
          )}
        </div>
      </div>

      {error && !successMessage && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Upload Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
} 