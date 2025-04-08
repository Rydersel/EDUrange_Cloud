'use client';

import React, { useRef, useEffect } from 'react';
import { isDevMode } from '../dev-config';
import { logger } from '../logger';
import { 
  PERFORMANCE_MONITORING_ENABLED,
  RENDER_TIME_WARNING_THRESHOLD,
  MAX_RENDERS_BEFORE_WARNING,
  LOG_COMPONENT_MOUNTS,
  LOG_COMPONENT_RENDERS,
  LOG_CHANGED_PROPS,
  DEFAULT_MONITORED_COMPONENTS
} from './config';
import { performanceRegistry } from './PerformancePanel';

/**
 * Higher-order component that adds performance monitoring to a component.
 * This HOC wraps a component and tracks its render times and frequency.
 * 
 * @param {React.ComponentType} Component - The component to wrap
 * @param {Object} options - Additional options
 * @returns {React.ComponentType} - The wrapped component with performance monitoring
 */
export const withPerformanceMonitoring = (Component, options = {}) => {
  // Get component name
  const displayName = Component.displayName || Component.name || 'Component';
  
  // Create the monitored component
  const MonitoredComponent = React.forwardRef((props, ref) => {
    // Register the component with the registry (will be monitored only if toggled on)
    useEffect(() => {
      if (typeof window !== 'undefined' && isDevMode() && PERFORMANCE_MONITORING_ENABLED) {
        // Check if component is already registered
        const existingComponent = performanceRegistry.getComponents()[displayName];
        
        if (!existingComponent) {
          performanceRegistry.registerComponent(displayName);
        }
        
        // If this component is in the default monitored components list but hasn't been
        // added to the monitored set, add it now
        if (!performanceRegistry.isComponentMonitored(displayName) && 
            DEFAULT_MONITORED_COMPONENTS.includes(displayName)) {
          performanceRegistry.toggleComponentMonitoring(displayName);
        }
      }
    }, []);
    
    // Track render count
    const renderCount = useRef(0);
    
    // Track render time
    const renderStartTime = useRef(performance.now());
    
    // Track previous props for comparison
    const prevProps = useRef({});
    
    // Effect runs after each render
    useEffect(() => {
      // Check if we're in dev mode and this component should be monitored
      if (
        typeof window === 'undefined' || 
        !isDevMode() || 
        !PERFORMANCE_MONITORING_ENABLED || 
        !performanceRegistry.isComponentMonitored(displayName)
      ) {
        return;
      }
      
      // Increment render count
      renderCount.current += 1;
      
      // Calculate render time
      const renderTime = performance.now() - renderStartTime.current;
      
      // Find which props changed
      const changedProps = [];
      if (LOG_CHANGED_PROPS && prevProps.current) {
        Object.keys(props).forEach(key => {
          if (props[key] !== prevProps.current[key]) {
            changedProps.push(key);
          }
        });
      }
      
      // Log initial render (mount)
      if (renderCount.current === 1 && LOG_COMPONENT_MOUNTS) {
        logger.debug(`[Performance] ${displayName} mounted in ${renderTime.toFixed(2)}ms`);
        
        // Update registry with mount data
        performanceRegistry.updateComponent(displayName, {
          mountTime: renderTime,
          renderCount: renderCount.current,
          lastRenderTime: renderTime,
          lastChangedProps: changedProps
        });
        
        renderStartTime.current = performance.now();
        prevProps.current = { ...props };
        return;
      }
      
      // Log subsequent renders
      if (LOG_COMPONENT_RENDERS && renderCount.current > 1) {
        // Update registry with render data
        performanceRegistry.updateComponent(displayName, {
          renderCount: renderCount.current,
          lastRenderTime: renderTime,
          lastChangedProps: changedProps
        });
      }
      
      // Update previous props
      prevProps.current = { ...props };
      
      // Reset start time for next render
      renderStartTime.current = performance.now();
      
      // Warn about potential performance issues
      if (renderCount.current > MAX_RENDERS_BEFORE_WARNING && renderTime > RENDER_TIME_WARNING_THRESHOLD) {
        logger.warn(
          `[Performance] ${displayName} is rendering frequently (${renderCount.current} times) and taking more than ${RENDER_TIME_WARNING_THRESHOLD}ms (${renderTime.toFixed(2)}ms)`
        );
      }
    });
    
    // Render the original component with the same props and ref
    return <Component {...props} ref={ref} />;
  });
  
  // Set display name for debugging
  MonitoredComponent.displayName = `WithPerformanceMonitoring(${displayName})`;
  
  return MonitoredComponent;
};

export default withPerformanceMonitoring; 