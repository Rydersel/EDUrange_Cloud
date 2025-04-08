import React, { useState, forwardRef, useImperativeHandle } from 'react';
import ReactGA from 'react-ga4';

const AppManager = forwardRef(function AppManager(props, ref) {
    const { apps, closed_windows, minimized_windows, app_stack, focus, onNewAppOpen, onAppRestore, onInstanceCreated, disabled_apps } = props;

    const [app_instances, setAppInstances] = useState({});
    const [instanceCounter, setInstanceCounter] = useState({});

    const terminalOffsetX = 30;
    const terminalOffsetY = 30;
    const maxTerminalInstances = 5;

    // Expose methods to parent component via ref
    useImperativeHandle(ref, () => ({
        handleAppOpen,
    }));

    const createNewAppInstance = (appId) => {
        const baseApp = apps.find(app => app.id === appId);
        if (!baseApp) return;

        const instanceCount = getOpenInstancesCount(appId);
        if (instanceCount >= maxTerminalInstances) {
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
                x: terminalOffsetX * nextInstanceNum,
                y: terminalOffsetY * nextInstanceNum
            }
        };

        setAppInstances(prevInstances => {
            const updatedInstances = {
                ...prevInstances,
                [instanceId]: newInstance
            };

            // Call this after state update using the callback
            setTimeout(() => {
                onInstanceCreated(newInstance);
            }, 0);

            return updatedInstances;
        });
    };

    const getOpenInstancesCount = (appId) => {
        return Object.keys(app_instances).filter(id =>
            id.startsWith(`${appId}-`) && !closed_windows[id]
        ).length;
    };

    const updateAppFrequency = (appId) => {
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

    const handleAppOpen = (appId) => {
        ReactGA.event({ category: 'Open App', action: `Opened ${appId} window` });

        if (disabled_apps[appId]) return;

        if (appId === 'terminal') {
            createNewAppInstance(appId);
        } else {
            openExistingApp(appId);
        }
    };

    const openExistingApp = (appId) => {
        if (minimized_windows[appId]) {
            restoreMinimizedApp(appId);
            return;
        }

        if (app_stack.includes(appId)) {
            focus(appId);
        } else {
            updateAppFrequency(appId);
            onNewAppOpen(appId);
        }
    };

    const restoreMinimizedApp = (appId) => {
        focus(appId);
        const appWindow = document.querySelector(`#${appId}`);
        if (appWindow) {
            appWindow.style.transform = `translate(${appWindow.style.getPropertyValue("--window-transform-x")},${appWindow.style.getPropertyValue("--window-transform-y")}) scale(1)`;
            onAppRestore(appId);
        }
    };

    // This component doesn't render anything
    return null;
});

export default AppManager;
