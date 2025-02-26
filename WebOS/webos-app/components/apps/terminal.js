import React from 'react';

export default function Terminal({ id }) {
    let terminal_url = `https://terminal-${window.location.host}`; // Lazy code (I'm never fixing this)
    console.log(terminal_url);
    const instanceNumber = id.includes('-') ? id.split('-')[0].match(/\d+/)?.[0] || '' : '';
    return (
        <iframe src={terminal_url} frameBorder="0" title={`Terminal ${instanceNumber}`} className="h-full w-full bg-ub-grey"></iframe>
    );
}

export const displayTerminal = ({ id }) => {
    return <Terminal id={id} />;
}
