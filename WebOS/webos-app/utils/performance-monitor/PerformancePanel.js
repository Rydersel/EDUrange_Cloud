'use client';

import React, { useState, useEffect, useRef, memo } from 'react';
import { isDevMode } from '../dev-config';
import {
  PERFORMANCE_MONITORING_ENABLED,
  performanceConfig,
  RENDER_TIME_WARNING_THRESHOLD
} from './config';

/**
 * Performance data for a single component
 * @typedef {Object} ComponentPerformanceData
 * @property {string} name - Component name
 * @property {number} mountTime - Time taken to mount (ms)
 * @property {number} lastRenderTime - Time taken for last render (ms)
 * @property {number} renderCount - Number of times rendered
 * @property {Array<string>} lastChangedProps - Props that changed in last render
 */

/**
 * Performance registry for tracking component performance
 */
export const performanceRegistry = {
  components: {},
  monitoredComponentNames: new Set(),

  /**
   * Register a component for performance monitoring
   * @param {string} name - Component name
   * @param {Object} initialData - Initial performance data
   */
  registerComponent: function(name, initialData = {}) {
    if (!this.components[name]) {
      this.components[name] = {
        name,
        mountTime: 0,
        renderCount: 0,
        lastRenderTime: 0,
        lastChangedProps: [],
        ...initialData
      };
    }
  },

  /**
   * Update component performance data
   * @param {string} name - Component name
   * @param {Object} data - Performance data to update
   */
  updateComponent: function(name, data = {}) {
    if (!this.components[name]) {
      this.registerComponent(name);
    }

    // Make a copy of the current data
    const currentData = { ...this.components[name] };

    // Create the updated data
    const updatedData = {
      ...currentData,
      ...data
    };

    // Apply the update
    this.components[name] = updatedData;

    return updatedData;
  },

  /**
   * Get all component performance data
   * @returns {Object} - Performance data
   */
  getComponents: function() {
    return this.components;
  },

  /**
   * Get the list of monitored component names
   * @returns {Array<string>} - Component names
   */
  getMonitoredComponentNames: function() {
    return [...this.monitoredComponentNames];
  },

  /**
   * Check if a component is monitored
   * @param {string} name - Component name
   * @returns {boolean} - Whether the component is monitored
   */
  isComponentMonitored: function(name) {
    return this.monitoredComponentNames.has(name);
  },

  /**
   * Toggle monitoring for a component
   * @param {string} name - Component name
   * @returns {boolean} - New monitoring state
   */
  toggleComponentMonitoring: function(name) {
    if (this.isComponentMonitored(name)) {
      this.monitoredComponentNames.delete(name);
      return false;
    } else {
      this.monitoredComponentNames.add(name);
      return true;
    }
  },

  /**
   * Reset all performance data
   */
  reset: function() {
    this.components = {};
    // Do not reset monitored components list
  },

  /**
   * Manually update performance data for a component
   * This should be called in relevant lifecycle hooks like useEffect
   * @param {string} name - Component name
   * @param {Object} metrics - Performance metrics
   */
  manualUpdate: function(name, metrics = {}) {
    // Skip if not in dev mode or performance monitoring is disabled
    if (typeof window === 'undefined' || !isDevMode() || !PERFORMANCE_MONITORING_ENABLED) {
      return;
    }

    try {
      // Ensure component is registered
      if (!this.components[name]) {
        this.registerComponent(name);
      }

      // Always update if this is a monitored component
      if (this.isComponentMonitored(name)) {
        // Get current state
        const currentData = this.components[name];

        // Update render count
        const currentRenderCount = currentData.renderCount || 0;

        // Ensure renderTime is a valid number
        const renderTime = typeof metrics.renderTime === 'number' && !isNaN(metrics.renderTime)
          ? metrics.renderTime
          : 0;

        // Create update object
        const updateObj = {
          renderCount: currentRenderCount + 1,
          lastRenderTime: renderTime,
          lastChangedProps: Array.isArray(metrics.changedProps) ? metrics.changedProps : [],
          ...metrics
        };

        // Apply update
        this.updateComponent(name, updateObj);
      }
    } catch (error) {
      console.error(`[Performance] Error updating metrics for ${name}:`, error);
    }
  },
};

