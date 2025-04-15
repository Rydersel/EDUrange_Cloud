'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { LucideIcon } from 'lucide-react';

interface SystemHealthCardProps {
  title: string;
  status: 'healthy' | 'warning' | 'error';
  icon: LucideIcon;
  details: Array<{ label: string; value: string }>;
}

export function SystemHealthCard({ title, status, icon: Icon, details }: SystemHealthCardProps) {
  return (
    <Card className="border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="flex items-center space-x-2">
          <StatusBadge status={status} showText={false} />
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {details.map((detail, index) => (
            <div key={index} className="flex justify-between">
              <span className="text-xs text-muted-foreground">{detail.label}</span>
              <span className="text-xs font-medium">{detail.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
} 