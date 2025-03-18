'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { signIn } from 'next-auth/react';
import { AlertCircle } from 'lucide-react';

interface DevAuthFormProps {
  callbackUrl: string;
}

export default function DevAuthForm({ callbackUrl }: DevAuthFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Development login form state for new accounts
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  
  // Development login form state for existing accounts
  const [loginEmail, setLoginEmail] = useState('');

  // Security check: Don't render in production
  // This check must come after the hooks to avoid React Hook conditional execution errors
  if (process.env.NODE_ENV === 'production') {
    console.error('DevAuthForm attempted to render in production environment');
    return (
      <div className="p-4 bg-red-900/50 text-white rounded">
        Development login is not available in production.
      </div>
    );
  }

  const handleDevSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await signIn('credentials', {
        name,
        email,
        // Always use STUDENT role for new development accounts
        role: 'STUDENT',
        callbackUrl,
        redirect: false // Don't redirect so we can handle errors
      });
      
      if (result?.error) {
        setError('Failed to create account. Please try again.');
        setIsLoading(false);
      } else if (result?.url) {
        window.location.href = result.url;
      }
    } catch (error) {
      console.error("Dev login error:", error);
      setError('An unexpected error occurred');
      setIsLoading(false);
    }
  };
  
  const handleExistingUserLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await signIn('credentials', {
        email: loginEmail,
        existingUser: 'true', // Flag to indicate we're logging in to an existing account
        callbackUrl,
        redirect: false // Don't redirect so we can handle errors
      });
      
      if (result?.error) {
        setError('User not found. Please check the email or create a new account.');
        setIsLoading(false);
      } else if (result?.url) {
        window.location.href = result.url;
      }
    } catch (error) {
      console.error("Existing user login error:", error);
      setError('An unexpected error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-gray-900/50 p-4 rounded-md border border-gray-800">
      <Tabs defaultValue="new" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6 bg-gray-800">
          <TabsTrigger value="new" className="data-[state=active]:bg-purple-900">Create User</TabsTrigger>
          <TabsTrigger value="existing" className="data-[state=active]:bg-purple-900">Login</TabsTrigger>
        </TabsList>
        
        <TabsContent value="new">
          <form onSubmit={handleDevSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-white">Name</Label>
              <Input
                id="name"
                placeholder="Test User"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="bg-black/50 border-gray-700 text-white"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="test@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-black/50 border-gray-700 text-white"
              />
            </div>
            
            <div className="text-sm text-gray-400 mb-2">
              All new accounts are created with Student role for security.
            </div>
            
            <Button type="submit" className="w-full bg-purple-700 hover:bg-purple-600" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create & Sign In'}
            </Button>
          </form>
        </TabsContent>
        
        <TabsContent value="existing">
          <form onSubmit={handleExistingUserLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="loginEmail" className="text-white">Email</Label>
              <Input
                id="loginEmail"
                type="email"
                placeholder="existing@example.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                className="bg-black/50 border-gray-700 text-white"
              />
            </div>
            
            <Button type="submit" className="w-full bg-purple-700 hover:bg-purple-600" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </TabsContent>
        
        {error && (
          <div className="mt-4 p-3 bg-purple-900/50 border border-purple-800 rounded-md flex items-center gap-2 text-sm text-white">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}
      </Tabs>
    </div>
  );
} 