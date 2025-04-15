import React from 'react';
import { classNames } from '../utils/helpers';

export const Checkbox = ({
  id,
  name,
  checked,
  onChange,
  label,
  helpText,
  className = '',
  disabled = false,
}) => {
  return (
    <div className={classNames("flex items-start", className)}>
      <div className="flex items-center h-5">
        <input
          id={id}
          name={name}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className={classNames(
            "focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300 rounded",
            disabled ? "opacity-50 cursor-not-allowed" : ""
          )}
          disabled={disabled}
        />
      </div>
      {(label || helpText) && (
        <div className="ml-3 text-sm">
          {label && (
            <label htmlFor={id} className={classNames(
              "font-medium text-gray-700",
              disabled ? "opacity-50 cursor-not-allowed" : ""
            )}>
              {label}
            </label>
          )}
          {helpText && (
            <p className="text-gray-500">{helpText}</p>
          )}
        </div>
      )}
    </div>
  );
}; 