import React from 'react';
import WallpaperImage from '@/components/util-components/wallpaper-image';
import Dock from '../screen/dock';
import DesktopIcons from './DesktopIcons';
import WindowManager from '../window_manager/WindowManager';
import ContextMenuManager from './ContextMenuManager';
import ControlCenter from '../screen/control_center';

const DesktopLayout = ({ 
    bg_image_name,
    changeBackgroundImage,
    apps,
    desktop_apps,
    openApp,
    context_menus,
    menuPosition,
    controlCenterVisible,
    toggleControlCenter,
    favourite_apps,
    ...windowProps
}) => {
    return (
        <div className="h-full w-full flex flex-col items-end justify-start content-start flex-wrap-reverse pt-8 bg-transparent relative overflow-hidden overscroll-none window-parent">
            <div className="absolute h-full w-full bg-transparent" data-context="desktop-area">
                <WindowManager 
                    apps={apps}
                    {...windowProps}
                />
                <DesktopIcons 
                    apps={apps}
                    desktop_apps={desktop_apps}
                    openApp={openApp}
                />
            </div>
            <WallpaperImage img={bg_image_name} />
            <Dock
                apps={apps}
                hide={controlCenterVisible}
                favourite_apps={favourite_apps}
                showAllApps={toggleControlCenter}
                openAppByAppId={openApp}
                {...windowProps}
            />
            <ContextMenuManager 
                active={context_menus.desktop}
                position={menuPosition}
                openApp={openApp}
            />
            {controlCenterVisible && (
                <ControlCenter
                    apps={apps}
                    openApp={openApp}
                    toggleControlCenter={toggleControlCenter}
                />
            )}
        </div>
    );
};

export default DesktopLayout; 