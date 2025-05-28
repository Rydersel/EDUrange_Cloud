import React, { Component } from 'react';
import Draggable from 'react-draggable';
import Settings from '../apps/settings';
import ReactGA from 'react-ga4';

export class Window extends Component {
    constructor(props) {
        super();
        this.id = null;
        this.startX = 60;
        this.startY = 10;
        this.state = {
            cursorType: "cursor-default",
            width: 60,
            height: 100,
            closed: false,
            maximized: false,
            parentSize: {
                height: 100,
                width: 100
            }
        }
        this.defaultPosition = props.defaultPosition || { x: Math.floor(Math.random() * (400 - 10 + 1)) + 10, y: Math.floor(Math.random() * (100 - 10 + 1)) + 10 }; // Makes app instances spawn in random location to avoid overlap


    }

    componentDidMount() {
        this.id = this.props.id;
        this.setDefaultWindowDimension();

        // on window resize, resize boundary
        window.addEventListener('resize', this.resizeBoundaries);

        // Set up a MutationObserver to detect when iframes are added to this window
        this.setupIframeListener();

        // Add mouseenter event to focus window when mouse enters
        const windowElement = document.getElementById(this.id);
        if (windowElement) {

            this.mouseEnterHandler = () => {
                if (!this.props.isFocused) {
                    // Focus with slight delay to ensure it doesn't interfere with other interactions
                    requestAnimationFrame(() => {
                        this.focusWindow();
                    });
                }
            };

            windowElement.addEventListener('mouseenter', this.mouseEnterHandler);
        }
    }

    componentWillUnmount() {
        ReactGA.send({ hitType: "pageview", page: "/desktop", title: "Custom Title" });

        window.removeEventListener('resize', this.resizeBoundaries);

        // Clean up iframe related listeners
        if (this.observer) {
            this.observer.disconnect();
        }
        this.removeIframeEventListeners();

        // Remove mouseenter handler if it exists
        const windowElement = document.getElementById(this.id);
        if (windowElement && this.mouseEnterHandler) {
            windowElement.removeEventListener('mouseenter', this.mouseEnterHandler);
        }
    }

    setDefaultWindowDimension = () => {
        const appConfig = this.props.apps.find(app => app.id === this.props.id);
        if (appConfig) {
            this.setState({ width: appConfig.width, height: appConfig.height }, this.resizeBoundaries);
        } else {
            if (window.innerWidth < 640) {
                this.setState({ height: 60, width: 85 }, this.resizeBoundaries);
            } else {
                this.setState({ height: 85, width: 60 }, this.resizeBoundaries);
            }
        }
    }

    resizeBoundaries = () => {
        this.setState({
            parentSize: {
                height: window.innerHeight //parent height
                    - (window.innerHeight * (this.state.height / 100.0))  // this window's height
                    - 28 // some padding
                ,
                width: window.innerWidth // parent width
                    - (window.innerWidth * (this.state.width / 100.0)) //this window's width
            }
        });
    }

    changeCursorToMove = () => {
        this.focusWindow();
        if (this.state.maximized) {
            this.restoreWindow();
        }
        this.setState({ cursorType: "cursor-move" });

        // Remove transition during drag
        var r = document.querySelector("#" + this.id);
        if (r) {
            // Store original position before drag starts
            const rect = r.getBoundingClientRect();
            r.setAttribute('data-original-x', rect.x);
            r.setAttribute('data-original-y', rect.y);

            // Disable transitions during drag
            r.style.transition = 'none';
        }
    }

    changeCursorToDefault = () => {
        this.setState({ cursorType: "cursor-default" });

        // Restore transitions after drag
        var r = document.querySelector("#" + this.id);
        if (r) {
            // Update position variables after drag ends
            const rect = r.getBoundingClientRect();
            r.style.setProperty('--window-transform-x', rect.x.toFixed(1).toString() + "px");
            r.style.setProperty('--window-transform-y', (rect.y.toFixed(1) - 32).toString() + "px");

            // Re-enable transitions with a slight delay to prevent flickering
            setTimeout(() => {
                if (r) r.style.transition = '';
            }, 50);
        }
    }

    handleVerticalResize = () => {
        this.setState({ height: this.state.height + 0.1 }, this.resizeBoundaries);
    }

    handleHorizontalResize = () => {
        this.setState({ width: this.state.width + 0.1 }, this.resizeBoundaries);
    }

