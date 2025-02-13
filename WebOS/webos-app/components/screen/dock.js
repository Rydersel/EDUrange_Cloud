// dock.js

import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import DockApp from '../base/dock_app';

const DockBarContainer = styled.div`
    transition: transform 0.3s ease-in-out;
    transform-origin: bottom center;
    width: 100vw;
    left: 0;
    position: absolute;
    bottom: 0;
    height: calc(3.5rem * var(--dock-scale, 1));
    &:after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        width: 100vw;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: -1;
    }
`;

const DockContent = styled.div`
    transform-origin: bottom center;
    transform: scale(var(--dock-scale, 1));
    width: 100%;
    height: 3.5rem;
    display: flex;
    justify-content: center;
    align-items: flex-end;
    padding-bottom: 0.25rem;
    position: absolute;
    bottom: 0;
`;

const AllAppsContainer = styled.div`
    position: fixed;
    bottom: calc(0.25rem * var(--dock-scale, 1));
    right: calc(1rem * var(--dock-scale, 1));
    transform-origin: bottom right;
    transform: scale(var(--dock-scale, 1));
`;

const DockTriggerArea = styled.div`
    width: 100%;
    height: 1rem;
    position: absolute;
    bottom: 0;
    left: 0;
    background-color: transparent;
    z-index: 50;
`;

const renderApps = (props) => {
    if (!props.apps || !props.favourite_apps) return null;
    
    return props.apps
        .filter(app => props.favourite_apps[app.id])
        .map((app, index) => (
            <DockApp
                key={index}
                id={app.id}
                title={app.title}
                icon={app.icon}
                isClose={props.closed_windows}
                isFocus={props.focused_windows}
                openApp={props.openAppByAppId}
                isMinimized={props.minimized_windows}
                openFromMinimised={props.openFromMinimised}
            />
        ));
};

export default function DockBar(props) {
    const [isHoverEnabled, setIsHoverEnabled] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('dock-hover-enabled') === 'true';
        }
        return true;
    });

    useEffect(() => {
        const dock = document.querySelector('.dock-bar');
        if (dock) {
            dock.classList.toggle('dock-hover-enabled', isHoverEnabled);
            // Set initial scale
            const scale = localStorage.getItem('dock-scale') || 1;
            dock.style.setProperty('--dock-scale', scale);
        }
    }, [isHoverEnabled]);

    const showDock = () => {
        props.hideDock(null, false);
    }

    const hideDock = () => {
        setTimeout(() => {
            props.hideDock(null, true);
        }, 2000);
    }

    return (
        <>
            <DockBarContainer hide={props.hide} className="dock-bar select-none z-40">
                <DockContent>
                    <div className="flex justify-center flex-grow">
                        {Object.keys(props.closed_windows || {}).length !== 0 ? renderApps(props) : null}
                    </div>
                </DockContent>
                <AllAppsContainer>
                    <AllApps showApps={props.showAllApps} />
                </AllAppsContainer>
            </DockBarContainer>
            <DockTriggerArea onMouseEnter={showDock} onMouseLeave={hideDock} />
        </>
    );
}

export function AllApps(props) {
    const [title, setTitle] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const isHoverEnabled = typeof window !== 'undefined' && localStorage.getItem('dock-hover-enabled') === 'true';

    const handleClick = () => {
        if (isProcessing) return;
        setIsProcessing(true);
        props.showApps();
        // Reset processing state after animation duration
        setTimeout(() => {
            setIsProcessing(false);
        }, 300);
    };

    return (
        <div
            className={"dock-app w-10 h-10 rounded m-1 flex items-center justify-center" + 
                (!isHoverEnabled ? " hover:bg-white hover:bg-opacity-10" : "")}
            onMouseEnter={() => setTitle(true)}
            onMouseLeave={() => setTitle(false)}
            onClick={handleClick}
        >
            <div className="relative">
                <img width="28px" height="28px" className="w-7" src="./themes/Yaru/system/view-app-grid-symbolic.svg" alt="Webos view app" />
                <div
                    className={`w-max py-0.5 px-1.5 absolute bottom-full mb-2 text-ubt-grey text-opacity-90 text-sm bg-ub-grey bg-opacity-70 border-gray-400 border border-opacity-40 rounded-md ${title ? "visible" : "invisible"}`}
                >
                    All Apps
                </div>
            </div>
        </div>
    );
}
