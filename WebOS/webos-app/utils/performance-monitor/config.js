'use client';

/**
 * Performance monitoring configuration
 * This file contains settings for the WebOS performance monitoring system.
 */

// Enable/disable performance monitoring globally
export const PERFORMANCE_MONITORING_ENABLED = true;

// Default components to monitor on startup
// Note: Users can modify this list from the Performance Panel UI
export const DEFAULT_MONITORED_COMPONENTS = [
  'Window',
  'WindowManager'
];

// Threshold for render time warnings (in ms)
// Renders taking longer than this will be highlighted in red
export const RENDER_TIME_WARNING_THRESHOLD = 16; // ~60fps

// Maximum number of renders before warning
// Components rendering more than this many times will trigger warnings if they also exceed render time threshold
export const MAX_RENDERS_BEFORE_WARNING = 10;

// Logging options
export const LOG_COMPONENT_MOUNTS = true;
export const LOG_COMPONENT_RENDERS = true;
export const LOG_CHANGED_PROPS = true;

// Export all config values as an object for easy access
export const performanceConfig = {
  enabled: PERFORMANCE_MONITORING_ENABLED,
  defaultMonitoredComponents: DEFAULT_MONITORED_COMPONENTS,
  renderTimeWarningThreshold: RENDER_TIME_WARNING_THRESHOLD,
  maxRendersBeforeWarning: MAX_RENDERS_BEFORE_WARNING,
  logComponentMounts: LOG_COMPONENT_MOUNTS,
  logComponentRenders: LOG_COMPONENT_RENDERS,
  logChangedProps: LOG_CHANGED_PROPS
}; 