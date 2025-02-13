import React from 'react';
import Window from '../base/window';

const WindowManager = ({
    apps,
    closed_windows,
    focused_windows,
    minimized_windows,
    app_instances,
    closeApp,
    openApp,
    focus,
    hideDock,
    hasMinimised,
    changeBackgroundImage,
    bg_image_name
}) => {
    const renderWindow = (app, key) => (
        <Window
            key={key}
            title={app.title}
            id={app.id}
            screen={app.screen}
            closed={closeApp}
            openApp={openApp}
            focus={focus}
            isFocused={focused_windows[app.id]}
            hideDock={hideDock}
            hasMinimised={hasMinimised}
            minimized={minimized_windows[app.id]}
            changeBackgroundImage={changeBackgroundImage}
            bg_image_name={bg_image_name}
            apps={apps}
        />
    );

    const renderWindows = () => {
        const regularApps = apps.map((app, index) =>
            !closed_windows[app.id] && renderWindow(app, index)
        );

        const terminalInstances = Object.values(app_instances).map((instance, index) =>
            !closed_windows[instance.id] && renderWindow(instance, `instance-${index}`)
        );

        return [...regularApps, ...terminalInstances];
    };

    return (
        <div className="windows-container">
            {renderWindows()}
        </div>
    );
};

export default WindowManager; 