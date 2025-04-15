'use client';

import { ColumnDef } from '@tanstack/react-table';
import { ActivityLog } from '@prisma/client';
import { ActivityEventType } from '@/lib/activity-logger';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDistanceToNow } from 'date-fns';

interface LogWithUser extends ActivityLog {
  user: {
    id: string;
    name: string | null;
    email: string;
    role: string;
  };
}

// Define default colors and labels for different event types
const eventTypeColors: Partial<Record<string, { color: string; label: string }>> = {
  CHALLENGE_STARTED: { color: 'blue', label: 'Challenge Started' },
  CHALLENGE_COMPLETED: { color: 'green', label: 'Challenge Completed' },
  CHALLENGE_INSTANCE_CREATED: { color: 'blue', label: 'Instance Created' },
  CHALLENGE_INSTANCE_DELETED: { color: 'red', label: 'Instance Deleted' },
  CHALLENGE_PACK_INSTALLED: { color: 'green', label: 'Challenge Pack Installed' },
  CHALLENGE_TYPE_INSTALLED: { color: 'green', label: 'Challenge Type Installed' },
  CHALLENGE_TERMINATION_INITIATED: { color: 'orange', label: 'Termination Initiated' },
  GROUP_JOINED: { color: 'purple', label: 'Group Joined' },
  GROUP_CREATED: { color: 'indigo', label: 'Group Created' },
  GROUP_LEFT: { color: 'orange', label: 'Group Left' },
  GROUP_DELETED: { color: 'red', label: 'Group Deleted' },
  GROUP_UPDATED: { color: 'yellow', label: 'Group Updated' },
  GROUP_MEMBER_REMOVED: { color: 'red', label: 'Member Removed' },
  ACCESS_CODE_GENERATED: { color: 'yellow', label: 'Code Generated' },
  ACCESS_CODE_EXPIRED: { color: 'orange', label: 'Code Expired' },
  ACCESS_CODE_DELETED: { color: 'red', label: 'Code Deleted' },
  ACCESS_CODE_INVALID: { color: 'red', label: 'Access Code Invalid' },
  ACCESS_CODE_USED: { color: 'green', label: 'Code Used' },
  QUESTION_ATTEMPTED: { color: 'orange', label: 'Question Attempted' },
  QUESTION_COMPLETED: { color: 'green', label: 'Question Completed' },
  USER_REGISTERED: { color: 'blue', label: 'User Registered' },
  USER_LOGGED_IN: { color: 'gray', label: 'User Login' },
  USER_ROLE_CHANGED: { color: 'purple', label: 'Role Changed' },
  USER_UPDATED: { color: 'yellow', label: 'User Updated' },
  USER_DELETED: { color: 'red', label: 'User Deleted' },
  SECURITY_EVENT: { color: 'red', label: 'Security Event' },
  SYSTEM_WARNING: { color: 'orange', label: 'System Warning' },
  SYSTEM_ERROR: { color: 'red', label: 'System Error' },
};

// Function to get event type color and label with fallback
function getEventTypeInfo(eventType: string): { color: string; label: string } {
  return eventTypeColors[eventType] || { 
    color: 'gray', 
    label: eventType.replace(/_/g, ' ').toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase())
  };
}

const LogDetails = ({ log }: { log: LogWithUser }) => {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1 text-xs">
        <span className="font-medium">Event Type:</span>
        <span>{getEventTypeInfo(log.eventType).label}</span>

        <span className="font-medium">User:</span>
        <span>{log.user.name || log.user.email}</span>

        <span className="font-medium">Time:</span>
        <span>{new Date(log.timestamp).toLocaleString()}</span>

        {log.challengeId && (
          <>
            <span className="font-medium">Challenge ID:</span>
            <span className="truncate">{log.challengeId}</span>
          </>
        )}

        {log.groupId && (
          <>
            <span className="font-medium">Group ID:</span>
            <span className="truncate">{log.groupId}</span>
          </>
        )}
      </div>

      <div className="mt-2">
        <span className="font-medium text-xs">Metadata:</span>
        <pre className="mt-1 text-xs bg-secondary p-2 rounded-md overflow-auto">
          {JSON.stringify(log.metadata, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export const columns: ColumnDef<LogWithUser>[] = [
  {
    accessorKey: 'eventType',
    header: 'Event Type',
    cell: ({ row }) => {
      const eventType = row.original.eventType;
      const { color, label } = getEventTypeInfo(eventType);
      return (
        <Badge variant="outline" className={`text-${color}-500 border-${color}-500`}>
          {label}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'user',
    header: 'User',
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="text-sm font-medium">
          {row.original.user.name || 'Unnamed User'}
        </span>
        <span className="text-xs text-muted-foreground">
          {row.original.user.email}
        </span>
      </div>
    )
  },
  {
    accessorKey: 'timestamp',
    header: 'Time',
    cell: ({ row }) => {
      const timestamp = new Date(row.original.timestamp);
      return (
        <div className="flex flex-col">
          <span className="text-sm">
            {formatDistanceToNow(timestamp, { addSuffix: true })}
          </span>
          <span className="text-xs text-muted-foreground">
            {timestamp.toLocaleDateString()}
          </span>
        </div>
      );
    }
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      return (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">View details</span>
              <span className="text-xs">Details</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <LogDetails log={row.original} />
          </PopoverContent>
        </Popover>
      );
    }
  }
];
