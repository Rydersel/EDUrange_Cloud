import React from 'react';
import DesktopMenu from '../context menus/desktop-menu';

const ContextMenuManager = ({ active, position, openApp }) => {
    return <DesktopMenu active={active} position={position} openApp={openApp} />;
};

export default ContextMenuManager; 