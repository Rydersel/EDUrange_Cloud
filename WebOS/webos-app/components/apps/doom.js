import { ReactTerminal } from "react-terminal";



import React from 'react';

export default function Doom() {
    return (


        <iframe src="http://127.0.0.1:8081" frameBorder="0" title="Doom" className="h-full w-full bg-ub-grey"></iframe>
    );
}

export const displayDoom = () => {
    return   <ReactTerminal/>
}
