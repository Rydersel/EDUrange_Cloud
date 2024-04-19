'use client'
import React from 'react';
import Typewriter from "typewriter-effect";
import styled from 'styled-components';

// Styled component for the overlay
const Overlay = styled.div`
  position: fixed;  // Use fixed to cover the entire screen or absolute for the parent div
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.85);  // Semi-transparent black background
  z-index: 9999;  // High z-index to cover other elements
`;

const LoadingScreen: React.FC = () => {
  return (
    <Overlay>
      <div className="text-white text-3xl font-mono">
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
          }}
        />
      </div>
    </Overlay>
  );
};

export default LoadingScreen;
