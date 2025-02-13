import React, { Component } from 'react';
import ReactGA from 'react-ga4';

class AppManager extends Component {
    constructor() {
        super();
        this.state = {
            app_instances: {},
            instanceCounter: {},
        };
        this.terminalOffsetX = 30;
        this.terminalOffsetY = 30;
        this.maxTerminalInstances = 5;
    }

    createNewAppInstance = (appId) => {
        const { apps } = this.props;
        const baseApp = apps.find(app => app.id === appId);
        if (!baseApp) return;

        const instanceCount = this.getOpenInstancesCount(appId);
        if (instanceCount >= this.maxTerminalInstances) {
            console.log("Maximum number of terminal instances reached");
            return;
        }

        // Get next instance number
        const nextInstanceNum = instanceCount + 1;
        const instanceId = `${appId}-${nextInstanceNum}`;
        
        const newInstance = {
            ...baseApp,
            id: instanceId,
            title: `${baseApp.title} ${nextInstanceNum}`,
            defaultPosition: {
                x: this.terminalOffsetX * nextInstanceNum,
                y: this.terminalOffsetY * nextInstanceNum
            }
        };

        this.setState(prevState => ({
            app_instances: {
                ...prevState.app_instances,
                [instanceId]: newInstance
            }
        }), () => {
            this.props.onInstanceCreated(newInstance);
        });
    };

    getOpenInstancesCount = (appId) => {
        return Object.keys(this.state.app_instances).filter(id =>
            id.startsWith(`${appId}-`) && !this.props.closed_windows[id]
        ).length;
    };

    updateAppFrequency = (appId) => {
        const frequentApps = JSON.parse(localStorage.getItem('frequentApps')) || [];
        const currentApp = frequentApps.find(app => app.id === appId);

        if (currentApp) {
            currentApp.frequency += 1;
        } else {
            frequentApps.push({ id: appId, frequency: 1 });
        }

        frequentApps.sort((a, b) => b.frequency - a.frequency);
        localStorage.setItem('frequentApps', JSON.stringify(frequentApps));
    };

    handleAppOpen = (appId) => {
        ReactGA.event({ category: 'Open App', action: `Opened ${appId} window` });

        if (this.props.disabled_apps[appId]) return;

        if (appId === 'terminal') {
            this.createNewAppInstance(appId);
        } else {
            this.openExistingApp(appId);
        }
    };

    openExistingApp = (appId) => {
        if (this.props.minimized_windows[appId]) {
            this.restoreMinimizedApp(appId);
            return;
        }

        if (this.props.app_stack.includes(appId)) {
            this.props.focus(appId);
        } else {
            this.updateAppFrequency(appId);
            this.props.onNewAppOpen(appId);
        }
    };

    restoreMinimizedApp = (appId) => {
        this.props.focus(appId);
        const appWindow = document.querySelector(`#${appId}`);
        if (appWindow) {
            appWindow.style.transform = `translate(${appWindow.style.getPropertyValue("--window-transform-x")},${appWindow.style.getPropertyValue("--window-transform-y")}) scale(1)`;
            this.props.onAppRestore(appId);
        }
    };

    render() {
        return null; // This is a logic component, it doesn't render anything
    }
}

export default AppManager; 