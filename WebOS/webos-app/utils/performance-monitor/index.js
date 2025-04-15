'use client';

/**
 * Performance Monitoring System for WebOS
 * 
 * This system provides tools for monitoring and visualizing component performance.
 * It includes:
 * 
 * 1. A higher-order component (withPerformanceMonitoring) for wrapping components
 * 2. A performance panel component for visualizing performance metrics
 * 3. A registry for tracking performance data
 * 4. Configuration options
 */

import { performanceConfig } from './config';
import withPerformanceMonitoring from './withPerformanceMonitoring';
import PerformancePanel, { performanceRegistry } from './PerformancePanel';
import useComponentMonitor from './useComponentMonitor';

// Simple API for using the performance monitoring tools
const PerformanceMonitoring = {
  /**
   * Monitor a component's performance
   * @param {React.ComponentType} Component - The component to monitor
   * @param {Object} options - Monitoring options
   * @returns {React.ComponentType} - Monitored component
   */
  monitor: withPerformanceMonitoring,
  
  /**
   * The performance panel component for visualization
   */
  Panel: PerformancePanel,
  
  /**
   * Hook for manually monitoring components without using the HOC
   * @param {string} componentName - Name of the component
   * @param {Object} dependencies - Dependencies to track
   */
  useMonitor: useComponentMonitor,
  
  /**
   * Register a component with the performance registry
   * @param {string} name - Component name
   */
  register: performanceRegistry.registerComponent,
  
  /**
   * Update a component's performance data
   * @param {string} name - Component name
   * @param {Object} data - Performance data
   */
  update: performanceRegistry.updateComponent,
  
  /**
   * Reset all performance data
   */
  reset: performanceRegistry.reset,
  
  /**
   * Get performance data for all monitored components
   * @returns {Object} - Performance data
   */
  getData: performanceRegistry.getComponents,
  
  /**
   * Configuration settings
   */
  config: performanceConfig
};

// Export individual components for direct usage
export { 
  withPerformanceMonitoring,
  PerformancePanel,
  performanceRegistry,
  performanceConfig,
  useComponentMonitor
};

// Export the API as default
export default PerformanceMonitoring; 