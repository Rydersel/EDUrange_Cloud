import React, { Component } from 'react';
import getAppsConfig from '../../app/apps.config';
import DesktopLayout from '../desktop/DesktopLayout';
import AppManager from '../app_manager/AppManager';
import BattlefrontAnimation from '../util-components/battlefront-animation';

export class Desktop extends Component {
    constructor() {
        super();
        this.state = {
            apps: [],
            focused_windows: {},
            closed_windows: {},
            allAppsView: false,
            overlapped_windows: {},
            disabled_apps: {},
            favourite_apps: {},
            hideDock: false,
            minimized_windows: {},
            desktop_apps: [],
            context_menus: {
                desktop: false,
                default: false,
            },
            menuPosition: { x: 0, y: 0 },
            controlCenterVisible: false,
            app_instances: {},
            showBattlefrontAnimation: false,
            pendingAppOpen: null,
        };
        this.app_stack = [];
        this.initFavourite = {};
        this.appManagerRef = React.createRef();
    }

    async componentDidMount() {
        const apps = await getAppsConfig();
        this.setState({ apps }, this.fetchAppsData);
        this.setContextListeners();
        this.launchStartupApps(apps);

        // Add a click listener with passive option for better performance
        document.addEventListener('click', this.handleWindowFocus, { capture: true, passive: true });

        // Set up periodic check to ensure all windows are clickable (less frequent)
        this.clickabilityCheckInterval = setInterval(() => {
            // Count windows with zero pointer events
            const unclickableWindows = document.querySelectorAll('.main-window[style*="pointer-events: none"]');
            if (unclickableWindows.length > 0) {
                console.log('[FOCUS DEBUG] Found unclickable windows! Fixing pointer events...');
                unclickableWindows.forEach(win => {
                    win.style.pointerEvents = 'auto';
                    console.log(`[FOCUS DEBUG] Restored pointer events for window ${win.id}`);
                });
            }
        }, 5000); // Check every 5 seconds instead of 2 for better performance

        // Add performance monitoring (dev only)
        if (process.env.NODE_ENV === 'development') {
            // Log window stack metrics occasionally for debugging
            this.debugInterval = setInterval(() => {
                console.log('[PERF DEBUG] Current app_stack:', this.app_stack);
                console.log('[PERF DEBUG] Window count:', document.querySelectorAll('.main-window').length);
            }, 10000);
        }
    }

    componentWillUnmount() {
        this.removeContextListeners();

        // Remove the click listener
        document.removeEventListener('click', this.handleWindowFocus, { capture: true });

        // Clear intervals
        if (this.clickabilityCheckInterval) {
            clearInterval(this.clickabilityCheckInterval);
        }

        if (this.debugInterval) {
            clearInterval(this.debugInterval);
        }
    }

    fetchAppsData = () => {
        const initialData = {
            focused_windows: {},
            closed_windows: {},
            disabled_apps: {},
            favourite_apps: {},
            overlapped_windows: {},
            minimized_windows: {},
            desktop_apps: [],
        };

        this.state.apps.forEach(app => {
            initialData.focused_windows[app.id] = false;
            initialData.closed_windows[app.id] = true;
            initialData.disabled_apps[app.id] = app.disabled;
            initialData.favourite_apps[app.id] = app.favourite;
            initialData.overlapped_windows[app.id] = false;
            initialData.minimized_windows[app.id] = false;
            if (app.desktop_shortcut) initialData.desktop_apps.push(app.id);
        });

        this.setState(initialData);
        this.initFavourite = { ...initialData.favourite_apps };
    }

    launchStartupApps = (apps) => {
        apps.forEach(app => {
            if (app.launch_on_startup) {
                this.setState(prevState => ({
                    closed_windows: { ...prevState.closed_windows, [app.id]: false }
                }), () => {
                    this.openApp(app.id);
                });
            }
        });
    }

    setContextListeners = () => {
        document.addEventListener('contextmenu', this.checkContextMenu);
        document.addEventListener('click', this.hideAllContextMenu);
    }

    removeContextListeners = () => {
        document.removeEventListener("contextmenu", this.checkContextMenu);
        document.removeEventListener("click", this.hideAllContextMenu);
    }

    checkContextMenu = (e) => {
        e.preventDefault();
        this.hideAllContextMenu();
        // Only show context menu if clicking on the desktop area
        const desktopArea = e.target.closest('[data-context="desktop-area"]');
        if (desktopArea || e.target === document.documentElement) {
            this.showContextMenu(e, "desktop");
        }
    }

    hideAllContextMenu = () => {
        const menus = { ...this.state.context_menus };
        Object.keys(menus).forEach(key => menus[key] = false);
        this.setState({ context_menus: menus });
    }

