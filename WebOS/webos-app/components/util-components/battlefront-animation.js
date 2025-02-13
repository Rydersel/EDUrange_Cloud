import React, { useEffect, useRef, useState } from 'react';

const BattlefrontAnimation = ({ onAnimationComplete }) => {
    const audioRef = useRef(null);
    const gridRef = useRef(null);
    const timeoutsRef = useRef([]);
    const [isExiting, setIsExiting] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Fade in when component mounts
        const fadeInTimeout = setTimeout(() => setIsVisible(true), 50);
        return () => clearTimeout(fadeInTimeout);
    }, []);

    const handleAnimationComplete = () => {
        // Stop audio
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }

        // Start fade out
        setIsVisible(false);

        // Wait for fade out to complete
        setTimeout(() => {
            onAnimationComplete();
        }, 500);
    };

    useEffect(() => {
        const handleKeyPress = (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                // Clear all pending animations
                timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
                timeoutsRef.current = [];
                handleAnimationComplete();
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => {
            window.removeEventListener('keydown', handleKeyPress);
            timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
        };
    }, [onAnimationComplete]);

    useEffect(() => {
        const gridPositions = [
            ['1fr 4vw 1fr', '2fr 7.11vw 3fr'],
            ['5fr 4vw 2fr', '1fr 7.11vw 1fr'],
            ['1fr 4vw 3fr', '4fr 7.11vw 2fr']
        ];
        
        const defaultSpacingVertical = '1fr 100vh 1fr';
        const defaultSpacingHorizontal = '1fr 100vw 1fr';
        let currentStep = 1;
        const totalSteps = 3;

        const animateZoom = () => {
            if (!isVisible) return;

            const isFinalStep = currentStep === totalSteps;
            const rootStyles = document.documentElement.style;

            timeoutsRef.current.push(
                setTimeout(() => {
                    if (isVisible) {
                        audioRef.current?.play();
                        rootStyles.setProperty('--spacing-vertical', gridPositions[currentStep - 1][0]);
                    }
                }, 1000),

                setTimeout(() => {
                    if (isVisible) {
                        rootStyles.setProperty('--spacing-horizontal', gridPositions[currentStep - 1][1]);
                    }
                }, 3000),

                setTimeout(() => {
                    if (isVisible) {
                        const gridCentralCell = gridRef.current?.querySelector('.grid__cell--central');
                        if (gridCentralCell?.children[currentStep - 1]) {
                            gridCentralCell.children[currentStep - 1].classList.add('visible');
                        }
                        
                        if (isFinalStep) {
                            handleAnimationComplete();
                        } else {
                            rootStyles.setProperty('--spacing-vertical', defaultSpacingVertical);
                            rootStyles.setProperty('--spacing-horizontal', defaultSpacingHorizontal);
                        }
                    }
                }, 4500),

                setTimeout(() => {
                    if (isVisible && !isFinalStep) {
                        const gridCentralCell = gridRef.current?.querySelector('.grid__cell--central');
                        const gridBackgrounds = gridRef.current?.querySelectorAll('.grid__background');
                        
                        currentStep++;

                        if (gridCentralCell?.children[currentStep - 2]) {
                            gridCentralCell.children[currentStep - 2].classList.remove('visible');
                        }

                        if (gridBackgrounds) {
                            gridBackgrounds[currentStep - 2]?.classList.remove('visible');
                            gridBackgrounds[currentStep - 1]?.classList.add('visible');
                        }

                        animateZoom();
                    }
                }, 5500)
            );
        };

        const duplicateBackgrounds = () => {
            const gridBackgrounds = gridRef.current?.querySelectorAll('.grid__background');
            const gridCentralCell = gridRef.current?.querySelector('.grid__cell--central');
            
            gridBackgrounds?.forEach((background, i) => {
                if (i > 0 && gridCentralCell) {
                    gridCentralCell.appendChild(background.cloneNode());
                }
            });
        };

        duplicateBackgrounds();
        animateZoom();

        return () => {
            const rootStyles = document.documentElement.style;
            rootStyles.setProperty('--spacing-vertical', defaultSpacingVertical);
            rootStyles.setProperty('--spacing-horizontal', defaultSpacingHorizontal);
            timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
        };
    }, [onAnimationComplete, isVisible]);

    return (
        <div className={`fixed inset-0 z-50 bg-black transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
            <div className="grid" ref={gridRef}>
                {/* Grid Backgrounds */}
                <img className="grid__background visible" src="https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=1920&h=1080&auto=format&fit=crop" alt="" />
                <img className="grid__background" src="https://images.unsplash.com/photo-1630693912525-7a833b62c81f?w=1920&h=1080&auto=format&fit=crop" alt="" />
                <img className="grid__background" src="https://images.unsplash.com/photo-1574169208019-214ec90d09a9?w=1920&h=1080&auto=format&fit=crop" alt="" />

                {/* Grid Cells */}
                <div className="grid__cell grid__cell--top"></div>
                <div className="grid__cell grid__cell--left"></div>
                <div className="grid__cell grid__cell--central"></div>
                <div className="grid__cell grid__cell--right"></div>
                <div className="grid__cell grid__cell--bottom"></div>
            </div>
            <audio ref={audioRef} src="https://www.georgewpark.com/audio/battlefront-loading.mp3" preload="auto" />
            <div className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 text-white font-mono animate-retro-flash transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
                <span className="text-lg tracking-wider uppercase retro-text-shadow">
                    &lt;&lt; Press SPACE to Skip &gt;&gt;
                </span>
                <style jsx>{`
                    @keyframes retro-flash {
                        0%, 100% { opacity: 1; text-shadow: 0 0 10px #fff, 0 0 20px #fff, 0 0 30px #00ff00; }
                        50% { opacity: 0.3; text-shadow: none; }
                    }
                    .animate-retro-flash {
                        animation: retro-flash 1.5s ease-in-out infinite;
                    }
                    .retro-text-shadow {
                        text-shadow: 2px 2px 0px #000;
                    }
                `}</style>
            </div>
        </div>
    );
};

export default BattlefrontAnimation; 