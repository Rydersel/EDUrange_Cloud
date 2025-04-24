import React, { useState, forwardRef, useImperativeHandle, useEffect } from 'react';
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
        getAppInstances: () => app_instances
    }));

    const createNewAppInstance = (appId) => {
        const baseApp = apps.find(app => app.id === appId);
        if (!baseApp) {
            console.log(`[INSTANCE DEBUG] Cannot find base app for ${appId}`);
            return;
        }

        const instanceCount = getOpenInstancesCount(appId);
        if (instanceCount >= maxTerminalInstances) {
            console.log("[INSTANCE DEBUG] Maximum number of terminal instances reached");
            return;
        }

        // Get next instance number
        const nextInstanceNum = instanceCount + 1;
        const instanceId = `${appId}-${nextInstanceNum}`;

        console.log(`[INSTANCE DEBUG] Creating new instance ${instanceId} (count: ${instanceCount})`);

        const newInstance = {
            ...baseApp,
            id: instanceId,
            title: `${baseApp.title} ${nextInstanceNum}`,
            defaultPosition: {
                x: terminalOffsetX * nextInstanceNum,
                y: terminalOffsetY * nextInstanceNum
            },
            isInstance: true,  // Mark as instance for special handling
            baseAppId: appId   // Store the base app ID for reference
        };

        setAppInstances(prevInstances => {
            const updatedInstances = {
                ...prevInstances,
                [instanceId]: newInstance
            };

            console.log(`[INSTANCE DEBUG] Updated app_instances with new instance ${instanceId}:`, updatedInstances);

            // Call this after state update using the callback
            setTimeout(() => {
                console.log(`[INSTANCE DEBUG] Notifying parent of new instance ${instanceId}`);
                onInstanceCreated(newInstance);
            }, 0);

            return updatedInstances;
        });
    };

    const getOpenInstancesCount = (appId) => {
        // Count both existing instances in app_instances and any in app_stack that start with appId
        const instanceCount = Object.keys(app_instances).filter(id =>
            id.startsWith(`${appId}-`) && !closed_windows[id]
        ).length;

        console.log(`[INSTANCE DEBUG] Open instances of ${appId}: ${instanceCount}`);
        return instanceCount;
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
        console.log(`[INSTANCE DEBUG] handleAppOpen called for ${appId}`);

        if (disabled_apps[appId]) {
            console.log(`[INSTANCE DEBUG] App ${appId} is disabled, not opening`);
            return;
        }

        if (appId === 'terminal') {
            console.log(`[INSTANCE DEBUG] Creating new terminal instance`);
            createNewAppInstance(appId);
        } else {
            console.log(`[INSTANCE DEBUG] Opening existing app ${appId}`);
            openExistingApp(appId);
        }
    };

    const openExistingApp = (appId) => {
        if (minimized_windows[appId]) {
            console.log(`[INSTANCE DEBUG] Restoring minimized app ${appId}`);
            restoreMinimizedApp(appId);
            return;
        }

        if (app_stack.includes(appId)) {
            console.log(`[INSTANCE DEBUG] App ${appId} already open, focusing`);
            focus(appId);
        } else {
            console.log(`[INSTANCE DEBUG] Opening new app ${appId}`);
            updateAppFrequency(appId);
            onNewAppOpen(appId);
        }
    };

    const restoreMinimizedApp = (appId) => {
        console.log(`[INSTANCE DEBUG] Restoring and focusing app ${appId}`);
        focus(appId);
        const appWindow = document.querySelector(`#${appId}`);
        if (appWindow) {
            appWindow.style.transform = `translate(${appWindow.style.getPropertyValue("--window-transform-x")},${appWindow.style.getPropertyValue("--window-transform-y")}) scale(1)`;
            onAppRestore(appId);
        } else {
            console.log(`[INSTANCE DEBUG] Could not find window element for ${appId}`);
        }
    };

    // This component doesn't render anything
    return null;
});

export default AppManager;
