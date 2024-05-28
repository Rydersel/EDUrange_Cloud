// components/Login.js
import { useState } from 'react';
import { login } from '../auth/auth';
import { useRouter } from 'next/router';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const router = useRouter();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');

        try {
            const user = await login(email, password);
            // Handle successful login (e.g., save token, redirect)
            console.log('Login successful:', user);
            router.push('/dashboard'); // Redirect to a protected route
        } catch (error) {
            setError(error.message);
        }
    };

    return (
        <div className="login-container">
            <form onSubmit={handleLogin} className="login-form">
                <h2>Login</h2>
                {error && <p className="error">{error}</p>}
                <div className="form-group">
                    <label htmlFor="email">Email:</label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="password">Password:</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                <button type="submit">Login</button>
            </form>

            <style jsx>{`
                .login-container {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    background-color: #f0f0f0;
                }
                .login-form {
                    background: white;
                    padding: 2rem;
                    border-radius: 5px;
                    box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
                    width: 300px;
                    display: flex;
                    flex-direction: column;
                }
                .form-group {
                    margin-bottom: 1rem;
                }
                .form-group label {
                    display: block;
                    margin-bottom: 0.5rem;
                }
                .form-group input {
                    width: 100%;
                    padding: 0.5rem;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                }
                .error {
                    color: red;
                    margin-bottom: 1rem;
                }
                button {
                    padding: 0.5rem;
                    border: none;
                    border-radius: 4px;
                    background: #0070f3;
                    color: white;
                    cursor: pointer;
                }
            `}</style>
        </div>
    );
};

export default Login;
