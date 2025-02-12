'use client';
import { AlertModal } from '@/components/modal/alert-modal';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { User, UserRole, Session } from '@prisma/client';
import { Edit, MoreHorizontal, Trash, Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

interface UserWithRelations extends User {
  sessions: Session[];
  memberOf: { id: string; name: string }[];
  instructorGroups: { id: string; name: string }[];
  challengeCompletions: { id: string; pointsEarned: number }[];
}

interface CellActionProps {
  data: UserWithRelations;
}

export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const [loading, setLoading] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const router = useRouter();
  const { data: session } = useSession();

  // Only allow admins to perform these actions
  if (!session?.user || session.user.role !== 'ADMIN') {
    return null;
  }

  const onDelete = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/users/${data.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete user');
      }

      toast.success('User deleted successfully');
      router.refresh();
    } catch (error) {
      toast.error('Error deleting user');
      console.error('Error:', error);
    } finally {
      setLoading(false);
      setAlertOpen(false);
    }
  };

  const onRoleChange = async (newRole: UserRole) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/users/${data.id}/role`, {
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
    <>
      <AlertModal
        isOpen={alertOpen}
        onClose={() => setAlertOpen(false)}
        onConfirm={onDelete}
        loading={loading}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => router.push(`/dashboard/users/${data.id}`)}
          >
            <Edit className="mr-2 h-4 w-4" /> View Details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Change Role</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => onRoleChange('ADMIN')}
            disabled={data.role === 'ADMIN'}
          >
            <Shield className="mr-2 h-4 w-4" /> Make Admin
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onRoleChange('INSTRUCTOR')}
            disabled={data.role === 'INSTRUCTOR'}
          >
            <Shield className="mr-2 h-4 w-4" /> Make Instructor
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onRoleChange('STUDENT')}
            disabled={data.role === 'STUDENT'}
          >
            <Shield className="mr-2 h-4 w-4" /> Make Student
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setAlertOpen(true)}
            className="text-red-600"
            disabled={data.id === session?.user?.id}
          >
            <Trash className="mr-2 h-4 w-4" /> Delete User
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