/**
 * Performance Panel UI component
 * Shows real-time performance metrics for monitored components
 */
const PerformancePanel = memo(function PerformancePanel() {
  // State hooks
  const [shouldRender, setShouldRender] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [performanceData, setPerformanceData] = useState({});
  const [fps, setFps] = useState(0);
  const [activeTab, setActiveTab] = useState('monitor'); // 'monitor', 'config', 'issues', or 'advanced'
  const [newComponentName, setNewComponentName] = useState('');
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name', 'renders', 'lastRenderTime'
  const [sortDirection, setSortDirection] = useState('asc');
  const [expandedView, setExpandedView] = useState(false);

  // Advanced metrics state
  const [advancedMetrics, setAdvancedMetrics] = useState({
    memory: {
      used: 0,
      limit: 0,
      percent: 0
    },
    domNodes: 0,
    componentCount: 0,
    renderDuration: {
      average: 0,
      peak: 0
    },
    longTasks: {
      count: 0,
      totalDuration: 0
    },
    eventHandlerCount: 0,
    rerenderRate: 0,
    pendingRenders: 0
  });

  // Ref hooks - declare all refs at the component level
  const fpsRef = useRef(0);
  const framesRef = useRef(0);
  const lastTimeRef = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const prevDataRef = useRef({});
  const lastMetricsRef = useRef(null);

  // Check if we should render this component at all
  useEffect(() => {
    // This ensures isDevMode is only called on the client
    const shouldRenderNow =
      typeof window !== 'undefined' &&
      isDevMode() &&
      PERFORMANCE_MONITORING_ENABLED;

    setShouldRender(shouldRenderNow);

    // Initialize with default monitored components
    if (shouldRenderNow && performanceConfig.defaultMonitoredComponents) {
      // First register the components
      performanceConfig.defaultMonitoredComponents.forEach(componentName => {
        // Register with initial placeholder data
        performanceRegistry.registerComponent(componentName, {
          name: componentName,
          mountTime: 0,
          renderCount: 0,
          lastRenderTime: 0,
          lastChangedProps: []
        });
      });

      // Create the monitoredComponentNames Set directly
      performanceRegistry.monitoredComponentNames = new Set(
        performanceConfig.defaultMonitoredComponents
      );
    }
  }, []);

  // Update FPS calculation
  useEffect(() => {
    if (!shouldRender) return;

    const updateFPS = () => {
      const now = performance.now();
      const delta = now - lastTimeRef.current;

      if (delta >= 1000) {
        fpsRef.current = Math.round((framesRef.current * 1000) / delta);
        setFps(fpsRef.current);
        framesRef.current = 0;
        lastTimeRef.current = now;
      }

      framesRef.current += 1;
      requestAnimationFrame(updateFPS);
    };

    const frameId = requestAnimationFrame(updateFPS);
    return () => cancelAnimationFrame(frameId);
  }, [shouldRender]);

  // Update performance data periodically
  useEffect(() => {
    if (!shouldRender) return;

    // Initial data load
    const components = performanceRegistry.getComponents();
    setPerformanceData({...components});
    prevDataRef.current = components;

    // Set up faster refresh rate (250ms) for smoother updates
    const intervalId = setInterval(() => {
      const components = performanceRegistry.getComponents();

      // Only update state if data has changed to avoid unnecessary renders
      if (JSON.stringify(components) !== JSON.stringify(prevDataRef.current)) {
        setPerformanceData({...components});
        prevDataRef.current = components;
      }
    }, 250); // Refresh 4 times per second

    return () => clearInterval(intervalId);
  }, [shouldRender]); // Remove performanceData from dependencies to avoid infinite loop

  // Toggle visibility with keyboard shortcut (Alt+P)
  useEffect(() => {
    if (!shouldRender) return;

    const handleKeyDown = (e) => {
      if (e.altKey && e.key === 'p') {
        setIsVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shouldRender]);

  // Collect advanced performance metrics
  useEffect(() => {
    if (!shouldRender || !expandedView) return;

    // Function to collect all metrics
    const collectMetrics = () => {
      try {
        // Memory usage
        let memoryData = { used: 0, limit: 0, percent: 0 };
        if (performance && 'memory' in performance) {
          // Chrome-specific memory info
          const memory = performance.memory;
          const used = Math.round((memory.usedJSHeapSize || 0) / (1024 * 1024));
          const limit = Math.round((memory.jsHeapSizeLimit || 0) / (1024 * 1024));
          memoryData = {
            used,
            limit,
            percent: limit > 0 ? (used / limit) * 100 : 0
          };
        } else {
          // Use a falling estimate based on component count if actual memory info isn't available
          const componentCount = Object.keys(performanceRegistry.getComponents()).length;
          memoryData = {
            used: Math.round(componentCount * 0.5), // Rough estimate
            limit: 2048, // Default estimate
            percent: Math.min(componentCount * 0.025, 100) // Rough estimate
          };
        }

        // DOM nodes count
        const domNodes = document.querySelectorAll('*').length;

        // Component count - estimated from registered performance components
        const componentCount = Object.keys(performanceRegistry.getComponents()).length;

        // Render duration metrics
        const components = Object.values(performanceRegistry.getComponents());
        const renderTimes = components
          .map(c => c.lastRenderTime || 0)
          .filter(time => time > 0);

        const avgRenderTime = renderTimes.length > 0
          ? renderTimes.reduce((sum, time) => sum + time, 0) / renderTimes.length
          : 0;

        const peakRenderTime = renderTimes.length > 0
          ? Math.max(...renderTimes)
          : 0;

        // Long tasks - use the experimental Longtasks API if available
        let longTasksData = { count: 0, totalDuration: 0 };
        try {
          if (typeof PerformanceObserver !== 'undefined' &&
              typeof performance.getEntriesByType === 'function') {
            // Check if longtask entries are available
            const longTaskEntries = performance.getEntriesByType('longtask') || [];

            if (longTaskEntries.length > 0) {
              longTasksData = {
                count: longTaskEntries.length,
                totalDuration: longTaskEntries.reduce(
                  (sum, entry) => sum + entry.duration, 0
                )
              };
            } else {
              // Fallback estimation based on render times
              const slowRenders = Object.values(performanceRegistry.getComponents())
                .filter(comp => (comp.lastRenderTime || 0) > 50)
                .length;

              longTasksData = {
                count: slowRenders,
                totalDuration: Object.values(performanceRegistry.getComponents())
                  .reduce((sum, comp) => {
                    return sum + (comp.lastRenderTime > 50 ? comp.lastRenderTime : 0);
                  }, 0)
              };
            }
          }
        } catch (err) {
          // Silently catch errors with Long tasks API
        }

        // Count event handlers (approximation)
        const countEventHandlers = () => {
          let count = 0;
          const elements = document.querySelectorAll('*');

          // Check for common React event handler properties
          for (const el of elements) {
            // Check for DOM event handlers
            const eventTypes = ['click', 'change', 'input', 'keydown', 'keypress', 'keyup'];
            for (const type of eventTypes) {
              if (el[`on${type}`]) count++;
            }
          }

          // Add known React event handlers from our registry
          count += Object.values(performanceRegistry.getComponents())
            .reduce((sum, comp) => {
              // Estimate based on changed props that look like handlers
              const handlerProps = (comp.lastChangedProps || [])
                .filter(prop => prop.startsWith('on') || prop.startsWith('handle'));
              return sum + handlerProps.length;
            }, 0);

          return count;
        };

        // Re-render rate - components renders per second
        const totalRenders = components.reduce(
          (sum, comp) => sum + (comp.renderCount || 0), 0
        );
        const rerenderRate = totalRenders / (fpsRef.current || 1) * (1000 / 60);

        // Create new metrics object
        const newMetrics = {
          memory: memoryData,
          domNodes,
          componentCount,
          renderDuration: {
            average: avgRenderTime,
            peak: peakRenderTime
          },
          longTasks: longTasksData,
          eventHandlerCount: countEventHandlers(),
          rerenderRate: rerenderRate,
          pendingRenders: 0 // Not easily measurable
        };

        // Only update if metrics have changed significantly
        if (!lastMetricsRef.current || 
            JSON.stringify(newMetrics) !== JSON.stringify(lastMetricsRef.current)) {
          setAdvancedMetrics(newMetrics);
          lastMetricsRef.current = newMetrics;
        }

      } catch (err) {
        // Silently catch errors in metrics collection
      }
    };

    // Initial collection
    collectMetrics();

    // Set up interval for collection
    const intervalId = setInterval(collectMetrics, 1000);

    return () => clearInterval(intervalId);
  }, [shouldRender, expandedView]); // Remove fps from dependencies to avoid potential loops

  // Handle adding a new component to monitor
  const handleAddComponent = () => {
    if (newComponentName.trim()) {
      performanceRegistry.toggleComponentMonitoring(newComponentName.trim());
      setNewComponentName('');
    }
  };

  // Toggle monitoring for a component
  const toggleMonitoring = (name) => {
    performanceRegistry.toggleComponentMonitoring(name);
    setPerformanceData({...performanceRegistry.getComponents()});
  };

  // Filter and sort components
  const filteredComponents = Object.values(performanceData)
    .filter(component => {
      if (!filter) return true;
      return component.name.toLowerCase().includes(filter.toLowerCase());
    })
    .sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'renders':
          comparison = a.renderCount - b.renderCount;
          break;
        case 'lastRenderTime':
          comparison = a.lastRenderTime - b.lastRenderTime;
          break;
        default: // 'name'
          comparison = a.name.localeCompare(b.name);
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

  // Toggle sort direction or change sort field
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('asc');
    }
  };

  // Don't render anything if not in dev mode
  if (!shouldRender) {
    return null;
  }

  // If panel is not visible, only render a minimal indicator
  if (!isVisible) {
    return (
      <div
        onClick={() => setIsVisible(true)}
        style={{
          position: 'fixed',
          bottom: '10px',
          right: '75px',
          padding: '5px 10px',
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          fontSize: '12px',
          borderRadius: '4px',
          cursor: 'pointer',
          zIndex: 9999
        }}
      >
        FPS: {fps} | Performance
      </div>
    );
  }

  // Array of all component names that have been registered
  const allComponents = Object.keys(performanceData);
  const monitoredComponents = performanceRegistry.getMonitoredComponentNames();

  // Styles for tabs
  const tabStyle = {
    padding: '5px 10px',
    cursor: 'pointer',
    fontSize: '12px',
    borderBottom: '2px solid transparent'
  };

  const activeTabStyle = {
    ...tabStyle,
    fontWeight: 'bold',
    borderBottom: '2px solid white'
  };

  // Render full performance panel
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '10px',
        right: '10px',
        width: expandedView ? '450px' : '350px',
        maxHeight: '500px',
        overflowY: 'auto',
        background: 'rgba(0,0,0,0.85)',
        color: 'white',
        padding: '10px',
        borderRadius: '4px',
        fontFamily: 'monospace',
        fontSize: '12px',
        zIndex: 9999,
        transition: 'width 0.3s ease-in-out'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h3 style={{ margin: 0 }}>Performance Monitor</h3>
        <div>
          <button
            onClick={() => setExpandedView(!expandedView)}
            style={{ marginRight: '5px', fontSize: '10px' }}
          >
            {expandedView ? 'Simple' : 'Advanced'}
          </button>
          <button
            onClick={() => setIsVisible(false)}
            style={{ fontSize: '10px' }}
          >
            Hide
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <strong>FPS: {fps}</strong>

        {/* Advanced metrics section - only shown when expanded */}
        {expandedView && (
          <div style={{
            marginTop: '10px',
            padding: '8px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '4px',
            fontSize: '11px'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '5px', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '3px' }}>
              System Metrics
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <div>Memory Usage:</div>
                <div style={{ fontWeight: 'bold' }}>
                  {advancedMetrics.memory.used.toFixed(1)} MB ({advancedMetrics.memory.percent.toFixed(1)}%)
                </div>
              </div>

              <div>
                <div>DOM Nodes:</div>
                <div style={{ fontWeight: 'bold' }}>{advancedMetrics.domNodes}</div>
              </div>

              <div>
                <div>Components:</div>
                <div style={{ fontWeight: 'bold' }}>{advancedMetrics.componentCount}</div>
              </div>

              <div>
                <div>Long Tasks:</div>
                <div style={{ fontWeight: 'bold' }}>
                  {advancedMetrics.longTasks.count} ({advancedMetrics.longTasks.totalDuration.toFixed(0)}ms)
                </div>
              </div>

              <div>
                <div>Avg Render:</div>
                <div style={{ fontWeight: 'bold' }}>{advancedMetrics.renderDuration.average.toFixed(2)}ms</div>
              </div>

              <div>
                <div>Peak Render:</div>
                <div style={{ fontWeight: 'bold' }}>{advancedMetrics.renderDuration.peak.toFixed(2)}ms</div>
              </div>

              <div>
                <div>Event Handlers:</div>
                <div style={{ fontWeight: 'bold' }}>{advancedMetrics.eventHandlerCount}</div>
              </div>

              <div>
                <div>Re-renders/sec:</div>
                <div style={{ fontWeight: 'bold' }}>{advancedMetrics.rerenderRate.toFixed(1)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        marginBottom: '15px',
        borderBottom: '1px solid rgba(255,255,255,0.2)'
      }}>
        <div
          style={activeTab === 'monitor' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('monitor')}
        >
          Metrics
        </div>
        <div
          style={activeTab === 'config' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('config')}
        >
          Configure
        </div>
        <div
          style={activeTab === 'issues' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('issues')}
        >
          Issues
        </div>
      </div>

      {/* Monitor tab content */}
      {activeTab === 'monitor' && (
        <div>
          <div style={{ marginBottom: '10px' }}>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter components..."
              style={{
                width: '100%',
                padding: '5px',
                fontSize: '12px',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '3px',
                color: 'white',
                marginBottom: '5px'
              }}
            />

            <div style={{ display: 'flex', fontSize: '11px', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '5px' }}>
              <div
                style={{ flex: 1, cursor: 'pointer', fontWeight: sortBy === 'name' ? 'bold' : 'normal' }}
                onClick={() => handleSort('name')}
              >
                Component {sortBy === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
              </div>
              <div
                style={{ width: '60px', cursor: 'pointer', textAlign: 'right', fontWeight: sortBy === 'renders' ? 'bold' : 'normal' }}
                onClick={() => handleSort('renders')}
              >
                Renders {sortBy === 'renders' && (sortDirection === 'asc' ? '↑' : '↓')}
              </div>
              <div
                style={{ width: '80px', cursor: 'pointer', textAlign: 'right', fontWeight: sortBy === 'lastRenderTime' ? 'bold' : 'normal' }}
                onClick={() => handleSort('lastRenderTime')}
              >
                Render Time {sortBy === 'lastRenderTime' && (sortDirection === 'asc' ? '↑' : '↓')}
              </div>
            </div>
          </div>

          {filteredComponents
            .filter(component => monitoredComponents.includes(component.name))
            .map(component => (
              <div
                key={component.name}
                style={{
                  marginBottom: '10px',
                  padding: '8px',
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '4px',
                  position: 'relative'
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '5px',
                  right: '5px',
                  fontSize: '10px',
                  cursor: 'pointer'
                }} onClick={() => toggleMonitoring(component.name)}>
                  ×
                </div>

                <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{component.name}</div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                  <div>Renders: <span style={{ fontWeight: 'bold' }}>{component.renderCount}</span></div>
                  <div style={{
                    color: component.lastRenderTime > RENDER_TIME_WARNING_THRESHOLD ? '#ff6b6b' : 'inherit'
                  }}>
                    Last render: <span style={{ fontWeight: 'bold' }}>{component.lastRenderTime?.toFixed(2) || 0}ms</span>
                  </div>
                </div>

                <div style={{ fontSize: '11px' }}>
                  Mount: <span style={{ fontWeight: 'bold' }}>{component.mountTime?.toFixed(2) || 0}ms</span>
                </div>

                {component.lastChangedProps?.length > 0 && (
                  <div style={{ marginTop: '5px', fontSize: '11px' }}>
                    <div>Changed props: </div>
                    <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '3px', borderRadius: '2px', marginTop: '2px' }}>
                      {component.lastChangedProps.join(', ')}
                    </div>
                  </div>
                )}
              </div>
            ))}

          {filteredComponents
            .filter(component => monitoredComponents.includes(component.name))
            .length === 0 && (
            <div style={{ padding: '10px', textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>
              {filter
                ? 'No matching monitored components found'
                : monitoredComponents.length === 0
                  ? 'No components being monitored. Switch to Configure tab to add some.'
                  : 'Monitored components have not rendered yet.'
              }
            </div>
          )}
        </div>
      )}

      {/* Config tab content */}
      {activeTab === 'config' && (
        <div>
          <div style={{ marginBottom: '15px' }}>
            <div style={{ marginBottom: '5px' }}>Add component to monitor:</div>
            <div style={{ display: 'flex' }}>
              <input
                type="text"
                value={newComponentName}
                onChange={(e) => setNewComponentName(e.target.value)}
                placeholder="Component name"
                style={{
                  flex: 1,
                  padding: '5px',
                  fontSize: '12px',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '3px',
                  color: 'white'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddComponent();
                  }
                }}
              />
              <button
                onClick={handleAddComponent}
                style={{
                  marginLeft: '5px',
                  padding: '5px 10px',
                  fontSize: '12px',
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  borderRadius: '3px',
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                Add
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <div style={{ fontWeight: 'bold' }}>
                Available Components ({allComponents.length})
              </div>
              <div>
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter..."
                  style={{
                    padding: '2px 5px',
                    fontSize: '10px',
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: '3px',
                    color: 'white',
                    width: '100px'
                  }}
                />
              </div>
            </div>

            <div style={{
              maxHeight: '200px',
              overflowY: 'auto',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '4px',
              padding: '5px'
            }}>
              {allComponents.length === 0 ? (
                <div style={{ padding: '10px', textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>
                  {filter ? 'No matching components found' : 'No components detected yet'}
                </div>
              ) : (
                allComponents
                  .filter(name => !filter || name.toLowerCase().includes(filter.toLowerCase()))
                  .map(name => {
                    const component = performanceData[name] || { name, renderCount: 0 };
                    return (
                      <div
                        key={name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '5px 8px',
                          marginBottom: '4px',
                          background: monitoredComponents.includes(name)
                            ? 'rgba(45, 212, 191, 0.2)'
                            : 'rgba(255,255,255,0.05)',
                          borderRadius: '3px',
                          transition: 'background 0.2s'
                        }}
                      >
                        <input
                          type="checkbox"
                          id={`monitor-${name}`}
                          checked={monitoredComponents.includes(name)}
                          onChange={() => toggleMonitoring(name)}
                          style={{ marginRight: '8px' }}
                        />
                        <label
                          htmlFor={`monitor-${name}`}
                          style={{
                            flex: 1,
                            cursor: 'pointer',
                            fontWeight: monitoredComponents.includes(name) ? 'bold' : 'normal'
                          }}
                        >
                          {name}
                        </label>

                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>
                          {component.renderCount > 0 ? `${component.renderCount} renders` : 'Not rendered'}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            <div style={{
              marginTop: '10px',
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <button
                onClick={() => {
                  const filteredNames = allComponents.filter(name =>
                    !filter || name.toLowerCase().includes(filter.toLowerCase())
                  );

                  filteredNames.forEach(name => {
                    if (!monitoredComponents.includes(name)) {
                      performanceRegistry.toggleComponentMonitoring(name);
                    }
                  });
                  setPerformanceData({...performanceRegistry.getComponents()});
                }}
                style={{
                  padding: '3px 8px',
                  fontSize: '10px',
                  background: 'rgba(45, 212, 191, 0.3)',
                  border: 'none',
                  borderRadius: '3px',
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                {filter ? 'Monitor Filtered' : 'Monitor All'}
              </button>

              <button
                onClick={() => {
                  const filteredNames = allComponents.filter(name =>
                    !filter || name.toLowerCase().includes(filter.toLowerCase())
                  );

                  filteredNames.forEach(name => {
                    if (monitoredComponents.includes(name)) {
                      performanceRegistry.toggleComponentMonitoring(name);
                    }
                  });
                  setPerformanceData({...performanceRegistry.getComponents()});
                }}
                style={{
                  padding: '3px 8px',
                  fontSize: '10px',
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  borderRadius: '3px',
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                {filter ? 'Clear Filtered' : 'Clear All'}
              </button>
            </div>
          </div>

          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', marginTop: '15px' }}>
            <div>Keyboard Shortcuts:</div>
            <div>- Alt+P: Toggle panel visibility</div>
          </div>
        </div>
      )}

      {/* Issues tab content */}
      {activeTab === 'issues' && (
        <div>
          <div style={{ marginBottom: '10px', fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>
            Components with performance issues:
          </div>

          <div>
            {Object.values(performanceData)
              .filter(component => component.lastRenderTime > RENDER_TIME_WARNING_THRESHOLD)
              .map(component => (
                <div
                  key={component.name}
                  style={{
                    marginBottom: '10px',
                    padding: '8px',
                    background: 'rgba(255, 107, 107, 0.2)',
                    borderRadius: '4px'
                  }}
                >
                  <div style={{ fontWeight: 'bold' }}>{component.name}</div>
                  <div style={{ fontSize: '11px' }}>
                    Slow render: {component.lastRenderTime?.toFixed(2) || 0}ms
                  </div>
                  <div style={{ fontSize: '11px' }}>
                    Renders: {component.renderCount}
                  </div>
                </div>
              ))}
          </div>

          <div>
            {Object.values(performanceData)
              .filter(component => component.renderCount > 10 && component.lastRenderTime <= RENDER_TIME_WARNING_THRESHOLD)
              .map(component => (
                <div
                  key={component.name}
                  style={{
                    marginBottom: '10px',
                    padding: '8px',
                    background: 'rgba(255, 196, 87, 0.2)',
                    borderRadius: '4px'
                  }}
                >
                  <div style={{ fontWeight: 'bold' }}>{component.name}</div>
                  <div style={{ fontSize: '11px' }}>
                    Frequent renders: {component.renderCount}
                  </div>
                  <div style={{ fontSize: '11px' }}>
                    Render time: {component.lastRenderTime?.toFixed(2) || 0}ms
                  </div>
                </div>
              ))}
          </div>

          {Object.values(performanceData).filter(c => c.lastRenderTime > RENDER_TIME_WARNING_THRESHOLD || c.renderCount > 10).length === 0 && (
            <div style={{
              padding: '15px',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.6)',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '4px'
            }}>
              No performance issues detected yet
            </div>
          )}
        </div>
      )}
    </div>
  );
});

PerformancePanel.displayName = 'PerformancePanel';

export default PerformancePanel;
