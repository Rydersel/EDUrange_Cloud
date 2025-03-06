import React, { useState, useEffect } from 'react';

export default function WebChal({ url }) {
    const [challengeUrl, setChallengeUrl] = useState(url || '');
    const [isLoading, setIsLoading] = useState(!url);
    const [error, setError] = useState('');

    useEffect(() => {
        // If URL is provided in props, use it
        if (url) {
            setChallengeUrl(url);
            setIsLoading(false);
            return;
        }

        // Otherwise, try to get it from environment variable
        const envUrl = process.env.NEXT_PUBLIC_WEB_CHALLENGE_URL;
        if (envUrl) {
            setChallengeUrl(envUrl);
            setIsLoading(false);
        } else {
            setError('Web challenge URL not found. Please contact an administrator.');
            setIsLoading(false);
        }
    }, [url]);

    const openInNewTab = () => {
        if (challengeUrl) {
            window.open(challengeUrl, '_blank');
        }
    };

    if (isLoading) {
        return (
            <div className="h-full w-full bg-ub-grey flex items-center justify-center">
                <div className="text-white text-xl">Loading web challenge...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-full w-full bg-ub-grey flex items-center justify-center">
                <div className="text-white text-xl">{error}</div>
            </div>
        );
    }

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
            {challengeUrl ? (
                <iframe src={challengeUrl} frameBorder="0" title="Web Challenge" className="flex-grow"></iframe>
            ) : (
                <div className="flex-grow flex items-center justify-center text-white text-xl">
                    No URL provided for the web challenge.
                </div>
            )}
        </div>
    );
}

export const displayWebChal = (props) => {
    return <WebChal {...props} />;
};
