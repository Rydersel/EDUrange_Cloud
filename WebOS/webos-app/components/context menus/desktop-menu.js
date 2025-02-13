import React, { useState, useEffect } from 'react'

function DesktopMenu(props) {
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [menuStyle, setMenuStyle] = useState({});
    const { position = { x: 0, y: 0 } } = props;

    useEffect(() => {
        document.addEventListener('fullscreenchange', checkFullScreen);
        
        // Calculate menu position on client side
        setMenuStyle({
            left: Math.min(position.x, window.innerWidth - 208), // 208px is menu width (w-52)
            top: Math.min(position.y, window.innerHeight - 200), // 200px is approximate menu height
        });

        return () => {
            document.removeEventListener('fullscreenchange', checkFullScreen);
        };
    }, [position]);

    const openTerminal = () => {
        props.openApp("terminal");
    }

    const openSettings = () => {
        props.openApp("settings");
    }

    const checkFullScreen = () => {
        if (typeof document !== 'undefined') {
            setIsFullScreen(!!document.fullscreenElement);
        }
    }

    const goFullScreen = () => {
        if (typeof document === 'undefined') return;
        
        try {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                document.documentElement.requestFullscreen();
            }
        }
        catch (e) {
            console.log(e);
        }
    }

    return (
        <div id="desktop-menu"
             style={menuStyle}
             className={(props.active ? " block " : " hidden ") + " cursor-default w-52 context-menu-bg border text-left font-light border-gray-900 rounded text-white py-4 absolute z-50 text-sm"}>
            <div onClick={openSettings} className="w-full py-0.5 hover:bg-ub-warm-grey hover:bg-opacity-20 mb-1.5">
                <span className="ml-5">Change Wallpaper</span>
            </div>
            <Devider/>
            <div onClick={openSettings} className="w-full py-0.5 hover:bg-ub-warm-grey hover:bg-opacity-20 mb-1.5">
                <span className="ml-5">Settings</span>
            </div>
            <Devider/>
            <div onClick={goFullScreen} className="w-full py-0.5 hover:bg-ub-warm-grey hover:bg-opacity-20 mb-1.5">
                <span className="ml-5">{isFullScreen ? "Exit" : "Enter"} Full Screen</span>
            </div>
            <Devider/>
            <div onClick={() => {
                localStorage.clear();
                window.location.reload();
            }} className="w-full block cursor-default py-0.5 hover:bg-ub-warm-grey hover:bg-opacity-20 mb-1.5">
                <span className="ml-5">Restart System</span>
            </div>
        </div>
    )
}

function Devider() {
    return (
        <div className="flex justify-center w-full">
            <div className=" border-t border-gray-500 py-1 w-4/5"></div>
        </div>
    );
}

export default DesktopMenu