    setWindowPosition = () => {
        var r = document.querySelector("#" + this.id);
        if (!r) return;

        const rect = r.getBoundingClientRect();
        r.style.setProperty('--window-transform-x', rect.x.toFixed(1).toString() + "px");
        r.style.setProperty('--window-transform-y', (rect.y.toFixed(1) - 32).toString() + "px");

        // Store current transform for future restoration
        r.setAttribute('data-last-transform', r.style.transform || '');
    }

    checkOverlap = () => {
        var r = document.querySelector("#" + this.id);
        var rect = r.getBoundingClientRect();
        if (rect.x.toFixed(1) < 50) { // if this window overlaps with SideBar
            this.props.hideDock(this.id, true);
        }
        else {
            this.props.hideDock(this.id, false);
        }
    }

    focusWindow = (e) => {
        // Skip focus if already focused to avoid unnecessary rendering
        if (this.props.isFocused) {
            return;
        }

        // Prevent any default behavior if event is provided
        if (e && e.preventDefault) {
            e.preventDefault();
        }

        // Apply visual feedback immediately for perceived performance
        const windowElement = document.getElementById(this.id);
        if (windowElement) {
            // Pre-apply some visual changes before the state update for faster feedback
            windowElement.style.zIndex = '30';

            // Apply transition for snappier visual feedback using transform
            windowElement.style.transform = windowElement.style.transform + ' scale(1.001)';

            // Reset transform after a short delay to create a quick "pop" effect
            requestAnimationFrame(() => {
                windowElement.style.transform = windowElement.style.transform.replace(' scale(1.001)', '');
            });

            // Ensure all pointer events are enabled
            windowElement.style.pointerEvents = 'auto';
        }

        this.props.focus(this.id);
    }

    minimizeWindow = () => {
        let posx = -310;
        if (this.state.maximized) {
            posx = -510;
        }
        this.setWindowPosition();

        // Add transition only for minimize animation
        var r = document.querySelector("#" + this.id);
        r.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

        // get corresponding sidebar app's position
        var sideBarApp = document.querySelector("#sidebar-" + this.id).getBoundingClientRect();

        // translate window to that position
        r.style.transform = `translate(${posx}px,${sideBarApp.y.toFixed(1) - 240}px) scale(0.2)`;
        r.style.opacity = '0';
        this.props.hasMinimised(this.id);

        // Remove transition after animation completes
        setTimeout(() => {
            if (r) {
                r.style.transition = '';
            }
        }, 300);
    }

    restoreWindow = () => {
        var r = document.querySelector("#" + this.id);
        this.setDefaultWindowDimension();

        // Add transition for restore animation
        r.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

        // get previous position
        let posx = r.style.getPropertyValue("--window-transform-x");
        let posy = r.style.getPropertyValue("--window-transform-y");

        r.style.transform = `translate(${posx},${posy})`;

        setTimeout(() => {
            this.setState({ maximized: false });
            this.checkOverlap();

            // Remove transition after animation completes
            if (r) {
                r.style.transition = '';
            }
        }, 300);
    }

    maximizeWindow = () => {
        if (this.state.maximized) {
            this.restoreWindow();
        }
        else {
            this.focusWindow();
            var r = document.querySelector("#" + this.id);
            this.setWindowPosition();

            // Add transition for maximize animation
            r.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

            // translate window to maximize position
            r.style.transform = `translate(-1pt,-2pt)`;
            this.setState({ maximized: true, height: 96.3, width: 100.2 });
            this.props.hideDock(this.id, true);

            // Remove transition after animation completes
            setTimeout(() => {
                if (r) {
                    r.style.transition = '';
                }
            }, 300);
        }
    }

    closeWindow = () => {
        this.setWindowPosition();

        // Add smooth transition for close
        var r = document.querySelector("#" + this.id);
        if (r) {
            r.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        }

        this.setState({ closed: true }, () => {
            this.props.hideDock(this.id, false);

            // After animation completes, tell parent to unmount
            setTimeout(() => {
                this.props.closed(this.id);
            }, 300);
        });
    }

    getOpenInstancesCount = () => {
        // Implement the logic to count open instances of the window
        // This is a placeholder and should be replaced with the actual implementation
        return 0;
    }

