import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const menuVariants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.08 }
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.08 }
  }
};

const MenuItem = ({ onClick, children }) => (
  <motion.div
    onClick={onClick}
    className="w-full py-1.5 px-3 hover:bg-white/10 flex items-center text-[13px] cursor-default"
    whileTap={{ scale: 0.98 }}
  >
    {children}
  </motion.div>
);

function DesktopMenu(props) {
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [menuStyle, setMenuStyle] = useState({});
    const { position = { x: 0, y: 0 } } = props;

    useEffect(() => {
        document.addEventListener('fullscreenchange', checkFullScreen);
        
        setMenuStyle({
            left: Math.min(position.x, window.innerWidth - 200),
            top: Math.min(position.y, window.innerHeight - 200),
        });

        return () => {
            document.removeEventListener('fullscreenchange', checkFullScreen);
        };
    }, [position]);

    const openSettings = () => {
        props.openApp("settings");
    };

    const checkFullScreen = () => {
        if (typeof document !== 'undefined') {
            setIsFullScreen(!!document.fullscreenElement);
        }
    };

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
    };

    return (
        <AnimatePresence>
            {props.active && (
                <motion.div
                    id="desktop-menu"
                    style={menuStyle}
                    className="w-[200px] backdrop-blur-md bg-gray-800/90 border border-white/10 rounded-lg shadow-lg absolute z-50 overflow-hidden"
                    variants={menuVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                >
                    <div className="py-0.5">
                        <MenuItem onClick={openSettings}>
                            Change Wallpaper
                        </MenuItem>
                        <Divider />
                        <MenuItem onClick={openSettings}>
                            Settings
                        </MenuItem>
                        <Divider />
                        <MenuItem onClick={goFullScreen}>
                            {isFullScreen ? "Exit" : "Enter"} Full Screen
                        </MenuItem>
                        <Divider />
                        <MenuItem 
                            onClick={() => {
                                localStorage.clear();
                                window.location.reload();
                            }}
                        >
                            Restart System
                        </MenuItem>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function Divider() {
    return (
        <div className="flex justify-center w-full">
            <div className="border-t border-white/10 w-full"></div>
        </div>
    );
}

export default DesktopMenu;
