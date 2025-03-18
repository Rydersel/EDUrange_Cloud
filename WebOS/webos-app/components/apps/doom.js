import React from 'react';
import useWebOSConfig from '../../utils/useWebOSConfig';

export default function Doom() {
    const config = useWebOSConfig();
    const doomUrl = config.urls.doom;
    
    if (config.isLoading) {
        return <div className="h-full w-full flex items-center justify-center">Loading Doom...</div>;
    }
    
    if (config.error) {
        return <div className="h-full w-full flex items-center justify-center text-red-500">Error loading Doom: {config.error}</div>;
    }
    
    return (
        <iframe src={doomUrl} frameBorder="0" title="Doom" className="h-full w-full bg-ub-grey"></iframe>
    );
}

export const displayDoom = () => {
    return <Doom/>
}
