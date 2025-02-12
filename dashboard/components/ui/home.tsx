'use client'

import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface CTFHomePageClientProps {
  username?: string;
}

export function CTFHomePageClient({ username }: CTFHomePageClientProps) {
  return (
    <div className="flex-1 space-y-4 p-4 pt-6">
      <Card className="w-full" style={{ backgroundColor: '#0f2818', borderColor: '#2a623d' }}>
        <CardHeader>
          <CardTitle className="text-2xl font-bold" style={{ color: '#39FF14' }}>
            Welcome to EDURange Cloud{username ? `, ${username}` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg" style={{ color: '#ffffff' }}>
            This dashboard is currently being redesigned. Stay tuned for exciting new features and improvements!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
