import React, { useState, useEffect } from 'react';

const MenuItem = ({ label, isActive, onClick }) => (
  <button
    className={`w-full text-left px-4 py-2 ${isActive ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-600'}`}
    onClick={onClick}
  >
    {label}
  </button>
);

export function Settings(props) {
  const [activeSection, setActiveSection] = useState('general');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const wallpapers = {
    "wall-1": "./images/wallpapers/wall-1.webp",
    "wall-2": "./images/wallpapers/wall-2.webp",
    "wall-3": "./images/wallpapers/wall-3.webp",
    "wall-4": "./images/wallpapers/wall-4.webp",
    "wall-5": "./images/wallpapers/wall-5.webp",
    "wall-6": "./images/wallpapers/wall-6.webp"
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const changeBackgroundImage = (wallpaperName) => {
    props.changeBackgroundImage(wallpaperName);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  };

  const resetInstance = () => {
    document.cookie.split(";").forEach(function(c) {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    localStorage.clear();
    window.location.reload();
  };

  const renderGeneralSection = () => (
    <div className="p-4 text-gray-300">
      <h2 className="text-2xl font-bold mb-4">General Settings</h2>
      <button
        onClick={toggleFullscreen}
        className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded mb-2 w-full"
      >
        {isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
      </button>
      <button
        onClick={resetInstance}
        className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded w-full"
      >
        Reset Instance
      </button>
    </div>
  );

  const renderWallpaperSection = () => (
    <div className="p-4 text-gray-300">
      <h2 className="text-2xl font-bold mb-4">Wallpaper Settings</h2>
      <div className="w-2/3 mx-auto mb-4 rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
        <div className="w-full h-full" style={{
          backgroundImage: `url(${wallpapers[props.currBgImgName]})`,
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center center"
        }}></div>
      </div>
      <div className="flex flex-wrap justify-center items-center border-t border-gray-600 pt-4">
        {Object.keys(wallpapers).map((name) => (
          <button
            key={name}
            onClick={() => changeBackgroundImage(name)}
            className={`${name === props.currBgImgName ? "border-white" : "border-transparent"} md:w-1/4 w-1/3 aspect-video m-2 outline-none border-2 rounded-lg overflow-hidden`}
            style={{ backgroundImage: `url(${wallpapers[name]})`, backgroundSize: "cover", backgroundRepeat: "no-repeat", backgroundPosition: "center center" }}
          ></button>
        ))}
      </div>
    </div>
  );

  const renderAboutSection = () => (
    <div className="p-4 pt-8 text-gray-300 flex flex-col items-center">
      <h1 className="text-4xl font-bold mb-2">EDURange WebOS</h1>
      <p className="text-xl mb-4">Version 0.1.0</p>
      <p className="text-lg mb-6">Loaded Challenge: Temp</p>
      <a
        href="https://github.com/Rydersel/EDUrange_Cloud"
        target="_blank"
        rel="noopener noreferrer"
        className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
      >
        View on GitHub
      </a>
    </div>
  );

  return (
    <div className="flex w-full h-full bg-gray-800 text-gray-300 relative z-10">
      <div className="w-1/4 bg-gray-900 relative z-20">
        <MenuItem
          label="General"
          isActive={activeSection === 'general'}
          onClick={() => setActiveSection('general')}
        />
        <MenuItem
          label="Wallpaper"
          isActive={activeSection === 'wallpaper'}
          onClick={() => setActiveSection('wallpaper')}
        />
        <MenuItem
          label="About"
          isActive={activeSection === 'about'}
          onClick={() => setActiveSection('about')}
        />
      </div>
      <div className="w-3/4 overflow-y-auto bg-gray-800 relative z-20">
        {activeSection === 'general' && renderGeneralSection()}
        {activeSection === 'wallpaper' && renderWallpaperSection()}
        {activeSection === 'about' && renderAboutSection()}
      </div>
    </div>
  );
}

export default Settings;

export const displaySettings = () => {
  return <Settings />;
};