    render() {
        const appConfig = this.props.apps.find(app => app.id === this.props.id.split('-')[0]);
        const disableScrolling = appConfig && appConfig.disableScrolling ? 'overflow-hidden' : 'overflow-y-auto';
        const ScreenComponent = this.props.screen;
        const extraProps = appConfig ? { ...appConfig } : {};

        return (
            <Draggable
                axis="both"
                handle=".window-drag-handle"
                grid={[1, 1]}
                scale={1}
                onStart={this.changeCursorToMove}
                onStop={this.changeCursorToDefault}
                onDrag={this.checkOverlap}
                allowAnyClick={false}
                defaultPosition={this.defaultPosition}
                bounds={{ left: 0, top: 0, right: this.state.parentSize.width, bottom: this.state.parentSize.height }}
            >
                <div style={{ width: `${this.state.width}%`, height: `${this.state.height}%`, backgroundColor: 'transparent' }}
                    className={`${this.state.cursorType} ${this.state.closed ? "closed-window scale-95 opacity-0" : "scale-100 opacity-100"} ${
                        this.state.maximized ? "duration-300 ease-out rounded-none" : "rounded-xl"
                    } ${this.props.minimized ? "opacity-0 invisible duration-300 ease-out" : ""} ${
                        this.props.isFocused ? "z-30 shadow-2xl backdrop-blur-sm bg-white/10" : "z-20 notFocused backdrop-blur-sm bg-white/5"
                    } opened-window overflow-hidden min-w-1/4 min-h-1/4 main-window absolute border border-white/10 flex flex-col ${
                        this.state.cursorType === "cursor-move" ? "" : "transition-all transform"
                    }`}
                    id={this.id}
                    onClick={this.focusWindow}
                    onMouseDown={(e) => {
                        // Don't interfere with dragging behavior
                        if (!e.target.closest('.window-drag-handle')) {
                            this.focusWindow();
                        }
                    }}
                >
                    <WindowYBorder resize={this.handleHorizontalResize} />
                    <WindowXBorder resize={this.handleVerticalResize} />
                    <WindowTopBar title={this.props.title} />
                    <WindowEditButtons minimize={this.minimizeWindow} maximize={this.maximizeWindow} isMaximized={this.state.maximized} close={this.closeWindow} id={this.id} />
                    {this.id === "settings" ? (
                        <Settings changeBackgroundImage={this.props.changeBackgroundImage} currBgImgName={this.props.bg_image_name} />
                    ) : (
                        <WindowMainScreen screen={() => <ScreenComponent {...extraProps} />} title={this.props.title}
                            openApp={this.props.openApp}
                            disableScrolling={disableScrolling} />
                    )}
                </div>
            </Draggable>
        )
    }

