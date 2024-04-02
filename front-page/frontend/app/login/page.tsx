'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styled from 'styled-components';


const LoginContainer = styled.div`
  color: #fff;
  background-color: #121212;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

const LoginForm = styled.form`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
`;

const Input = styled.input`
  padding: 0.5rem;
  background: #333;
  border: 1px solid #0f0;
  color: #fff;
`;

const Button = styled.button`
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

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (event: { preventDefault: () => void; }) => {
    event.preventDefault();
    //Login logic placeholder

    console.log("Login attempt with", { username, password });


    router.push('/dashboard'); // Use the router to navigate on successful login
  };

  return (
    <LoginContainer>
      <h2>Login to Your Account</h2>
      <LoginForm onSubmit={handleLogin}>
        <Input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit">Log In</Button>
      </LoginForm>
    </LoginContainer>
  );
}
