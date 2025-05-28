import React, { useState, useEffect } from 'react';

export default function WebChal({ url }) {
    const [challengeUrl, setChallengeUrl] = useState(url || '');
    const [isLoading, setIsLoading] = useState(!url);
    const [error, setError] = useState('');
    const [isCheckingUrl, setIsCheckingUrl] = useState(false);
    const [urlAvailable, setUrlAvailable] = useState(false);
    const [urlCheckAttempts, setUrlCheckAttempts] = useState(0);
    const [checkMessage, setCheckMessage] = useState('');
    const [showIframe, setShowIframe] = useState(false);

    // Helper function to create a storage key for a URL
    const getUrlStorageKey = (url) => {
        // Create a unique key for each URL by hashing it
        return `webChalLoaded_${url.replace(/[^a-zA-Z0-9]/g, '_')}`;
    };

    // Check if we've already loaded this URL before
    const hasUrlBeenLoadedBefore = (url) => {
        if (typeof window === 'undefined') return false;
        try {
            const storageKey = getUrlStorageKey(url);
            return localStorage.getItem(storageKey) === 'true';
        } catch (e) {
            console.warn('Unable to access localStorage:', e);
            return false;
        }
    };

    // Mark a URL as successfully loaded
    const markUrlAsLoaded = (url) => {
        if (typeof window === 'undefined') return;
        try {
            const storageKey = getUrlStorageKey(url);
            localStorage.setItem(storageKey, 'true');
            console.log(`Marked URL as previously loaded: ${url}`);
        } catch (e) {
            console.warn('Unable to write to localStorage:', e);
        }
    };

    useEffect(() => {
        const fetchUrl = async () => {
            // If URL is provided in props, use it (highest priority)
            if (url) {
                console.log('Using web challenge URL from props:', url);
                setChallengeUrl(url);
                setIsLoading(false);
                
                // Check if we've already loaded this URL before
                if (hasUrlBeenLoadedBefore(url)) {
                    console.log('URL was previously loaded, skipping delay');
                    setUrlAvailable(true);
                    setShowIframe(true);
                } else {
                    // Need to check availability for first load
                    checkUrlAvailability(url);
                }
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
                        
                        // Check if we've already loaded this URL before
                        if (hasUrlBeenLoadedBefore(foundUrl)) {
                            console.log('URL was previously loaded, skipping delay');
                            setUrlAvailable(true);
                            setShowIframe(true);
                        } else {
                            // Check URL availability before displaying iframe for first load
                            checkUrlAvailability(foundUrl);
                        }
                        return;
                    }
                    
                    // If no specific web challenge URL is found, try fallback URLs
                    const fallbackKeys = ['url', 'challengeUrl'];
                    for (const key of fallbackKeys) {
                        if (urlsConfig[key]) {
                            console.log(`Using fallback URL with key ${key}:`, urlsConfig[key]);
                            setChallengeUrl(urlsConfig[key]);
                            setIsLoading(false);
                            
                            // Check if we've already loaded this URL before
                            if (hasUrlBeenLoadedBefore(urlsConfig[key])) {
                                console.log('URL was previously loaded, skipping delay');
                                setUrlAvailable(true);
                                setShowIframe(true);
                            } else {
                                // Check URL availability before displaying iframe for first load
                                checkUrlAvailability(urlsConfig[key]);
                            }
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
                    
                    // Check if we've already loaded this URL before
                    if (hasUrlBeenLoadedBefore(envUrl)) {
                        console.log('URL was previously loaded, skipping delay');
                        setUrlAvailable(true);
                        setShowIframe(true);
                    } else {
                        // Check URL availability before displaying iframe for first load
                        checkUrlAvailability(envUrl);
                    }
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

    // Reset showIframe whenever URL changes (unless we've previously loaded it)
    useEffect(() => {
        if (challengeUrl && !hasUrlBeenLoadedBefore(challengeUrl)) {
            setShowIframe(false);
        }
    }, [challengeUrl]);

    // Function to check if a URL is accessible
    const checkUrlAvailability = async (urlToCheck) => {
        if (!urlToCheck || urlToCheck === 'pending...' || urlToCheck === '#') {
            setError('Invalid challenge URL');
            return;
        }

        // Prevent multiple checks running simultaneously
        if (isCheckingUrl) return;
        
        setIsCheckingUrl(true);
        setUrlAvailable(false);
        setShowIframe(false);
        setCheckMessage('Connecting to challenge environment...');
        
        // Maximum number of retry attempts
        const maxAttempts = 20;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                setUrlCheckAttempts(attempt + 1);
                
                // Add a 2-second sleep before checking URL availability
                // This helps avoid hammering the server while it's starting up
                if (attempt > 0) {
                    // Exponential backoff with a maximum wait time
                    const waitTime = Math.min(1000 + (attempt * 300), 3000);
                    setCheckMessage(`Waiting for challenge environment... (attempt ${attempt+1}/${maxAttempts})`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
                
                console.log(`Checking URL availability (attempt ${attempt+1}/${maxAttempts}): ${urlToCheck}`);
                
                // We use no-cors mode to avoid CORS issues, but this means we can't check response.ok
                // Instead, we rely on the absence of an error to indicate success
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
                
                const response = await fetch(urlToCheck, { 
                    method: 'HEAD',
                    mode: 'no-cors',
                    cache: 'no-store',
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                // If we reach here without an error, the URL is likely available
                console.log(`URL check success (attempt ${attempt+1}): ${urlToCheck}`);
                setUrlAvailable(true);
                setIsCheckingUrl(false);
                setCheckMessage('Challenge environment ready. Loading content...');
                
                // Add a delay before showing the iframe to ensure the application is fully initialized
                console.log('Adding 6-second delay before showing iframe');
                setTimeout(() => {
                    console.log('Delay completed, showing iframe now');
                    setShowIframe(true);
                    
                    // Mark this URL as successfully loaded to skip the delay next time
                    markUrlAsLoaded(urlToCheck);
                }, 6000);
                
                return;
            } catch (error) {
                console.warn(`URL check attempt ${attempt+1} failed:`, error.message);
                
                // Check if we've been aborted due to timeout
                if (error.name === 'AbortError') {
                    setCheckMessage(`Challenge environment still initializing... (attempt ${attempt+1}/${maxAttempts})`);
                } else {
                    setCheckMessage(`Connection attempt ${attempt+1} failed. Retrying...`);
                }
                
                // If this was our last attempt, give up
                if (attempt === maxAttempts - 1) {
                    console.error(`URL availability check failed after ${maxAttempts} attempts:`, urlToCheck);
                    setError('Challenge environment is not responding. Try refreshing in a moment.');
                    setIsCheckingUrl(false);
                }
            }
        }
        
        setIsCheckingUrl(false);
    };

    const handleRetry = () => {
        setError('');
        setUrlCheckAttempts(0);
        setShowIframe(false);
        if (challengeUrl) {
            checkUrlAvailability(challengeUrl);
        }
    };

    const openInNewTab = () => {
        if (challengeUrl) {
            window.open(challengeUrl, '_blank');
        }
    };

    // Show loading state while fetching URL
    if (isLoading) {
        return (
            <div className="h-full w-full bg-ub-grey flex items-center justify-center">
                <div className="text-white text-xl">Loading web challenge...</div>
            </div>
        );
    }

    // Show error state if we couldn't fetch or check the URL
    if (error) {
        return (
            <div className="h-full w-full bg-ub-grey flex flex-col items-center justify-center gap-4">
                <div className="text-white text-xl">{error}</div>
                <button 
                    onClick={handleRetry}
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                    Retry
                </button>
            </div>
        );
    }

    // Show checking state while verifying URL availability or waiting for delay
    if (isCheckingUrl || !urlAvailable || !showIframe) {
        return (
            <div className="h-full w-full bg-ub-grey flex flex-col items-center justify-center gap-4">
                <div className="flex flex-col items-center">
                    <div className="loading-spinner mb-4"></div>
                    <div className="text-white text-xl">{checkMessage || 'Connecting to challenge environment...'}</div>
                    {!showIframe && urlAvailable ? (
                        <div className="text-green-400 text-sm mt-2">
                            Connection established! Initializing content...
                        </div>
                    ) : (
                        <div className="text-gray-400 text-sm mt-2">
                            Attempt {urlCheckAttempts}/20
                        </div>
                    )}
                </div>
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
                <iframe 
                    src={challengeUrl} 
                    frameBorder="0" 
                    title="Web Challenge" 
                    className="flex-grow"
                    onError={() => {
                        setError('Failed to load challenge. Please try refreshing.');
                        setUrlAvailable(false);
                        setShowIframe(false);
                    }}
                ></iframe>
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
