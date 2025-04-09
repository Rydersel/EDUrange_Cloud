import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StatusType = 
  | 'active' 
  | 'creating' 
  | 'terminating' 
  | 'error'
  | 'warning' 
  | 'info'
  | 'unknown';

interface StatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  status: string;
  showText?: boolean;
  customText?: string;
}

// Map different status values to standardized status types
const normalizeStatus = (status: string): StatusType => {
  const lowerStatus = status.toLowerCase();
  
  if (['active', 'running', 'online', 'healthy'].includes(lowerStatus)) {
    return 'active';
  } 
  else if (['creating', 'pending', 'waiting', 'queued', 'containercreating', 'initializing'].includes(lowerStatus)) {
    return 'creating';
  } 
  else if (['error', 'failed', 'crashloopbackoff', 'unhealthy'].includes(lowerStatus)) {
    return 'error';
  } 
  else if (['warning'].includes(lowerStatus)) {
    return 'warning';
  } 
  else if (['terminating', 'deleting', 'stopping'].includes(lowerStatus)) {
    return 'terminating';
  } 
  else if (['info'].includes(lowerStatus)) {
    return 'info';
  }
  
  return 'unknown';
};

// Get the display text for a status
const getStatusDisplayText = (status: string): string => {
  const lowerStatus = status.toLowerCase();
  
  // Map status to standardized display text
  if (['active', 'running', 'online', 'healthy'].includes(lowerStatus)) {
    return 'Active';
  } 
  else if (['creating', 'pending', 'waiting', 'queued', 'containercreating', 'initializing'].includes(lowerStatus)) {
    return 'Creating';
  } 
  else if (['error', 'failed', 'crashloopbackoff', 'unhealthy'].includes(lowerStatus)) {
    return 'Error';
  } 
  else if (['terminating', 'deleting', 'stopping'].includes(lowerStatus)) {
    return 'Terminating';
  }
  
  // Make other statuses title case
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
};

// Get className based on status
const getStatusClassNames = (statusType: StatusType): string => {
  switch (statusType) {
    case 'active':
      return 'bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/10';
    case 'creating':
      return 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 border-yellow-500/10';
    case 'error':
      return 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/10';
    case 'warning':
      return 'bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 border-orange-500/10';
    case 'terminating':
      return 'bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 border-orange-500/10';
    case 'info':
      return 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/10';
    case 'unknown':
    default:
      return 'bg-gray-500/10 text-gray-500 hover:bg-gray-500/20 border-gray-500/10';
  }
};

export function StatusBadge({ 
  status, 
  showText = true, 
  customText, 
  className,
  ...props 
}: StatusBadgeProps) {
  const statusType = normalizeStatus(status);
  const displayText = customText || (showText ? getStatusDisplayText(status) : '');
  
  return (
    <Badge
      variant="secondary"
      className={cn(getStatusClassNames(statusType), className)}
      {...props}
    >
      {displayText}
    </Badge>
  );
} 