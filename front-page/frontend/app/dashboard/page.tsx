'use client'

import styled from 'styled-components';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { Challenge } from '@/types/types';
import Link from 'next/link';

const HomeContainer = styled.div`
  color: #fff;
  background-color: #121212; 
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

const Title = styled.h1`
  color: #0f0; // Neon green 
  font-size: 2.5rem;
  margin-bottom: 2rem; 
`;

const ChallengesContainer = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const LoginButton = styled.button`
  position: absolute;
  top: 20px;
  right: 20px;
  background: #333;
  color: #0f0;
  padding: 0.5rem 1rem;
  border: none;
  cursor: pointer;

  &:hover {
    background: #0f0;
    color: #333;
  }
`;

const ChallengeCard = styled.div`
  background-color: #333; 
  border: 1px solid #0f0; // Neon green border
  margin: 10px;
  padding: 20px;
  cursor: pointer;
  transition: transform 0.3s ease;

  &:hover {
    transform: scale(1.05);
    border-color: #ff00ff; // Neon magenta 
  }
`;

const ChallengeName = styled.h3`
  color: #00ff00; // Neon green
  text-align: center;
`;

const ChallengeDescription = styled.p`
  color: #ccc;
  text-align: center;
`;

const Home: React.FC = () => {
  const [challenges, setChallenges] = useState<Challenge[]>([]);

  useEffect(() => {
    const fetchChallenges = async () => {
      try {
        const response = await axios.get<Challenge[]>('http://127.0.0.1:5000/api/challenges');
        setChallenges(response.data);
      } catch (error) {
        console.error("There was an error fetching the challenges:", error);
      }
    };

    fetchChallenges();
  }, []);

  const handleChallengeClick = async (challenge: Challenge) => {
    try {
      console.log("clicked")
      const user_id = "example_user_id"; // Replace with actual logic to get user_id
      const challenge_image = "gcr.io/edurangectf/debiantest"
      const webos_url = "http://localhost:3001"
        const startChallengeResponse = await axios.post('http://34.83.141.170:80/api/start-challenge', { user_id, challenge_image, webos_url});

      if (startChallengeResponse.data.url) {
        window.location.href = startChallengeResponse.data.url;
      } else {
        console.error('URL for the challenge is not provided.');
      }
    } catch (error) {
      console.error("Error starting a new challenge instance:", error);
    }
  };

  return (
    <HomeContainer>
      <Link href="/login" passHref>
        <LoginButton>Log In</LoginButton>
      </Link>
      <Title>Welcome to the Edurange CTF Challenges</Title>
      <ChallengesContainer>
        <h2>Select a Challenge</h2>
        {challenges.map((challenge) => (
          <ChallengeCard key={challenge.id} onClick={() => handleChallengeClick(challenge)}>
            <ChallengeName>{challenge.name}</ChallengeName>
            <ChallengeDescription>{challenge.description}</ChallengeDescription>
          </ChallengeCard>
        ))}
      </ChallengesContainer>
    </HomeContainer>
  );
};

export default Home;
