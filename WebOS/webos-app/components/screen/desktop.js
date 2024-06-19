

import React, { Component } from 'react';
import BackgroundImage from '@/components/util-components/background-image';
import Dock from './dock';
import apps from '../../app/apps.config';
import Window from '../base/window';
import App from '../base/base_app';
import ControlCenter from './control_center';
import DesktopMenu from '../context menus/desktop-menu';
import $ from 'jquery';
import ReactGA from 'react-ga4';

export class Desktop extends Component {
    constructor() {
        super();
        this.state = {
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
            controlCenterVisible: false, // Add state for control center visibility
        };
        this.app_stack = [];
        this.initFavourite = {};
    }

    componentDidMount() {
        this.fetchAppsData();
        this.setContextListeners();
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

        apps.forEach(app => {
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

    updateAppsData = () => {
        const updatedData = {
            focused_windows: {},
            closed_windows: {},
            disabled_apps: {},
            favourite_apps: {},
            minimized_windows: {},
            desktop_apps: [],
        };

        apps.forEach(app => {
            updatedData.focused_windows[app.id] = this.state.focused_windows[app.id] || false;
            updatedData.closed_windows[app.id] = this.state.closed_windows[app.id] !== undefined ? this.state.closed_windows[app.id] : true;
            updatedData.disabled_apps[app.id] = app.disabled;
            updatedData.favourite_apps[app.id] = app.favourite;
            updatedData.minimized_windows[app.id] = this.state.minimized_windows[app.id] || false;
            if (app.desktop_shortcut) updatedData.desktop_apps.push(app.id);
        });

        this.setState(updatedData);
        this.initFavourite = { ...updatedData.favourite_apps };
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
        this.showContextMenu(e, "desktop");
    }

    showContextMenu = (e, menuName) => {
        let { posx, posy } = this.getMenuPosition(e);
        let contextMenu = document.getElementById(`${menuName}-menu`);

        if (posx + $(contextMenu).width() > window.innerWidth) posx -= $(contextMenu).width();
        if (posy + $(contextMenu).height() > window.innerHeight) posy -= $(contextMenu).height();

        contextMenu.style.left = `${posx}px`;
        contextMenu.style.top = `${posy}px`;

        this.setState({ context_menus: { ...this.state.context_menus, [menuName]: true } });
    }

    hideAllContextMenu = () => {
        const menus = { ...this.state.context_menus };
        Object.keys(menus).forEach(key => menus[key] = false);
        this.setState({ context_menus: menus });
    }

    getMenuPosition = (e) => {
        const posx = e.pageX || e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
        const posy = e.pageY || e.clientY + document.body.scrollTop + document.documentElement.scrollTop;
        return { posx, posy };
    }

    openApp = (objId) => {
        ReactGA.event({ category: `Open App`, action: `Opened ${objId} window` });

        if (this.state.disabled_apps[objId]) return;

        if (this.state.minimized_windows[objId]) {
            this.focus(objId);
            const r = document.querySelector(`#${objId}`);
            r.style.transform = `translate(${r.style.getPropertyValue("--window-transform-x")},${r.style.getPropertyValue("--window-transform-y")}) scale(1)`;
            this.setState(prevState => ({
                minimized_windows: { ...prevState.minimized_windows, [objId]: false }
            }));
            return;
        }

        if (this.app_stack.includes(objId)) {
            this.focus(objId);
        } else {
            const frequentApps = JSON.parse(localStorage.getItem('frequentApps')) || [];
            const currentApp = frequentApps.find(app => app.id === objId);

            if (currentApp) {
                currentApp.frequency += 1;
            } else {
                frequentApps.push({ id: objId, frequency: 1 });
            }

            frequentApps.sort((a, b) => b.frequency - a.frequency);
            localStorage.setItem("frequentApps", JSON.stringify(frequentApps));

            this.setState(prevState => ({
                favourite_apps: { ...prevState.favourite_apps, [objId]: true },
                closed_windows: { ...prevState.closed_windows, [objId]: false },
                allAppsView: false
            }), () => {
                this.focus(objId);
                this.app_stack.push(objId);
            });
        }
    }

    closeApp = (objId) => {
        this.app_stack.splice(this.app_stack.indexOf(objId), 1);
        this.giveFocusToLastApp();
        this.hideDock(null, false);

        const favourite_apps = { ...this.state.favourite_apps };
        const closed_windows = { ...this.state.closed_windows };

        if (!this.initFavourite[objId]) favourite_apps[objId] = false;
        closed_windows[objId] = true;

        this.setState({ closed_windows, favourite_apps });
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

    checkAllMinimised = () => Object.keys(this.state.minimized_windows).every(key => this.state.closed_windows[key] || this.state.minimized_windows[key]);

    toggleControlCenter = () => {
        this.setState(prevState => ({
            controlCenterVisible: !prevState.controlCenterVisible,
            hideDock: !prevState.controlCenterVisible // Toggle the dock visibility when control center is toggled
        }));
    }

    renderDesktopApps = () => {
        if (Object.keys(this.state.closed_windows).length === 0) return;
        let appsJsx = [];
        apps.forEach((app, index) => {
            if (this.state.desktop_apps.includes(app.id)) {

                const props = {
                    name: app.title,
                    id: app.id,
                    icon: app.icon,
                    openApp: this.openApp
                }

                appsJsx.push(
                    <App key={index} {...props} />
                );
            }
        });
        return appsJsx;
    }


    renderWindows = () => apps.map((app, index) => !this.state.closed_windows[app.id] && (
        <Window
            key={index}
            title={app.title}
            id={app.id}
            screen={app.screen}
            closed={this.closeApp}
            openApp={this.openApp}
            focus={this.focus}
            isFocused={this.state.focused_windows[app.id]}
            hideDock={this.hideDock}
            hasMinimised={this.hasMinimised}
            minimized={this.state.minimized_windows[app.id]}
            changeBackgroundImage={this.props.changeBackgroundImage}
            bg_image_name={this.props.bg_image_name}
        />
    ));

    render() {
        return (
            <div className="h-full w-full flex flex-col items-end justify-start content-start flex-wrap-reverse pt-8 bg-transparent relative overflow-hidden overscroll-none window-parent">
                <div className="absolute h-full w-full bg-transparent" data-context="desktop-area">
                    {this.renderWindows()}
                </div>
                <BackgroundImage img={this.props.bg_image_name} />
                <Dock
                    apps={apps}
                    hide={this.state.controlCenterVisible} // Hide dock when control center is visible
                    hideDock={this.hideDock}
                    favourite_apps={this.state.favourite_apps}
                    showAllApps={this.toggleControlCenter}
                    allAppsView={this.state.allAppsView}
                    closed_windows={this.state.closed_windows}
                    focused_windows={this.state.focused_windows}
                    isMinimized={this.state.minimized_windows}
                    openAppByAppId={this.openApp}
                />
                {this.renderDesktopApps()}
                <DesktopMenu active={this.state.context_menus.desktop} openApp={this.openApp} />
                {this.state.controlCenterVisible && (
                    <ControlCenter
                        apps={apps}
                        recentApps={this.app_stack}
                        openApp={this.openApp}
                        toggleControlCenter={this.toggleControlCenter}
                    />
                )}
            </div>
        );
    }
}

export default Desktop;
