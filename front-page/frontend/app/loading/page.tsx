'use client'
import React from 'react';
import Typewriter from "typewriter-effect";



const LoadingScreen: React.FC = () => {



    return (
        <div className="flex items-center justify-center min-h-screen bg-black text-white font-mono text-3xl">
            <div>
                <Typewriter
                    options={{
                        autoStart: true,
                        loop: true,
                    }}
                    onInit={(typewriter) => {
                        typewriter
                            .typeString("Loading...")
                            .pauseFor(1000)
                            .deleteAll()
                            .typeString("Challenge...")
                            .pauseFor(1000)
                            .deleteAll()
                            .callFunction(() => typewriter.start())  // This creates the loop
                            .start();

                    }

                    }
                />
            </div>
        </div>

    );
};

export default LoadingScreen;
