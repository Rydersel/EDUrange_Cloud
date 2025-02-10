'use client';
import { Checkbox } from '@/components/ui/checkbox';
import { User, Session, UserRole } from '@prisma/client';
import { ColumnDef } from '@tanstack/react-table';
import { CellAction } from './cell-action';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';

// Define the complete user type with all relations
interface UserWithRelations extends User {
  sessions: Session[];
  memberOf: { id: string; name: string }[];
  instructorGroups: { id: string; name: string }[];
  challengeCompletions: { id: string; pointsEarned: number }[];
}

const RoleCell = ({ user, colorMap }: { user: UserWithRelations; colorMap: Record<UserRole, string> }) => {
  const [loading, setLoading] = useState(false);
  const { data: session } = useSession();
  const router = useRouter();

  // Only allow admins to change roles
  if (!session?.user || session.user.role !== 'ADMIN') {
    return (
      <Badge variant="outline" className={`text-${colorMap[user.role]}-400 border-${colorMap[user.role]}-400`}>
        {user.role}
      </Badge>
    );
  }

  const onRoleChange = async (newRole: UserRole) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/users/${user.id}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        throw new Error('Failed to update user role');
      }

      toast.success('User role updated successfully');
      router.refresh();
    } catch (error) {
      toast.error('Error updating user role');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-8 px-2" disabled={loading}>
          <Badge variant="outline" className={`text-${colorMap[user.role]}-400 border-${colorMap[user.role]}-400`}>
            {user.role}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1">
        <div className="space-y-1">
          <h4 className="font-medium text-xs px-2 pb-1">Change Role</h4>
          <div className="space-y-0.5">
            {Object.keys(colorMap).map((role) => (
              <Button
                key={role}
                variant="ghost"
                className="w-full justify-start h-6 px-2 text-xs font-normal"
                onClick={() => onRoleChange(role as UserRole)}
                disabled={user.role === role || loading}
              >
                <Shield className={`mr-1.5 h-3 w-3 text-${colorMap[role as UserRole]}-400`} />
                {role}
              </Button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const GroupsCell = ({ groups }: { groups: { id: string; name: string }[] }) => {
  const router = useRouter();
  
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-8 px-2">
          <Badge variant="outline">
            {groups.length} group{groups.length !== 1 ? 's' : ''}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2">
        <div className="space-y-1">
          <h4 className="font-medium text-xs px-1">Groups:</h4>
          {groups.length > 0 ? (
            <div className="space-y-0.5">
              {groups.map((group) => (
                <Button
                  key={group.id}
                  variant="ghost"
                  className="w-full justify-start h-7 px-2 text-xs font-normal"
                  onClick={() => router.push(`/dashboard/competitions/${group.id}`)}
                >
                  <span>{group.name}</span>
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground px-1">Not a member of any groups</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const columns: ColumnDef<UserWithRelations>[] = [
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
    header: 'Name',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span>{row.original.name || 'No name'}</span>
      </div>
    )
  },
  {
    accessorKey: 'email',
    header: 'Email'
  },
  {
    accessorKey: 'role',
    header: 'Role',
    cell: ({ row }) => {
      const colorMap: Record<UserRole, string> = {
        ADMIN: 'red',
        INSTRUCTOR: 'blue',
        STUDENT: 'green'
      };
      return <RoleCell user={row.original} colorMap={colorMap} />;
    }
  },
  {
    accessorKey: 'sessions',
    header: 'Status',
    cell: ({ row }) => {
      const hasActiveSessions = row.original.sessions?.some(
        s => new Date(s.expires) > new Date()
      );
      return (
        <Badge variant={hasActiveSessions ? "default" : "secondary"}>
          {hasActiveSessions ? 'Online' : 'Offline'}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'memberOf',
    header: 'Groups',
    cell: ({ row }) => <GroupsCell groups={row.original.memberOf} />
  },
  {
    accessorKey: 'createdAt',
    header: 'Member Since',
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString()
  },
  {
    id: 'actions',
    cell: ({ row }) => <CellAction data={row.original} />
  }
];
