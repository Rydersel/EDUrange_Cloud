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


    }

    componentWillUnmount() {
        ReactGA.send({ hitType: "pageview", page: "/desktop", title: "Custom Title" });

        window.removeEventListener('resize', this.resizeBoundaries);

        // Remove click listener
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
            r.style.transition = 'none';
        }
    }

    changeCursorToDefault = () => {
        this.setState({ cursorType: "cursor-default" });
        
        // Restore transitions after drag
        var r = document.querySelector("#" + this.id);
        if (r) {
            r.style.transition = '';
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
        var rect = r.getBoundingClientRect();
        r.style.setProperty('--window-transform-x', rect.x.toFixed(1).toString() + "px");
        r.style.setProperty('--window-transform-y', (rect.y.toFixed(1) - 32).toString() + "px");
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

    focusWindow = () => {
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
                >
                    <WindowYBorder resize={this.handleHorizontalResize} />
                    <WindowXBorder resize={this.handleVerticalResize} />
                    <WindowTopBar title={this.props.title} onFocus={this.focusWindow} />
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

}

export default Window

// Window's title bar
export function WindowTopBar(props) {
    return (
        <div
            className="window-drag-handle relative py-1.5 px-3 w-full select-none rounded-t-xl backdrop-blur-md bg-gray-800/90 border-t border-white/20"
            onMouseDown={props.onFocus}
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
