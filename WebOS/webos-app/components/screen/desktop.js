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
    }

    componentWillUnmount() {
        this.removeContextListeners();
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
        const focused_windows = { ...this.state.focused_windows };
        Object.keys(focused_windows).forEach(key => focused_windows[key] = key === objId);
        this.setState({ focused_windows });
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
        this.setState(prevState => ({
            app_instances: { ...prevState.app_instances, [instance.id]: instance },
            closed_windows: { ...prevState.closed_windows, [instance.id]: false }
        }), () => {
            this.focus(instance.id);
            this.app_stack.push(instance.id);
        });
    }

    closeApp = (objId) => {
        this.app_stack.splice(this.app_stack.indexOf(objId), 1);
        this.giveFocusToLastApp();
        this.hideDock(null, false);

        const favourite_apps = { ...this.state.favourite_apps };
        const closed_windows = { ...this.state.closed_windows };

        if (!this.initFavourite[objId.split('-')[0]]) favourite_apps[objId] = false;
        closed_windows[objId] = true;

        this.setState({ closed_windows, favourite_apps }, () => {
            if (objId.startsWith('terminal-')) {
                const app_instances = { ...this.state.app_instances };
                delete app_instances[objId];
                this.setState({ app_instances });
            }
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
