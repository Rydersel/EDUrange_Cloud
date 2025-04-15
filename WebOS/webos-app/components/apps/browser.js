import React, { useState, useEffect, useCallback } from 'react';

const Browser = () => {
    const home_url = 'https://www.google.com/webhp?igu=1';
    const [url, setUrl] = useState(home_url);
    const [display_url, setDisplayUrl] = useState('https://www.google.com');

    useEffect(() => {
        let lastVisitedUrl = localStorage.getItem("chrome-url");
        let lastDisplayedUrl = localStorage.getItem("chrome-display-url");
        if (lastVisitedUrl !== null && lastVisitedUrl !== undefined) {
            setUrl(lastVisitedUrl);
            setDisplayUrl(lastDisplayedUrl);
            setTimeout(refreshChrome, 100); // Wait a bit for the state to update
        }
    }, []);

    const storeVisitedUrl = useCallback((newUrl, newDisplayUrl) => {
        localStorage.setItem("chrome-url", newUrl);
        localStorage.setItem("chrome-display-url", newDisplayUrl);
    }, []);

    const refreshChrome = useCallback(() => {
        const chromeScreen = document.getElementById("chrome-screen");
        if (chromeScreen) chromeScreen.src += '';
    }, []);

    const goToHome = useCallback(() => {
        setUrl(home_url);
        setDisplayUrl("https://www.google.com");
        setTimeout(refreshChrome, 100);
    }, [refreshChrome]);

    const checkKey = useCallback((e) => {
        if (e.key === "Enter") {
            let newUrl = e.target.value;
            let newDisplayUrl = "";

            newUrl = newUrl.trim();
            if (newUrl.length === 0) return;

            if (newUrl.indexOf("http://") !== 0 && newUrl.indexOf("https://") !== 0) {
                newUrl = "https://" + newUrl;
            }

            newUrl = encodeURI(newUrl);
            newDisplayUrl = newUrl;
            if (newUrl.includes("google.com")) { // 😅
                newUrl = 'https://www.google.com/webhp?igu=1';
                newDisplayUrl = "https://www.google.com";
            }
            
            setUrl(newUrl);
            setDisplayUrl(newDisplayUrl);
            storeVisitedUrl(newUrl, newDisplayUrl);
            document.getElementById("chrome-url-bar").blur();
        }
    }, [storeVisitedUrl]);

    const handleDisplayUrl = useCallback((e) => {
        setDisplayUrl(e.target.value);
    }, []);

    const displayUrlBar = () => {
        return (
            <div className="w-full pt-0.5 pb-1 flex justify-start items-center text-white text-sm border-b border-gray-900">
                <div onClick={refreshChrome} className=" ml-2 mr-1 flex justify-center items-center rounded-full bg-gray-50 bg-opacity-0 hover:bg-opacity-10">
                    <img className="w-5" src="./themes/Yaru/status/chrome_refresh.svg" alt="Webos Browser Refresh" />
                </div>
                <div onClick={goToHome} className=" mr-2 ml-1 flex justify-center items-center rounded-full bg-gray-50 bg-opacity-0 hover:bg-opacity-10">
                    <img className="w-5" src="./themes/Yaru/status/chrome_home.svg" alt="Webos Browser Home" />
                </div>
                <input onKeyDown={checkKey} onChange={handleDisplayUrl} value={display_url} id="chrome-url-bar" className="outline-none bg-ub-grey rounded-full pl-3 py-0.5 mr-3 w-5/6 text-gray-300 focus:text-white" type="url" spellCheck={false} autoComplete="off" />
            </div>
        );
    };

    return (
        <div className="h-full w-full flex flex-col bg-ub-cool-grey">
            {displayUrlBar()}
            <iframe src={url} className="flex-grow" id="chrome-screen" frameBorder="0" title="Webos Browser Url"></iframe>
        </div>
    );
};

export default Browser;

export const displayChrome = () => {
    return <Browser />;
};
