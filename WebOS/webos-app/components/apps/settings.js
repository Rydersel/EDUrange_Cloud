import React, { useState, useEffect } from 'react';
import { version } from '../../utils/version';

const MenuItem = ({ label, isActive, onClick }) => (
  <button
    className={`w-full text-left px-4 py-2 ${isActive ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-600'}`}
    onClick={onClick}
  >
    {label}
  </button>
);

const ToggleSwitch = ({ isEnabled, onToggle, label }) => (
  <div className="flex items-center justify-between py-2">
    <span className="text-gray-300">{label}</span>
    <button
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
        isEnabled ? 'bg-blue-600' : 'bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          isEnabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
);

export function Settings(props) {
  const [activeSection, setActiveSection] = useState('general');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDockHoverEnabled, setIsDockHoverEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('dock-hover-enabled') === 'true';
    }
    return true;
  });
  const [dockScale, setDockScale] = useState(() => {
    if (typeof window !== 'undefined') {
      return parseFloat(localStorage.getItem('dock-scale')) || 1;
    }
    return 1;
  });
  const [isBattlefrontEnabled, setIsBattlefrontEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('battlefront-animation-enabled') === 'true';
    }
    return false;
  });
  const [currBgImgName, setCurrBgImgName] = useState(props.bg_image_name || 'wall-1');

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

  useEffect(() => {
    if (props.bg_image_name) {
      setCurrBgImgName(props.bg_image_name);
    }
  }, [props.bg_image_name]);

  const changeBackgroundImage = (wallpaperName) => {
    if (typeof props.changeBackgroundImage === 'function') {
      props.changeBackgroundImage(wallpaperName);
      setCurrBgImgName(wallpaperName);
    } else {
      console.error('changeBackgroundImage function not provided in props');
      // Fallback to just updating local state
      setCurrBgImgName(wallpaperName);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  };

  const toggleDockHover = () => {
    const newValue = !isDockHoverEnabled;
    setIsDockHoverEnabled(newValue);
    localStorage.setItem('dock-hover-enabled', newValue);
    // Update dock class
    const dock = document.querySelector('.dock-bar');
    if (dock) {
      dock.classList.toggle('dock-hover-enabled', newValue);
    }
  };

  const toggleBattlefrontAnimation = () => {
    const newValue = !isBattlefrontEnabled;
    setIsBattlefrontEnabled(newValue);
    localStorage.setItem('battlefront-animation-enabled', newValue);
  };

  const resetInstance = () => {
    document.cookie.split(";").forEach(function(c) {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    localStorage.clear();
    window.location.reload();
  };

  const handleDockScaleChange = (e) => {
    const newScale = parseFloat(e.target.value);
    setDockScale(newScale);
    localStorage.setItem('dock-scale', newScale);
    // Update dock scale
    const dock = document.querySelector('.dock-bar');
    if (dock) {
      dock.style.setProperty('--dock-scale', newScale);
    }
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
        className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded mb-4 w-full"
      >
        Reset Instance
      </button>
      <div className="pt-2 border-t border-gray-600">
        <ToggleSwitch
          isEnabled={isDockHoverEnabled}
          onToggle={toggleDockHover}
          label="Dock Hover Effect"
        />
        <div className="mt-4">
          <label className="block text-gray-300 mb-2">Dock Scale: {dockScale.toFixed(2)}x</label>
          <input
            type="range"
            min="0.5"
            max="1.5"
            step="0.1"
            value={dockScale}
            onChange={handleDockScaleChange}
            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>
    </div>
  );

  const renderWallpaperSection = () => (
    <div className="p-4 text-gray-300">
      <h2 className="text-2xl font-bold mb-4">Wallpaper Settings</h2>
      <div className="w-2/3 mx-auto mb-4 rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
        <div className="w-full h-full" style={{
          backgroundImage: `url(${wallpapers[currBgImgName]})`,
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
            className={`${name === currBgImgName ? "border-white" : "border-transparent"} md:w-1/4 w-1/3 aspect-video m-2 outline-none border-2 rounded-lg overflow-hidden`}
            style={{ backgroundImage: `url(${wallpapers[name]})`, backgroundSize: "cover", backgroundRepeat: "no-repeat", backgroundPosition: "center center" }}
          ></button>
        ))}
      </div>
    </div>
  );

  const renderSpecialSection = () => (
    <div className="p-4 text-gray-300">
      <h2 className="text-2xl font-bold mb-4">Special Features</h2>
      <div className="pt-2">
        <ToggleSwitch
          isEnabled={isBattlefrontEnabled}
          onToggle={toggleBattlefrontAnimation}
          label="Battlefront Animation"
        />
      </div>
    </div>
  );

  const renderAboutSection = () => (
    <div className="p-4 pt-8 text-gray-300 flex flex-col items-center">
      <h1 className="text-4xl font-bold mb-2">EDURange WebOS</h1>
      <p className="text-xl mb-4">Version {version}</p>
      <p className="text-lg mb-6">Loaded Challenge: Temp</p>
      <a
        href="https://github.com/Rydersel/EDURange_CLOUD"
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
          label="Special"
          isActive={activeSection === 'special'}
          onClick={() => setActiveSection('special')}
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
        {activeSection === 'special' && renderSpecialSection()}
        {activeSection === 'about' && renderAboutSection()}
      </div>
    </div>
  );
}

export default Settings;

export const displaySettings = (props) => {
  return <Settings {...props} />;
};
