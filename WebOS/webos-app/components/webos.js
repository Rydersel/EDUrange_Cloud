'use client';

import React, { useState, useEffect } from 'react';
import Desktop from './screen/desktop';
import LockScreen from './screen/lock_screen';
import LoadingScreen from './screen/loading_screen';
import Navbar from './screen/navbar';
import ReactGA from 'react-ga4';

const Webos = () => {
	const [state, setState] = useState({
		screen_locked: false,
		bg_image_name: 'wall-1',
		shutDownScreen: false,
		isLoading: true,
		loadingProgress: 0,
		loadingStatus: 'Initializing WebOS...'
	});

	const updateLoadingState = (progress, status) => {
		setState(prevState => ({
			...prevState,
			loadingProgress: progress,
			loadingStatus: status
		}));
	};

	const loadConfiguration = async () => {
		try {
			updateLoadingState(10, 'Loading system configuration...');
			
			// Simulate loading different components
			await new Promise(resolve => setTimeout(resolve, 500));
			updateLoadingState(30, 'Initializing system services...');
			
			await new Promise(resolve => setTimeout(resolve, 500));
			updateLoadingState(50, 'Loading user preferences...');
			
			// Load actual data
			await getLocalData();
			
			updateLoadingState(70, 'Preparing desktop environment...');
			await new Promise(resolve => setTimeout(resolve, 500));
			
			updateLoadingState(90, 'Finalizing setup...');
			await new Promise(resolve => setTimeout(resolve, 500));
			
			updateLoadingState(100, 'Welcome to WebOS!');
			
			// Hide loading screen after a brief delay
			setTimeout(() => {
				setState(prevState => ({
					...prevState,
					isLoading: false
				}));
			}, 500);
			
		} catch (error) {
			console.error('Error loading WebOS:', error);
			updateLoadingState(100, 'Error loading WebOS. Please refresh.');
		}
	};

	useEffect(() => {
		if (typeof window !== 'undefined') {
			loadConfiguration();
		}
	}, []);

	const getLocalData = async () => {
		if (typeof window !== 'undefined') {
			updateLoadingState(60, 'Loading user preferences...');
			
			// Get Previously selected Background Image
			let bg_image_name = localStorage.getItem('bg-image');
			if (bg_image_name !== null && bg_image_name !== undefined) {
				setState(prevState => ({ ...prevState, bg_image_name }));
			}

			// get shutdown state
			let shut_down = localStorage.getItem('shut-down');
			if (shut_down !== null && shut_down !== undefined && shut_down === 'true') {
				shutDown();
			} else {
				// Get previous lock screen state
				let screen_locked = localStorage.getItem('screen-locked');
				if (screen_locked !== null && screen_locked !== undefined) {
					setState(prevState => ({ ...prevState, screen_locked: screen_locked === 'true' }));
				}
			}
		}
	};

	const lockScreen = () => {
		if (typeof window !== 'undefined') {
			ReactGA.send({ hitType: "pageview", page: "/lock-screen", title: "Lock Screen" });
			ReactGA.event({
				category: `Screen Change`,
				action: `Set Screen to Locked`
			});

			document.getElementById('status-bar').blur();
			setTimeout(() => {
				setState(prevState => ({ ...prevState, screen_locked: true }));
			}, 100);
			localStorage.setItem('screen-locked', true);
		}
	};

	const unLockScreen = () => {
		if (typeof window !== 'undefined') {
			ReactGA.send({ hitType: "pageview", page: "/desktop", title: "Custom Title" });

			window.removeEventListener('click', unLockScreen);
			window.removeEventListener('keypress', unLockScreen);

			setState(prevState => ({ ...prevState, screen_locked: false }));
			localStorage.setItem('screen-locked', false);
		}
	};

	const changeBackgroundImage = (img_name) => {
		if (typeof window !== 'undefined') {
			setState(prevState => ({ ...prevState, bg_image_name: img_name }));
			localStorage.setItem('bg-image', img_name);
		}
	};

	const shutDown = () => {
		if (typeof window !== 'undefined') {
			ReactGA.send({ hitType: "pageview", page: "/switch-off", title: "Custom Title" });

			ReactGA.event({
				category: `Screen Change`,
				action: `Switched off the Ubuntu`
			});

			document.getElementById('status-bar').blur();
			setState(prevState => ({ ...prevState, shutDownScreen: true }));
			localStorage.setItem('shut-down', true);
		}
	};

	const turnOn = () => {
		if (typeof window !== 'undefined') {
			ReactGA.send({ hitType: "pageview", page: "/desktop", title: "Custom Title" });

			setState(prevState => ({ ...prevState, shutDownScreen: false }));
			localStorage.setItem('shut-down', false);
		}
	};

	return (
		<div className="w-screen h-screen overflow-hidden" id="monitor-screen">
			<LoadingScreen 
				isLoading={state.isLoading}
				progress={state.loadingProgress}
				statusMessage={state.loadingStatus}
			/>
			<LockScreen
				isLocked={state.screen_locked}
				bgImgName={state.bg_image_name}
				unLockScreen={unLockScreen}
			/>
			<Navbar lockScreen={lockScreen} shutDown={shutDown} />
			<Desktop bg_image_name={state.bg_image_name} changeBackgroundImage={changeBackgroundImage} />
		</div>
	);
};

export default Webos;
