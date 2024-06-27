import React from 'react';

export default function WebChal() {
    const url = 'http://34.127.89.131:8080/'
    const openInNewTab = () => {
        window.open(url, '_blank');
    };

    return (
        <div className="h-full w-full bg-ub-grey flex flex-col">
            <div className="flex justify-between items-center p-4 bg-gray-800 text-white">
                <h1 className="text-xl">Web Challenge</h1>
                <button
                    onClick={openInNewTab}
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                    Open in New Tab
                </button>
            </div>
            <iframe src= {url}  frameBorder="0" title="Web Challenge" className="flex-grow"></iframe>
        </div>
    );
}

export const displayWebChal = () => {
    return <WebChal />;
};
