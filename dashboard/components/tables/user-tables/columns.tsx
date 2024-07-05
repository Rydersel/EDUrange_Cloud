'use client';
import { Checkbox } from '@/components/ui/checkbox';
import { User, Session } from '@prisma/client';
import { ColumnDef } from '@tanstack/react-table';
import { CellAction } from './cell-action';

// Define a new type that includes sessions
interface UserWithSessions extends User {
  sessions: Session[];
}

export const columns: ColumnDef<UserWithSessions>[] = [
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
    accessorKey: 'name',
    header: 'NAME'
  },
  {
    accessorKey: 'email',
    header: 'EMAIL'
  },
  {
    accessorKey: 'admin',
    header: 'ADMIN',
    cell: ({ row }) => (row.original.admin ? 'Yes' : 'No')
  },
  {
    accessorKey: 'sessions',
    header: 'SESSIONS',
    cell: ({ row }) => row.original.sessions?.length ?? 0
  },
  {
    accessorKey: 'createdAt',
    header: 'CREATED AT',
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString()
  },
  {
    accessorKey: 'points',
    header: 'Points'
  },
  {
    id: 'actions',
    cell: ({ row }) => <CellAction data={row.original} />
  }
];
