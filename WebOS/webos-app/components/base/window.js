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
        this.setState({ cursorType: "cursor-move" })
    }

    changeCursorToDefault = () => {
        this.setState({ cursorType: "cursor-default" })
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
        // get corresponding sidebar app's position
        var r = document.querySelector("#sidebar-" + this.id);
        var sideBarApp = r.getBoundingClientRect();

        r = document.querySelector("#" + this.id);
        // translate window to that position
        r.style.transform = `translate(${posx}px,${sideBarApp.y.toFixed(1) - 240}px) scale(0.2)`;
        this.props.hasMinimized(this.id);
    }

    restoreWindow = () => {
        var r = document.querySelector("#" + this.id);
        this.setDefaultWindowDimension();
        // get previous position
        let posx = r.style.getPropertyValue("--window-transform-x");
        let posy = r.style.getPropertyValue("--window-transform-y");

        r.style.transform = `translate(${posx},${posy})`;
        setTimeout(() => {
            this.setState({ maximized: false });
            this.checkOverlap();
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
            // translate window to maximize position
            r.style.transform = `translate(-1pt,-2pt)`;
            this.setState({ maximized: true, height: 96.3, width: 100.2 });
            this.props.hideDock(this.id, true);
        }
    }

    closeWindow = () => {
        this.setWindowPosition();
        this.setState({ closed: true }, () => {
            this.props.hideDock(this.id, false);
            setTimeout(() => {
                this.props.closed(this.id)
            }, 300) // after 3 seconds this window will be unmounted from parent (Desktop)
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
                handle=".bg-ub-window-title"
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
                    className={this.state.cursorType + " " + (this.state.closed ? " closed-window " : "") + (this.state.maximized ? " duration-300 rounded-none" : " rounded-lg rounded-b-none") + (this.props.minimized ? " opacity-0 invisible duration-200 " : "") + (this.props.isFocused ? " z-30 " : " z-20 notFocused") + " opened-window overflow-hidden min-w-1/4 min-h-1/4 main-window absolute window-shadow border-black border-opacity-40 border border-t-0 flex flex-col"}
                    id={this.id}
                    onClick={this.focusWindow}
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

}

export default Window

// Window's title bar
export function WindowTopBar(props) {
    return (
        <div className={" relative bg-ub-window-title border-t-2 border-white border-opacity-5 py-1.5 px-3 text-white w-full select-none rounded-b-none"}>
            <div className="flex justify-center text-sm font-bold">{props.title}</div>
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
// components/WindowEditButtons.js
export function WindowEditButtons(props) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH;

  return (
    <div className="absolute select-none right-0 top-0 mt-1 mr-1 flex justify-center items-center">
      <span className="mx-1.5 bg-white bg-opacity-0 hover:bg-opacity-10 rounded-full flex justify-center mt-1 h-5 w-5 items-center" onClick={props.minimize}>
        <img
          src={`./icons/window/window-minimize.svg`}
          alt="ubuntu window minimize"
          className="h-5 w-5 inline"
        />
      </span>
      {
        (props.isMaximized
          ?
          <span className="mx-2 bg-white bg-opacity-0 hover:bg-opacity-10 rounded-full flex justify-center mt-1 h-5 w-5 items-center" onClick={props.maximize}>
            <img
              src={`./icons/window/window-restore.svg`}
              alt="ubuntu window restore"
              className="h-5 w-5 inline"
            />
          </span>
          :
          <span className="mx-2 bg-white bg-opacity-0 hover:bg-opacity-10 rounded-full flex justify-center mt-1 h-5 w-5 items-center" onClick={props.maximize}>
            <img
              src={`./icons/window/window-maximize.svg`}
              alt="ubuntu window maximize"
              className="h-5 w-5 inline"
            />
          </span>
        )
      }
      <button tabIndex="-1" id={`close-${props.id}`} className="mx-1.5 focus:outline-none cursor-default bg-ub-orange bg-opacity-90 hover:bg-opacity-100 rounded-full flex justify-center mt-1 h-5 w-5 items-center" onClick={props.close}>
        <img
          src={`./icons/window/window-close.svg`}
          alt="ubuntu window close"
          className="h-5 w-5 inline"
        />
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
        }
    }
    componentDidMount() {
        setTimeout(() => {
            this.setState({ setDarkBg: true });
        }, 3000);
    }
    render() {
        const { screen, disableScrolling } = this.props;
        return (
            <div className={"w-full flex-grow z-20 max-h-full " + disableScrolling + " windowMainScreen" + (this.state.setDarkBg ? " bg-black opacity-100 " : "opacity-100")}>
                {screen()}
            </div>
        )
    }
}
