'use client';
import { ColumnDef } from '@tanstack/react-table';
import { CellAction } from './cell-action';
import { Challenge } from '@/constants/data';
import { Checkbox } from '@/components/ui/checkbox';

export const getColumns = (
  updateChallengeStatus: (id: string, status: string) => void,
): ColumnDef<Challenge>[] => [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false
  },
  {
    accessorKey: 'userEmail',
    header: 'USER EMAIL'
  },
  {
    accessorKey: 'challenge_image',
    header: 'CHALLENGE IMAGE'
  },
  {
    accessorKey: 'challengeType',
    header: 'CHALLENGE TYPE',
    cell: ({ row }) => row.original.challengeType || 'Unknown'
  },
  {
    accessorKey: 'groupId',
    header: 'COMPETITION GROUP',
    cell: ({ row }) => row.original.groupId || 'N/A'
  },
  {
    accessorKey: 'challenge_url',
    header: 'CHALLENGE URL',
    cell: ({ row }) => (
      <a href={row.original.challenge_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
        {row.original.challenge_url}
      </a>
    )
  },
  {
    accessorKey: 'status',
    header: 'STATUS',
    cell: ({ row }) => {
      const status = row.original.status;
      let statusClass = '';

      if (status === 'creating') {
        statusClass = 'text-green-600';
      } else if (status === 'deleting') {
        statusClass = 'text-red-600';
      } else if (status === 'error') {
        statusClass = 'text-yellow-600';
      } else if (status === 'active') {
        statusClass = 'text-green-300';
      } else if (status === 'queued') {
        statusClass = 'text-blue-500';
        // If queued, and has metadata with taskId, show the QueuedChallengeStatus component
        if (row.original.metadata && typeof row.original.metadata === 'object') {
          const metadata = row.original.metadata;
          return (
            <div className="min-w-[200px]">
              <span className={statusClass}>QUEUED</span>
              <button
                onClick={() => {
                  // Create a modal to show the QueuedChallengeStatus component
                  // This would be implemented elsewhere
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('showQueuedChallengeStatus', {
                      detail: {
                        instanceId: row.original.id,
                        taskId: metadata.taskId,
                        queuePosition: metadata.queuePosition || 0,
                        priority: metadata.priority || 2
                      }
                    }));
                  }
                }}
                className="ml-2 text-xs text-blue-500 underline"
              >
                Details
              </button>
            </div>
          );
        }
      } else {
        statusClass = 'text-gray-600';
      }

      return <span className={statusClass}>{status}</span>;
    }
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <CellAction
        data={row.original}
        updateChallengeStatus={updateChallengeStatus}
      />
    )
  }
];
