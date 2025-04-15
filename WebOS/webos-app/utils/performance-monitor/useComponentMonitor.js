'use client';

import { useEffect, useRef } from 'react';
import { isDevMode } from '../dev-config';
import { performanceRegistry } from './PerformancePanel';
import { 
  PERFORMANCE_MONITORING_ENABLED,
  DEFAULT_MONITORED_COMPONENTS
} from './config';

/**
 * Hook to manually monitor component performance
 * Use this in components that don't use the withPerformanceMonitoring HOC
 * 
 * @param {string} componentName - The name of the component to monitor
 * @param {Object} dependencies - Object containing dependencies to track for re-renders
 * @returns {void}
 * 
 * @example
 * // In a functional component:
 * function MyComponent({ prop1, prop2 }) {
 *   useComponentMonitor('MyComponent', { prop1, prop2 });
 *   // component code...
 * }
 */
export function useComponentMonitor(componentName, dependencies = {}) {
  // Only run in development mode
  if (typeof window === 'undefined' || !isDevMode() || !PERFORMANCE_MONITORING_ENABLED) {
    return;
  }
  
  const renderCount = useRef(0);
  const renderStartTime = useRef(performance.now());
  const prevDeps = useRef({});
  const mountTimeRef = useRef(null);
  
  // Register component on mount
  useEffect(() => {
    console.log(`[Performance] Manual registration of component: ${componentName}`);
    
    // Register the component if not already registered
    if (!performanceRegistry.getComponents()[componentName]) {
      performanceRegistry.registerComponent(componentName);
    }
    
    // If this is a default monitored component, ensure it's being monitored
    if (DEFAULT_MONITORED_COMPONENTS.includes(componentName) && 
        !performanceRegistry.isComponentMonitored(componentName)) {
      performanceRegistry.toggleComponentMonitoring(componentName);
    }
    
    // Track mount time
    const mountTime = performance.now() - renderStartTime.current;
    mountTimeRef.current = mountTime;
    
    // Update registry with mount data
    performanceRegistry.updateComponent(componentName, {
      mountTime,
      renderCount: 1,
      lastRenderTime: mountTime,
      lastChangedProps: Object.keys(dependencies)
    });
    
    // Initialize for next render
    renderCount.current = 1;
    renderStartTime.current = performance.now();
    prevDeps.current = { ...dependencies };
    
    // Not monitoring anything if not being monitored
    if (!performanceRegistry.isComponentMonitored(componentName)) {
      return;
    }
    
    console.log(`[Performance] ${componentName} mounted in ${mountTime.toFixed(2)}ms`);
  }, [componentName]);
  
  // Track renders
  useEffect(() => {
    // Skip if not being monitored
    if (!performanceRegistry.isComponentMonitored(componentName)) {
      return;
    }
    
    // Skip the first render (mount)
    if (renderCount.current === 1) {
      return;
    }
    
    // Calculate render time
    const renderTime = performance.now() - renderStartTime.current;
    
    // Find changed dependencies
    const changedProps = [];
    Object.keys(dependencies).forEach(key => {
      if (dependencies[key] !== prevDeps.current[key]) {
        changedProps.push(key);
      }
    });
    
    // Update registry
    performanceRegistry.updateComponent(componentName, {
      renderCount: renderCount.current,
      lastRenderTime: renderTime,
      lastChangedProps: changedProps
    });
    
    console.log(
      `[Performance] ${componentName} re-rendered (#${renderCount.current}) in ${renderTime.toFixed(2)}ms`,
      changedProps.length > 0 ? `Changed deps: ${changedProps.join(', ')}` : 'No deps changed'
    );
    
    // Update for next render
    renderCount.current++;
    renderStartTime.current = performance.now();
    prevDeps.current = { ...dependencies };
  }, [componentName, ...Object.values(dependencies)]);
}

export default useComponentMonitor; 