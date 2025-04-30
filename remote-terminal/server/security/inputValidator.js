/**
 * Input Validation Module for EDURange Terminal
 * 
 * This module provides validation functions for user inputs
 * to prevent injection attacks and ensure proper data formatting.
 */

/**
 * Validates terminal pod and container name parameters
 * Ensures they only contain alphanumeric characters and hyphens
 * 
 * @param {string} pod - Kubernetes pod name
 * @param {string} container - Kubernetes container name
 * @returns {Object} Validation result with success flag and error if applicable
 */
const validateTerminalParams = (pod, container) => {
  // Regular expression for valid Kubernetes resource names
  // Only alphanumeric characters and hyphens allowed
  const k8sNameRegex = /^[a-zA-Z0-9-]+$/;
  
  if (!k8sNameRegex.test(pod)) {
    return {
      success: false,
      error: "Invalid pod name format. Only alphanumeric characters and hyphens are allowed.",
      status: 400
    };
  }
  
  if (!k8sNameRegex.test(container)) {
    return {
      success: false,
      error: "Invalid container name format. Only alphanumeric characters and hyphens are allowed.",
      status: 400
    };
  }
  
  return {
    success: true
  };
};

/**
 * Validates terminal resize parameters
 * 
 * @param {number} cols - Number of columns
 * @param {number} rows - Number of rows
 * @returns {Object} Validation result with success flag and error if applicable
 */
const validateResizeParams = (cols, rows) => {
  if (!cols || !rows) {
    return {
      success: false,
      error: "Missing cols or rows parameters",
      status: 400
    };
  }
  
  // Convert to numbers if they're strings
  const numCols = Number(cols);
  const numRows = Number(rows);
  
  // Check if they're valid numbers and within reasonable range
  if (isNaN(numCols) || isNaN(numRows)) {
    return {
      success: false,
      error: "Cols and rows must be valid numbers",
      status: 400
    };
  }
  
  if (numCols < 10 || numCols > 500 || numRows < 5 || numRows > 500) {
    return {
      success: false,
      error: "Cols and rows must be within reasonable range (10-500 for cols, 5-500 for rows)",
      status: 400
    };
  }
  
  return {
    success: true,
    cols: numCols,
    rows: numRows
  };
};

/**
 * Validates terminal input data
 * 
 * @param {string} data - Terminal input data
 * @returns {Object} Validation result with success flag and error if applicable
 */
const validateInputData = (data) => {
  if (data === undefined || data === null) {
    return {
      success: false,
      error: "No input data provided",
      status: 400
    };
  }
  
  // Verify data is a string
  if (typeof data !== 'string') {
    return {
      success: false,
      error: "Input data must be a string",
      status: 400
    };
  }
  
  // Check max length to prevent large input attacks
  if (data.length > 4096) {
    return {
      success: false,
      error: "Input data exceeds maximum length of 4096 characters",
      status: 400
    };
  }
  
  return {
    success: true
  };
};

module.exports = {
  validateTerminalParams,
  validateResizeParams,
  validateInputData
}; 