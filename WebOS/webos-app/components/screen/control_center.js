import React, { useState, useEffect, useRef, useCallback } from 'react';
import App from '../base/base_app';

const Control_center = (props) => {
    const { apps, toggleControlCenter, openApp } = props;
    
    const [query, setQuery] = useState("");
    const [filteredApps, setFilteredApps] = useState([]);
    const [category, setCategory] = useState(0); // 0 for all, 1 for frequent
    const [visible, setVisible] = useState(false);
    
    const controlCenterRef = useRef(null);

    useEffect(() => {
        setFilteredApps(apps);
        setVisible(true);
        
        // Add event listeners
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyPress);
        
        // Clean up event listeners
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyPress);
        };
    }, [apps]);

    const handleClickOutside = useCallback((event) => {
        if (controlCenterRef.current && !controlCenterRef.current.contains(event.target)) {
            closeControlCenter();
        }
    }, []);

    const handleKeyPress = useCallback(() => {
        closeControlCenter();
    }, []);

    const closeControlCenter = useCallback(() => {
        setVisible(false);
        setTimeout(() => {
            toggleControlCenter();
        }, 300); // duration of the fade-out animation
    }, [toggleControlCenter]);

    const handleChange = useCallback((e) => {
        const newQuery = e.target.value;
        setQuery(newQuery);
        setFilteredApps(
            newQuery === "" || newQuery === null
                ? apps
                : apps.filter((app) => app.title.toLowerCase().includes(newQuery.toLowerCase()))
        );
    }, [apps]);

    const renderApps = useCallback(() => {
        let appsJsx = [];
        let frequentAppsInfo = JSON.parse(localStorage.getItem("frequentApps"));
        
        const getFrequentApps = () => {
            let frequentApps = [];
            if (frequentAppsInfo) {
                frequentAppsInfo.forEach((app_info) => {
                    let app = apps.find(app => app.id === app_info.id);
                    if (app) {
                        frequentApps.push(app);
                    }
                });
            }
            return frequentApps;
        };

        let displayApps = category === 0 ? [...filteredApps] : getFrequentApps();
        
        displayApps.forEach((app, index) => {
            const appProps = {
                name: app.title,
                id: app.id,
                icon: app.icon,
                openApp: openApp,
                className: 'control-center-app'
            };

            appsJsx.push(
                <div key={index} className="control-center-app -my-3">
                    <App {...appProps} />
                </div>
            );
        });
        
        return appsJsx;
    }, [category, filteredApps, apps, openApp]);

    const handleSwitch = useCallback((newCategory) => {
        if (newCategory !== category) {
            setCategory(newCategory);
        }
    }, [category]);

    return (
        <div ref={controlCenterRef} className={`control-center absolute h-full top-7 w-full z-50 pl-12 justify-center md:pl-20 border-black border-opacity-60 bg-black bg-opacity-70 ${visible ? 'fade-in' : 'fade-out'}`}>
            <div className={"flex md:pr-20 pt-2 align-center justify-center"}>
            </div>
            <div className={"grid md:grid-cols-6 md:grid-rows-9 grid-cols-3 grid-rows-6 md:gap-x-4 gap-x-2 gap-y-0 md:px-20 px-5 pt-5 justify-center"}>
                {renderApps()}
            </div>
            <div className={"flex align-center justify-center w-full fixed bottom-0 mb-15 pr-20  md:pr-20 "}>
                <div className={"w-1/4 text-center group text-white bg-transparent cursor-pointer items-center"} onClick={() => handleSwitch(1)}>
                    <h4>Recent</h4>
                    {category === 1 ? <div className={"h-1 mt-1 bg-ub-orange self-center"} />
                        : <div className={"h-1 mt-1 bg-transparent group-hover:bg-white "} />}
                </div>
                <div className={"w-1/4 text-center group text-white bg-transparent cursor-pointer items-center"} onClick={() => handleSwitch(0)}>
                    <h4>All</h4>
                    {category === 0 ? <div className={"h-1 mt-1 bg-ub-orange self-center"} />
                        : <div className={"h-1 mt-1 bg-transparent group-hover:bg-white"} />}
                </div>
            </div>
        </div>
    );
};

export default Control_center;