    // Setup MutationObserver to detect iframe additions
    setupIframeListener = () => {
        // Wait for the component to be fully mounted
        setTimeout(() => {
            const windowElement = document.getElementById(this.id);
            if (!windowElement) {
                return;
            }

            // Create a mutation observer to watch for iframe additions
            this.observer = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    if (mutation.addedNodes.length) {
                        // Find any new iframes and add the focus handler
                        this.addIframeEventListeners();
                    }
                });
            });

            // Start observing the window content for iframe additions
            this.observer.observe(windowElement, {
                childList: true,
                subtree: true
            });

            // Also check for existing iframes
            this.addIframeEventListeners();
        }, 500); // Wait a bit for the DOM to be ready
    }

    // Try to create an overlay to catch events for cross-origin iframes
    createOverlayForIframe = (iframe, index) => {
        try {
            // Don't create multiple overlays
            if (iframe.dataset.hasOverlay === 'true') {
                return;
            }


            // Create a transparent div overlay
            const overlay = document.createElement('div');
            overlay.className = 'iframe-overlay';
            overlay.style.position = 'absolute';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.backgroundColor = 'transparent';
            // Use a lower z-index to ensure it doesn't block most interactions
            overlay.style.zIndex = '2';
            overlay.style.pointerEvents = 'none'; // Start with no pointer events

            // Add overlay to iframe's parent
            iframe.parentNode.style.position = 'relative';
            iframe.parentNode.appendChild(overlay);

            // Store reference to overlay
            iframe._overlay = overlay;
            iframe.dataset.hasOverlay = 'true';

            // Get a reference to the window element
            const windowElement = document.getElementById(this.id);
            if (windowElement) {
                // Only enable the overlay when the window isn't focused
                const updateOverlayState = () => {
                    if (!this.props.isFocused) {
                        // Enable pointer events only when not focused
                        overlay.style.pointerEvents = 'auto';
                    } else {
                        // Disable pointer events when window is focused
                        overlay.style.pointerEvents = 'none';
                    }
                };

                // Update initially
                updateOverlayState();

                // Set up a MutationObserver to detect focus changes
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach(mutation => {
                        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                            // Check if the focused class changed
                            updateOverlayState();
                        }
                    });
                });

                // Observe the window element for class changes
                observer.observe(windowElement, { attributes: true });

                // Store observer for cleanup
                iframe._observer = observer;
            }

            // Add single click handler to overlay - just focus the window
            overlay.addEventListener('click', (e) => {

                // Focus the window
                this.focusWindow();

                // Immediately disable pointer events on overlay
                overlay.style.pointerEvents = 'none';

                // Let the click pass through to the iframe
                e.stopPropagation();
            });

        } catch (e) {
        }
    }

    // Add event listeners to all iframes in this window
    addIframeEventListeners = () => {
        const windowElement = document.getElementById(this.id);
        if (!windowElement) {
            return;
        }

        const iframes = windowElement.querySelectorAll('iframe');

        iframes.forEach((iframe, index) => {

            // Only add listener if we haven't already
            if (!iframe.dataset.focusHandlerAdded) {
                try {
                    iframe.addEventListener('load', () => {
                        try {
                            // Try to access the iframe content
                            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

                            // If we can access the document, it's same-origin - add direct handlers
                            // Add mousedown and focus event listeners
                            const iframeMouseDownHandler = (e) => {
                                this.focusWindow();
                            };

                            iframeDoc.addEventListener('mousedown', iframeMouseDownHandler);

                            // Also add click listener as backup
                            iframeDoc.addEventListener('click', (e) => {
                                this.focusWindow();
                            });

                            // Save reference to handler for cleanup
                            iframe._iframeMouseDownHandler = iframeMouseDownHandler;

                            // Mark as handled to avoid duplicate listeners
                            iframe.dataset.focusHandlerAdded = 'true';
                        } catch (e) {
                            // Cross-origin restriction - use overlay technique

                            // Create transparent overlay for cross-origin iframe
                            this.createOverlayForIframe(iframe, index);

                            // Mark as handled
                            iframe.dataset.focusHandlerAdded = 'true';
                        }
                    });

                    // Also check immediately in case iframe is already loaded
                    try {
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

                        // Direct event handlers
                        iframeDoc.addEventListener('mousedown', () => {
                            this.focusWindow();
                        });

                        iframe.dataset.focusHandlerAdded = 'true';
                    } catch (e) {
                        // Cross-origin - use overlay
                        this.createOverlayForIframe(iframe, index);
                        iframe.dataset.focusHandlerAdded = 'true';
                    }
                } catch (e) {

                    // Fallback to overlay if we can't set up normal handlers
                    this.createOverlayForIframe(iframe, index);
                    iframe.dataset.focusHandlerAdded = 'true';
                }
            } else {
            }
        });
    }

    // Clean up all iframe event listeners when the window unmounts
    removeIframeEventListeners = () => {
        const windowElement = document.getElementById(this.id);
        if (!windowElement) {
            return;
        }

        const iframes = windowElement.querySelectorAll('iframe');

        iframes.forEach((iframe, index) => {
            try {

                // Clean up mutation observer if it exists
                if (iframe._observer) {
                    iframe._observer.disconnect();
                }

                // Remove overlay if it exists
                if (iframe._overlay && iframe._overlay.parentNode) {
                    iframe._overlay.parentNode.removeChild(iframe._overlay);
                }

                // Try to access iframe document to remove event listeners
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

                    // Remove the stored handler if it exists
                    if (iframe._iframeMouseDownHandler) {
                        iframeDoc.removeEventListener('mousedown', iframe._iframeMouseDownHandler);
                    }

                    // Remove click handler as well
                    iframeDoc.removeEventListener('click', this.focusWindow);
                } catch (e) {
                    // Cross-origin restriction - can't access to remove, but that's okay
                }
            } catch (e) {
                console.log(`[IFRAME DEBUG] Error during cleanup for iframe ${index}:`, e.message);
            }
        });
    }

    componentDidUpdate(prevProps) {
        // Log when window focus state changes
        if (prevProps.isFocused !== this.props.isFocused) {

            // Update overlay state for all iframes when focus changes
            const windowElement = document.getElementById(this.id);
            if (windowElement) {
                const iframes = windowElement.querySelectorAll('iframe');
                iframes.forEach((iframe, index) => {
                    if (iframe._overlay) {
                        iframe._overlay.style.pointerEvents = this.props.isFocused ? 'none' : 'auto';
                    }
                });

                // Optimize focus state change with direct DOM manipulation - much faster than class changes
                if (this.props.isFocused) {
                    // Apply focused styles directly for snappier response
                    windowElement.style.zIndex = '30';
                    windowElement.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.25)';
                    windowElement.style.backdropFilter = 'blur(8px)';
                    windowElement.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                } else {
                    // Reset to unfocused styles
                    windowElement.style.zIndex = '20';
                    windowElement.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
                    windowElement.style.backdropFilter = 'blur(5px)';
                    windowElement.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                }

                // Only apply display change when needed to avoid unnecessary reflows
                if (prevProps.minimized !== this.props.minimized) {
                    // Force a repaint to ensure clickable areas are updated, only when minimized state changes
                    windowElement.style.display = 'none';
                    windowElement.offsetHeight; // Force reflow
                    windowElement.style.display = 'flex';
                }
            }
        }
    }
}