    showContextMenu = (e, menuType) => {
        const menus = { ...this.state.context_menus };
        menus[menuType] = true;
        this.setState({
            context_menus: menus,
            menuPosition: { x: e.clientX, y: e.clientY }
        });
    }

    focus = (objId) => {
        // Skip if the window is already focused
        if (this.state.focused_windows[objId]) {
            console.log(`[FOCUS DEBUG] Window ${objId} already focused, skipping`);
            return;
        }

        console.log(`[FOCUS DEBUG] Setting focus for window ${objId}`);

        // Cache DOM elements to avoid repeated querySelector calls
        const windowElements = {};
        const windowPositions = {};

        // Get all relevant window elements first (single DOM traversal)
        Object.keys(this.state.focused_windows).forEach(key => {
            const windowElement = document.getElementById(key);
            if (windowElement) {
                windowElements[key] = windowElement;
                // Store positions for all windows to ensure consistent positioning
                const rect = windowElement.getBoundingClientRect();
                windowPositions[key] = {
                    x: rect.x,
                    y: rect.y,
                    origTransform: windowElement.style.transform || ''
                };
            }
        });

        // Set z-index immediately for snappier visual feedback
        if (windowElements[objId]) {
            windowElements[objId].style.zIndex = '30';
        }

        // Move the window to the top of the stack without changing order of other windows
        if (this.app_stack.includes(objId)) {
            // Move window to end of stack (top) without reordering other windows
            this.app_stack = this.app_stack.filter(id => id !== objId);
            this.app_stack.push(objId);
        }

        // Prepare focused_windows state update
        const focused_windows = {};
        Object.keys(this.state.focused_windows).forEach(key => {
            focused_windows[key] = key === objId;

            // Update z-index immediately for all windows (non-focused)
            if (key !== objId && windowElements[key]) {
                // Find the position in app_stack for proper z-index
                const stackIndex = this.app_stack.indexOf(key);
                if (stackIndex !== -1) {
                    windowElements[key].style.zIndex = (20 + stackIndex).toString();
                } else {
                    windowElements[key].style.zIndex = '10';
                }

                // Very important: preserve transform and position unchanged
                // This ensures windows don't move when another is focused
                const currentTransform = windowElements[key].style.transform;
                windowElements[key].style.transform = currentTransform;
            }
        });

        // Use a single setState call to minimize renders
        this.setState({ focused_windows }, () => {
            // Position restoration only if absolutely necessary
            let positionChanged = false;

            // Check if any window positions have changed significantly (more than 5px)
            Object.keys(windowPositions).forEach(key => {
                const windowElement = windowElements[key];
                if (!windowElement) return;

                // Check current position against stored position
                const rect = windowElement.getBoundingClientRect();
                if (Math.abs(rect.x - windowPositions[key].x) > 5 ||
                    Math.abs(rect.y - windowPositions[key].y) > 5) {
                    positionChanged = true;
                }
            });

            // Only restore positions if a major change was detected
            if (positionChanged) {
                requestAnimationFrame(() => {
                    // Restore positions for all windows
                    Object.keys(windowPositions).forEach(key => {
                        const windowElement = windowElements[key];
                        if (!windowElement) return;

                        // Get current position
                        const rect = windowElement.getBoundingClientRect();

                        // Check if position changed significantly
                        if (Math.abs(rect.x - windowPositions[key].x) > 5 ||
                            Math.abs(rect.y - windowPositions[key].y) > 5) {
                            console.log(`[FOCUS DEBUG] Window ${key} moved during focus change. Restoring position.`);

                            // Restore original transform directly
                            windowElement.style.transform = windowPositions[key].origTransform;

                            // Log the restoration
                            console.log(`[FOCUS DEBUG] Restored window ${key} to original transform: ${windowPositions[key].origTransform}`);
                        }
                    });

                    // Update focused window z-index
                    this.updateFocusedWindowZIndices(objId);
                });
            }
        });
    }

    // Optimized method for updating only the z-index of the focused window
    updateFocusedWindowZIndices = (focusedId) => {
        const focusedWindow = document.getElementById(focusedId);
        if (focusedWindow) {
            // Ensure the focused window is on top
            focusedWindow.style.zIndex = '30';
            focusedWindow.style.pointerEvents = 'auto';
        }
    }

    hideDock = (objId, hide) => {
        if (hide === this.state.hideDock) return;

        if (objId === null) {
            if (!hide || Object.values(this.state.overlapped_windows).some(overlapped => overlapped)) {
                this.setState({ hideDock: !hide });
            }
            return;
        }

        const overlapped_windows = { ...this.state.overlapped_windows, [objId]: hide };
        this.setState({ hideDock: hide, overlapped_windows });
    }

    handleNewAppOpen = (appId) => {
        this.setState(prevState => ({
            favourite_apps: { ...prevState.favourite_apps, [appId]: true },
            closed_windows: { ...prevState.closed_windows, [appId]: false },
            allAppsView: false
        }), () => {
            this.focus(appId);
            this.app_stack.push(appId);
        });
    }

