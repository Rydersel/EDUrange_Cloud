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
