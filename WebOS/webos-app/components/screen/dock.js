// dock.js

import React, { useState } from 'react';
import styled from 'styled-components';
import DockApp from '../base/dock_app';

const DockBarContainer = styled.div`
    transition: transform 0.3s ease-in-out;
    transform: translateY(${props => (props.hide ? '100%' : '0')});
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
    return props.apps.filter(app => props.favourite_apps[app.id]).map((app, index) => (
        <DockApp
            key={index}
            id={app.id}
            title={app.title}
            icon={app.icon}
            isClose={props.closed_windows}
            isFocus={props.focused_windows}
            openApp={props.openAppByAppId}
            isMinimized={props.isMinimized}
            openFromMinimised={props.openFromMinimised}
        />
    ));
}

export default function DockBar(props) {
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
            <DockBarContainer hide={props.hide} className="dock-bar absolute transform duration-300 select-none z-40 left-0 bottom-0 w-full pb-1 h-auto flex justify-between items-center border-black border-opacity-60 bg-black bg-opacity-50">
                <div className="flex justify-center flex-grow">
                    {Object.keys(props.closed_windows).length !== 0 ? renderApps(props) : null}
                </div>
                <AllApps showApps={props.showAllApps} />
            </DockBarContainer>
            <DockTriggerArea onMouseEnter={showDock} onMouseLeave={hideDock} />
        </>
    );
}

export function AllApps(props) {
    const [title, setTitle] = useState(false);

    return (
        <div
            className="w-10 h-10 rounded m-1 hover:bg-white hover:bg-opacity-10 flex items-center justify-center"
            onMouseEnter={() => setTitle(true)}
            onMouseLeave={() => setTitle(false)}
            onClick={props.showApps}
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
