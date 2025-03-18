import React from 'react';
import { classNames } from '../utils/helpers';
import { 
  CheckCircleIcon, 
  XCircleIcon, 
  ClockIcon,
  ExclamationCircleIcon,
  TrashIcon
} from '@heroicons/react/24/solid';

const statusConfig = {
  success: {
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
    icon: CheckCircleIcon,
    iconColor: 'text-green-500'
  },
  installed: {
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
    icon: CheckCircleIcon,
    iconColor: 'text-green-500'
  },
  error: {
    bgColor: 'bg-red-100',
    textColor: 'text-red-800',
    icon: XCircleIcon,
    iconColor: 'text-red-500'
  },
  pending: {
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-800',
    icon: ClockIcon,
    iconColor: 'text-gray-500'
  },
  warning: {
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-800',
    icon: ExclamationCircleIcon,
    iconColor: 'text-yellow-500'
  },
  running: {
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
    icon: ClockIcon,
    iconColor: 'text-blue-500'
  },
  installing: {
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-800',
    icon: ClockIcon,
    iconColor: 'text-yellow-500'
  },
  deleting: {
    bgColor: 'bg-red-100',
    textColor: 'text-red-800',
    icon: TrashIcon,
    iconColor: 'text-red-500'
  }
};

const StatusBadge = ({ status, text, className = '' }) => {
  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;
  
  return (
    <span
      className={classNames(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        config.bgColor,
        config.textColor,
        className
      )}
    >
      <Icon className={classNames('mr-1.5 h-3 w-3', config.iconColor)} aria-hidden="true" />
      {text || status}
    </span>
  );
};

export default StatusBadge; 