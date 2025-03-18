import React from 'react';
import { classNames } from '../utils/helpers';

const TextField = ({
  label,
  id,
  name,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  helpText,
  className = '',
  required = false,
  disabled = false,
  ...props
}) => {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="mt-1 relative rounded-md shadow-sm">
        <input
          type={type}
          name={name}
          id={id}
          value={value}
          onChange={onChange}
          className={classNames(
            'block w-full rounded-md sm:text-sm',
            error
              ? 'border-red-300 text-red-900 placeholder-red-300 focus:outline-none focus:ring-red-500 focus:border-red-500'
              : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500',
            disabled ? 'bg-gray-100 cursor-not-allowed' : ''
          )}
          placeholder={placeholder}
          disabled={disabled}
          {...props}
        />
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600" id={`${id}-error`}>
          {error}
        </p>
      )}
      {helpText && !error && (
        <p className="mt-2 text-sm text-gray-500" id={`${id}-description`}>
          {helpText}
        </p>
      )}
    </div>
  );
};

export default TextField; 