import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader } from 'lucide-react';

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading: boolean;
  children: React.ReactNode;
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({ loading, children, ...props }) => {
  return (
    <Button {...props} disabled={loading}>
      {loading ? <Loader className="animate-spin h-4 w-4" /> : children}
    </Button>
  );
};
