'use client'

import { useRouter } from 'next/navigation';
import styled, { keyframes } from 'styled-components';
import React, {useRef, useState} from 'react';
import Header from '../components/Header';

const gradient = keyframes`
  0% {
    background-position: 0 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
`;

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
`;

const ContentContainer = styled.div`
  display: flex;
  flex: 1;;
  overflow: hidden;
`;

const Sidebar = styled.div<{ $isOpen: boolean }>`
  width: ${({ $isOpen }) => ($isOpen ? '33.333%' : '0')};
  background: #1e1e2f;
  transition: width 0.3s ease;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-right: 2px solid #00ff00;
`;

const MainContent = styled.div<{ $isOpen: boolean }>`
  flex: ${({ $isOpen }) => ($isOpen ? '0.666667' : '1')};
  display: flex;
  flex-direction: column;
  padding-top: 20px;

  align-items: center;
  justify-content: center;
`;
const Button = styled.button`
  background: transparent;
  border: 2px solid #00ff00;
  color: #00ff00;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-size: 1rem;
  margin: 10px;
  transition: background-color 0.3s, color 0.3s;

  &:hover {
    background-color: #00ff00;
    color: #0d0d0d;
  }
`;

const Frame = styled.div`
  width: 100%;
  padding-left: 15px;
  padding-right: 15px;
`;

const ResponsiveIframe = styled.iframe`
  width: 100%;
  height: 80vh;

  border: none;
  box-shadow: 0 0 20px rgba(0, 255, 0, 0.75);

  
  
`;


const ToggleButton = styled.button<{ $isOpen: boolean }>`
   background: #1e1e2f;
  border: 2px solid #00ff00;
  color: #00ff00;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-size: 1rem;
  transition: left 0.3s ease, background-color 0.3s, color 0.3s;
  position: absolute;
  top: 70px;
  left: ${({ $isOpen }) => ($isOpen ? 'calc(33.333% - 100px)' : '0px')}; // Moves button with the sidebar
  z-index: 1001; // Ensure it's above the sidebar
  &:hover {
    background-color: #00ff00;
    color: #0d0d0d;
  }
`;

export default function ChallengePage() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);  // Explicitly type the ref
  const router = useRouter();

  const toggleFullScreen = () => {
    const iframe = iframeRef.current;
    if (iframe) {
      if (!document.fullscreenElement) {
        iframe.requestFullscreen().catch(err => {
          alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    }
  };

  let WebOs_Link = "http://localhost:3001/";
  return (

    <PageContainer>
      <Header />
      <ContentContainer>
        <ToggleButton $isOpen={isSidebarOpen} onClick={() => setSidebarOpen(!isSidebarOpen)}>
          {isSidebarOpen ? '← Close' : 'Open →'}
        </ToggleButton>
        <Sidebar $isOpen={isSidebarOpen}>
          <p>Challenge Tools</p>
        </Sidebar>
        <MainContent $isOpen={isSidebarOpen}>
          <Frame>
              <ResponsiveIframe
                  ref={iframeRef}
                  src={WebOs_Link}
                  title="WebOS"
              ></ResponsiveIframe>
          </Frame>
          <div>
            <Button onClick={() => console.log("Stopping Challenge...")}>Stop Challenge</Button>
            <Button onClick={() => console.log("Displaying Hint...")}>Hint</Button>
            <Button onClick={() => router.push('https://discord.gg/yourinvite')}>Discord</Button>
            <Button onClick={toggleFullScreen}>Toggle Fullscreen</Button>
          </div>
        </MainContent>
      </ContentContainer>
    </PageContainer>
  );
}