    handleAppRestore = (appId) => {
        this.setState(prevState => ({
            minimized_windows: { ...prevState.minimized_windows, [appId]: false }
        }));
    }

    handleInstanceCreated = (instance) => {
        console.log(`[INSTANCE DEBUG] handleInstanceCreated called for instance ${instance.id}`, instance);

        // Make sure this instance is properly initialized in our state
        this.setState(prevState => {
            // Initialize all the necessary state for this instance
            const focused_windows = { ...prevState.focused_windows, [instance.id]: false };
            const closed_windows = { ...prevState.closed_windows, [instance.id]: false };
            const minimized_windows = { ...prevState.minimized_windows, [instance.id]: false };
            const overlapped_windows = { ...prevState.overlapped_windows, [instance.id]: false };

            // Store instance in app_instances state
            const app_instances = { ...prevState.app_instances, [instance.id]: instance };

            // Log what we're adding to state
            console.log(`[INSTANCE DEBUG] Initializing state for ${instance.id}:`, {
                focused: false,
                closed: false,
                minimized: false,
                overlapped: false
            });

            return {
                focused_windows,
                closed_windows,
                minimized_windows,
                overlapped_windows,
                app_instances
            };
        }, () => {
            // After state is updated, focus the new instance and add to app_stack
            this.focus(instance.id);

            // Add to app_stack if not already there
            if (!this.app_stack.includes(instance.id)) {
                this.app_stack.push(instance.id);
            }

            // Update z-indices to ensure proper stacking
            this.updateWindowZIndices();
        });
    }

    // Enhanced app closing for terminal instances
    closeApp = (objId) => {

        // Remove from app_stack
        const stackIndex = this.app_stack.indexOf(objId);
        if (stackIndex !== -1) {
            this.app_stack.splice(stackIndex, 1);
        }

        // Give focus to another window if this one was focused
        this.giveFocusToLastApp();

        // Show dock if it was hidden by this window
        this.hideDock(null, false);

        // Update state for this window
        this.setState(prevState => {
            // Common state updates
            const result = {
                closed_windows: { ...prevState.closed_windows, [objId]: true }
            };

            // Handle favorite apps (don't change if it's a terminal instance)
            const isTerminalInstance = objId.startsWith('terminal-');
            if (!isTerminalInstance && !this.initFavourite[objId]) {
                result.favourite_apps = { ...prevState.favourite_apps, [objId]: false };
            }

            return result;
        }, () => {
            // Handle terminal instances specifically
            if (objId.startsWith('terminal-')) {

                // Remove terminal instance from app_instances
                this.setState(prevState => {
                    const app_instances = { ...prevState.app_instances };
                    delete app_instances[objId];
                    return { app_instances };
                });
            }

            // Update z-indices after closing
            this.updateWindowZIndices();
        });
    }

    hasMinimised = (objId) => {
        const minimized_windows = { ...this.state.minimized_windows, [objId]: true };
        const focused_windows = { ...this.state.focused_windows, [objId]: false };
        this.setState({ minimized_windows, focused_windows });
        this.hideDock(null, false);
        this.giveFocusToLastApp();
    }

    giveFocusToLastApp = () => {
        if (!this.checkAllMinimised()) {
            for (const appId of this.app_stack) {
                if (!this.state.minimized_windows[appId]) {
                    this.focus(appId);
                    break;
                }
            }
        }
    }

    checkAllMinimised = () => {
        return Object.keys(this.state.minimized_windows).every(
            key => this.state.closed_windows[key] || this.state.minimized_windows[key]
        );
    }

    toggleControlCenter = () => {
        this.setState(prevState => ({
            controlCenterVisible: !prevState.controlCenterVisible,
            hideDock: !prevState.controlCenterVisible
        }));
    }

    openApp = (appId) => {
        if (typeof window !== 'undefined' &&
            localStorage.getItem('battlefront-animation-enabled') === 'true' &&
            this.state.closed_windows[appId] &&
            appId !== 'settings') {  // Don't show animation for settings app
            this.setState({
                showBattlefrontAnimation: true,
                pendingAppOpen: appId
            });
        } else {
            this.openAppDirectly(appId);
        }
    }

    openAppDirectly = (appId) => {
        if (this.appManagerRef.current) {
            this.appManagerRef.current.handleAppOpen(appId);
        }
    }

    handleAnimationComplete = () => {
        this.setState({ showBattlefrontAnimation: false }, () => {
            if (this.state.pendingAppOpen) {
                this.openAppDirectly(this.state.pendingAppOpen);
                this.setState({ pendingAppOpen: null });
            }
        });
    }

