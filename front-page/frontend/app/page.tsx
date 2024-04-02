'use client'

import { useRouter } from 'next/navigation';
import styled, { keyframes } from 'styled-components';

const gradient = keyframes`
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
`;

const LandingContainer = styled.div`
  color: #fff;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(-45deg, #121212, #1e1e2f, #342345, #1e1e2f, #121212);
  background-size: 800% 800%;
  animation: ${gradient} 30s ease infinite;
`;

const Title = styled.h1`
  font-size: 4rem;
  margin-bottom: 2rem;
  text-align: center;
`;

const Button = styled.button`
  background: transparent;
  border: 2px solid #00ff00; // Green border
  color: #00ff00; // Green text
  padding: 1rem 2rem;
  cursor: pointer;
  font-size: 1.5rem;
  margin: 20px 0; // Added margin for spacing
  transition: background-color 0.3s, color 0.3s;

  &:hover {
    background-color: #00ff00; // Green background on hover
    color: #0d0d0d; // Almost black text on hover for contrast
  }
`;

const GithubButton = styled(Button)`
  background: #333; // Dark background for contrast
  border-color: #fff; // White border for visibility
  color: #fff; // White text to stand out
  font-size: 1rem; // Smaller font size
  padding: 0.5rem 1rem; // Smaller padding
  position: fixed; // Fixed position to stay in view
  bottom: 20px; // Distance from the bottom of the viewport
  right: 20px; // Distance from the right of the viewport

  &:hover {
    background-color: #fff;
    color: #333;
  }
`;


export default function Landing() {
  const router = useRouter();

  const navigateToLogin = () => {
    router.push('/login'); // Update to match the path of your login page
  };

  return (
    <LandingContainer>
      <Title>Edurange CTF</Title>
      <Button onClick={navigateToLogin}>Login / Dashboard</Button>
      <a href="https://github.com/Rydersel/EDURANGE_CTF_Module" target="_blank" rel="noopener noreferrer">
        <GithubButton>View on GitHub</GithubButton>
      </a>
    </LandingContainer>
  );
}
