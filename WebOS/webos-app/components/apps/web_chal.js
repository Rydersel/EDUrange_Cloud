import React, { useState, useEffect } from 'react';

export default function WebChal({ url }) {
    const [challengeUrl, setChallengeUrl] = useState(url || '');
    const [isLoading, setIsLoading] = useState(!url);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchUrl = async () => {
            // If URL is provided in props, use it (highest priority)
            if (url) {
                console.log('Using web challenge URL from props:', url);
                setChallengeUrl(url);
                setIsLoading(false);
                return;
            }

            try {
                // Try to fetch from config API (most reliable method)
                const response = await fetch('/api/config');
                if (response.ok) {
                    const data = await response.json();
                    const urlsConfig = data.urls || {};
                    
                    // Look for web challenge URL in the order of preference
                    const possibleUrlKeys = [
                        'webChallengeUrl',  // Primary option for web challenges
                        'webChallenge',     // Alternative naming
                        'challengeWeb',     // Another possible name
                        'web'               // Simple name
                    ];
                    
                    // Find the first available URL
                    let foundUrl = null;
                    for (const key of possibleUrlKeys) {
                        if (urlsConfig[key]) {
                            foundUrl = urlsConfig[key];
                            console.log(`Found web challenge URL with key ${key}:`, foundUrl);
                            break;
                        }
                    }
                    
                    if (foundUrl) {
                        setChallengeUrl(foundUrl);
                        setIsLoading(false);
                        return;
                    }
                    
                    // If no specific web challenge URL is found, try fallback URLs
                    const fallbackKeys = ['url', 'challengeUrl'];
                    for (const key of fallbackKeys) {
                        if (urlsConfig[key]) {
                            console.log(`Using fallback URL with key ${key}:`, urlsConfig[key]);
                            setChallengeUrl(urlsConfig[key]);
                            setIsLoading(false);
                            return;
                        }
                    }
                    
                    console.warn('No suitable URL found in config API response:', Object.keys(urlsConfig));
                }
                
                // Finally, try environment variable as a last resort
                const envUrl = process.env.NEXT_PUBLIC_WEB_CHALLENGE_URL;
                if (envUrl) {
                    console.log('Using web challenge URL from env var:', envUrl);
                    setChallengeUrl(envUrl);
                    setIsLoading(false);
                } else {
                    throw new Error('No web challenge URL found in any source');
                }
            } catch (err) {
                console.error('Error fetching web challenge URL:', err);
                setError('Web challenge URL not found. Please contact an administrator.');
                setIsLoading(false);
            }
        };

        fetchUrl();
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
