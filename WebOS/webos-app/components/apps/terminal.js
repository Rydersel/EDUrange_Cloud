import React, {useState} from 'react';

export default function Terminal() {

    let terminal_url = `https://terminal-${window.location.host}`
    console.log(terminal_url)
    return (


        <iframe src={terminal_url} frameBorder="0" title="Terminal" className="h-full w-full bg-ub-grey"></iframe>

    );
}

export const displayTerminal = () => {
    return   <Terminal/>
}

