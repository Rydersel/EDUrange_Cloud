import React from 'react';
import App from '../base/base_app';

const DesktopIcons = ({ apps, desktop_apps, openApp }) => {
    const renderDesktopApps = () => {
        if (!apps.length) return null;
        
        return apps
            .filter(app => desktop_apps.includes(app.id))
            .map((app, index) => (
                <App
                    key={index}
                    name={app.title}
                    id={app.id}
                    icon={app.icon}
                    openApp={openApp}
                />
            ));
    };

    return (
        <div className="desktop-icons-container absolute top-8 right-4 flex flex-col items-end gap-1">
            {renderDesktopApps()}
        </div>
    );
};

export default DesktopIcons; 