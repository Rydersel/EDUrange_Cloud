import React from 'react'


export default function Code_editor() {
    return (
        <iframe src="https://leetcode-ide.vercel.app/" frameBorder="0" title="Code Editor" className="h-full w-full bg-ub-cool-grey"></iframe>
        //https://github.com/abhinandanmishra1/Leetcode-Ide
    )
}

export const displayCodeEditor = () => {
    <Code_editor />;
}
