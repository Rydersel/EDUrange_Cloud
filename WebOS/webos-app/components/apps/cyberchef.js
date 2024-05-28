import React from 'react';

export default function Cyberchef() {
    return (
        <iframe src="https://gchq.github.io/CyberChef/" frameBorder="0" title="Doom" className="h-full w-full bg-ub-grey"></iframe>
    );
}


export const displayCyberchef = () => {
    return <Cyberchef />;
}
