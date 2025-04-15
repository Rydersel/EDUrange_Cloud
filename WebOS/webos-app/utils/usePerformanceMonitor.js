import { useRef, useEffect } from 'react';
import { isDevMode } from './dev-config';
import { logger } from './logger';

/**
 * A hook for monitoring component performance in development mode.
 * This hook will log render counts and render times to help identify performance bottlenecks.
 * 
 * @param {string} componentName - The name of the component being monitored
 * @param {Object} deps - The dependencies that trigger re-renders
 * @returns {void}
 */
const usePerformanceMonitor = (componentName, deps = {}) => {
  // Only run in development mode
  if (!isDevMode()) return;

  // Track render count
  const renderCount = useRef(0);
  
  // Track render time
  const renderStartTime = useRef(performance.now());
  
  // Track dependency changes
  const prevDeps = useRef(deps);
  
  useEffect(() => {
    // Increment render count
    renderCount.current += 1;
    
    // Calculate render time
    const renderTime = performance.now() - renderStartTime.current;
    
    // Log initial render
    if (renderCount.current === 1) {
      logger.debug(`[Performance] ${componentName} mounted in ${renderTime.toFixed(2)}ms`);
      renderStartTime.current = performance.now();
      return;
    }
    
    // Find which dependencies changed
    const changedDeps = [];
    if (prevDeps.current) {
      Object.keys(deps).forEach(key => {
        if (deps[key] !== prevDeps.current[key]) {
          changedDeps.push(key);
        }
      });
    }
    
    // Log render with changed dependencies
    logger.debug(
      `[Performance] ${componentName} re-rendered (#${renderCount.current}) in ${renderTime.toFixed(2)}ms`,
      changedDeps.length > 0 ? `Changed deps: ${changedDeps.join(', ')}` : 'No deps changed'
    );
    
    // Update previous dependencies
    prevDeps.current = deps;
    
    // Reset start time for next render
    renderStartTime.current = performance.now();
    
    // Set up warning for frequent renders
    if (renderCount.current > 5 && renderTime > 16) {
      logger.warn(
        `[Performance] ${componentName} is rendering frequently (${renderCount.current} times) and taking more than 16ms (${renderTime.toFixed(2)}ms)`
      );
    }
  });
};

export default usePerformanceMonitor; 