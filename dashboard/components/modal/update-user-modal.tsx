'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { User } from '@prisma/client';

interface UpdateUserModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (user: Partial<User>) => void;
}

export const UpdateUserModal: React.FC<UpdateUserModalProps> = ({
  user,
  isOpen,
  onClose,
  onUpdate,
}) => {
  const [isMounted, setIsMounted] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [points, setPoints] = useState<number>(user?.points || 0);
  const [admin, setAdmin] = useState(user?.admin || false);

  useEffect(() => {
    setIsMounted(true);
    if (user) {
      setName(user.name || '');
      setEmail(user.email);
      setAdmin(user.admin);
      setPoints(user.points || 0);
    }
  }, [user]);

  if (!isMounted || !user) {
    return null;
  }

  const handleUpdate = () => {
    onUpdate({ id: user.id, name, email, points, admin });
    onClose();
  };

  return (
    <Modal
      title="Update User"
      description="Update the details of the selected user."
      isOpen={isOpen}
      onClose={onClose}
    >
      <div className="space-y-2">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-white">
            Name
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-white">
            Email
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>
        <div>
          <label htmlFor="points" className="block text-sm font-medium text-white">
            Points
          </label>
          <input
            type="number"
            id="points"
            value={points}
            onChange={(e) => setPoints(parseInt(e.target.value, 10))}
            className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>
        <div className="flex items-center mt-4">
          <input
            id="admin"
            type="checkbox"
            checked={admin}
            onChange={(e) => setAdmin(e.target.checked)}
            className="w-4 h-4 text-white border-gray-300 rounded focus:ring-indigo-500"
          />
          <label htmlFor="admin" className="ml-2 block text-sm text-white">
            Admin
          </label>
        </div>
      </div>
      <div className="flex w-full items-center justify-end space-x-2 pt-6">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="default" onClick={handleUpdate}>
          Save
        </Button>
      </div>
    </Modal>
  );
};