export default Window

// Window's title bar
export function WindowTopBar(props) {
    return (
        <div
            className="window-drag-handle relative py-1.5 px-3 w-full select-none rounded-t-xl backdrop-blur-md bg-gray-800/90 border-t border-white/20"
        >
            <div className="flex justify-center">
                <span className="text-[13px] font-normal tracking-wide text-white truncate max-w-[90%]">
                    {props.title}
                </span>
            </div>
        </div>
    )
}

// Window's Borders
export class WindowYBorder extends Component {
    componentDidMount() {
        this.trpImg = new Image(0, 0);
        this.trpImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        this.trpImg.style.opacity = 0;
    }
    render() {
        return (
            <div className=" window-y-border border-transparent border-1 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" onDragStart={(e) => { e.dataTransfer.setDragImage(this.trpImg, 0, 0) }} onDrag={this.props.resize}>
            </div>
        )
    }
}

export class WindowXBorder extends Component {
    componentDidMount() {
        this.trpImg = new Image(0, 0);
        this.trpImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        this.trpImg.style.opacity = 0;
    }
    render() {
        return (
            <div className=" window-x-border border-transparent border-1 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" onDragStart={(e) => { e.dataTransfer.setDragImage(this.trpImg, 0, 0) }} onDrag={this.props.resize}>
            </div>
        )
    }
}

// Window's Edit Buttons
export function WindowEditButtons(props) {
  return (
    <div className="absolute top-0 left-0 px-2 py-1.5 flex gap-1.5 items-center z-50 group/buttons">
      <button
        className="w-3 h-3 rounded-full bg-red-500 transition-opacity focus:outline-none relative"
        onClick={props.close}
      >
        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/buttons:opacity-100 transition-opacity text-black text-[11px] font-light leading-none" style={{ marginTop: '-0.5px', marginLeft: '0.5px' }}>
          ×
        </span>
      </button>
      <button
        className="w-3 h-3 rounded-full bg-yellow-500 transition-opacity focus:outline-none relative"
        onClick={props.minimize}
      >
        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/buttons:opacity-100 transition-opacity text-black text-[11px] font-light leading-none" style={{ marginTop: '-1px' }}>
          -
        </span>
      </button>
      <button
        className="w-3 h-3 rounded-full bg-green-500 transition-opacity focus:outline-none relative"
        onClick={props.maximize}
      >
        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/buttons:opacity-100 transition-opacity text-black text-[11px] font-light leading-none" style={{ marginTop: '-0.5px' }}>
          +
        </span>
      </button>
    </div>
  )
}

// Window's Main Screen
export class WindowMainScreen extends Component {
    constructor() {
        super();
        this.state = {
            setDarkBg: false,
            isLoading: true
        }
    }

    componentDidMount() {
        // Start loading immediately when app opens
        this.setState({ isLoading: true });

        // Wait for next frame to ensure DOM is ready
        requestAnimationFrame(() => {
            this.setState({ isLoading: false });
        });

        setTimeout(() => {
            this.setState({ setDarkBg: true });
        }, 3000);
    }

    render() {
        const { screen, disableScrolling } = this.props;
        return (
            <div
                className={`w-full flex-grow z-20 max-h-full ${disableScrolling} windowMainScreen ${this.state.setDarkBg ? "bg-black opacity-100" : "opacity-100"}`}
                style={{
                    opacity: this.state.isLoading ? 0 : 1,
                    transition: 'opacity 0.2s ease-in-out',
                }}
            >
                {screen()}
            </div>
        )
    }
}