    // Optimized event handler uses passive events for better performance
    handleWindowFocus = (e) => {
        // Skip processing if e.target is null or not part of DOM
        if (!e.target || !e.target.isConnected) return;

        // Use e.composedPath() if available for better handling of shadow DOM and faster traversal
        const path = e.composedPath ? e.composedPath() : null;

        // Use composed path for faster checking if available
        if (path) {
            // Early return for dock and status bar (much faster than closest())
            if (path.some(el =>
                el.classList && (el.classList.contains('dock-bar') || el.id === 'status-bar'))) {
                return;
            }

            // Find window in path (faster than closest())
            const windowElement = path.find(el =>
                el.classList && el.classList.contains('main-window'));

            if (windowElement) {
                this.processWindowFocus(windowElement);
                return;
            }
        }

        // Fallback to traditional DOM traversal if composedPath not available
        if (e.target.closest('.dock-bar') || e.target.closest('#status-bar')) {
            return;
        }

        // Find the closest window
        const windowElement = e.target.closest('.main-window');
        if (windowElement) {
            this.processWindowFocus(windowElement);
        }
    }

    // Separated processing logic for better code organization and performance
    processWindowFocus = (windowElement) => {
        const windowId = windowElement.id;

        // Quick check for eligibility (closed or minimized)
        if (!windowId || this.state.closed_windows[windowId] || this.state.minimized_windows[windowId]) {
            return;
        }

        // Skip if already focused - avoids unnecessary state updates
        if (this.state.focused_windows[windowId]) {
            return;
        }

        // Focus the window through the optimized focus method
        this.focus(windowId);

        // Only update app_stack if needed
        if (!this.app_stack.includes(windowId)) {
            this.app_stack.push(windowId);
        }
    }

    // Update window indices with specific handling for terminal instances
    updateWindowZIndices = () => {
        // Minimum z-index to ensure windows are always above desktop elements but below popups
        const MIN_WINDOW_Z_INDEX = 10;

        // First ensure all windows in DOM have pointer events enabled
        const allWindows = document.querySelectorAll('.main-window');
        allWindows.forEach(windowEl => {
            // Make sure all windows have pointer events
            windowEl.style.pointerEvents = 'auto';

            // Get window ID
            const windowId = windowEl.id;

            // Check if it's a terminal instance
            const isTerminalInstance = windowId.startsWith('terminal-');

            // Log instance information
            if (isTerminalInstance) {
            }

            // Ensure it has a minimum z-index if not in app_stack
            if (!this.app_stack.includes(windowId)) {
                windowEl.style.zIndex = MIN_WINDOW_Z_INDEX.toString();
            }
        });

        // Set z-index for all windows in app_stack based on their position
        // Higher index in app_stack = higher z-index (more in front)
        this.app_stack.forEach((windowId, index) => {
            const windowElement = document.getElementById(windowId);
            if (windowElement) {
                // Base z-index of 20 for unfocused windows, plus position in stack
                // Focused window gets special z-index of 30
                const zIndex = this.state.focused_windows[windowId] ? 30 : (20 + index);

                // Apply the z-index
                windowElement.style.zIndex = zIndex.toString();

                // Also ensure pointer events are enabled
                windowElement.style.pointerEvents = 'auto';
            }
        });
    }

    render() {
        return (
            <>
                {this.state.showBattlefrontAnimation && (
                    <BattlefrontAnimation onAnimationComplete={this.handleAnimationComplete} />
                )}
                <AppManager
                    ref={this.appManagerRef}
                    apps={this.state.apps}
                    closed_windows={this.state.closed_windows}
                    disabled_apps={this.state.disabled_apps}
                    minimized_windows={this.state.minimized_windows}
                    app_stack={this.app_stack}
                    focus={this.focus}
                    onNewAppOpen={this.handleNewAppOpen}
                    onAppRestore={this.handleAppRestore}
                    onInstanceCreated={this.handleInstanceCreated}
                />
                <DesktopLayout
                    bg_image_name={this.props.bg_image_name}
                    changeBackgroundImage={this.props.changeBackgroundImage}
                    apps={this.state.apps}
                    desktop_apps={this.state.desktop_apps}
                    openApp={this.openApp}
                    context_menus={this.state.context_menus}
                    menuPosition={this.state.menuPosition}
                    controlCenterVisible={this.state.controlCenterVisible}
                    toggleControlCenter={this.toggleControlCenter}
                    closed_windows={this.state.closed_windows}
                    focused_windows={this.state.focused_windows}
                    minimized_windows={this.state.minimized_windows}
                    app_instances={this.state.app_instances}
                    closeApp={this.closeApp}
                    focus={this.focus}
                    hideDock={this.hideDock}
                    hasMinimised={this.hasMinimised}
                    favourite_apps={this.state.favourite_apps}
                />
            </>
        );
    }
}

export default Desktop;
