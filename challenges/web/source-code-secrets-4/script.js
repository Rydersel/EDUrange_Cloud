// CyberNexus Security System
// Version 3.4.2
// Last Updated: 2023-06-15

// Configuration
const config = {
    // System settings
    system: {
        name: "CyberNexus",
        version: "3.4.2",
        build: "20230615-1",
        debug: false,
        logLevel: "info"
    },

    // Security settings
    security: {
        maxLoginAttempts: 3,
        lockoutTime: 300, // seconds
        sessionTimeout: 1800, // seconds
        requireMFA: true,
        passwordPolicy: {
            minLength: 10,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecial: true
        }
    },

    // API endpoints
    api: {
        baseUrl: "https://api.cybernexus.io/v1",
        timeout: 30000,
        retryAttempts: 3
    }
};

// User database - DO NOT EXPOSE TO PRODUCTION
// This is only for development and testing
const users = [
    {
        id: 1,
        username: "admin",
        // Password hash for "Sup3rS3cur3P@ss!"
        passwordHash: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
        role: "administrator",
        lastLogin: "2023-06-14T08:45:22Z",
        mfaEnabled: true
    },
    {
        id: 2,
        username: "jsmith",
        // Password hash for "Password123!"
        passwordHash: "ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f",
        role: "user",
        lastLogin: "2023-06-15T08:30:15Z",
        mfaEnabled: false
    },
    {
        id: 3,
        username: "admin_test",
        // Password hash for "cybersec2023!"
        passwordHash: "b1ad3f741a49597e0e2c466f0f6a40e899f675d2a7d14e569ed2d1f6022b89eb",
        role: "administrator",
        lastLogin: null,
        mfaEnabled: false
    }
];

// Backdoor access - REMOVE BEFORE DEPLOYMENT
// Base64 encoded: supersecretadmin
const backdoorCredentials = {
    username: "backdoor",
    password: "EDU-{m4st3r_0f_s0urc3_c0d3_s3cr3ts}"
};

// Login attempt counter
let loginAttempts = 0;

// Terminal output messages
const terminalMessages = [
    "Initializing secure connection...",
    "Connection established.",
    "Welcome to CyberNexus. Authentication required.",
    "Please login to continue."
];

// Initialize the terminal with startup messages
document.addEventListener("DOMContentLoaded", function() {
    // Add event listener for login button
    document.getElementById("login-btn").addEventListener("click", attemptLogin);

    // Add event listener for Enter key on password field
    document.getElementById("password").addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            attemptLogin();
        }
    });

    // Log system initialization (for debugging)
    if (config.system.debug) {
        console.log("System initialized with config:", config);
    }
});

// Function to attempt login
function attemptLogin() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const errorMessage = document.getElementById("error-message");

    // Clear previous error message
    errorMessage.textContent = "";

    // Check if fields are empty
    if (!username || !password) {
        errorMessage.textContent = "Please enter both username and password.";
        return;
    }

    // Increment login attempts
    loginAttempts++;

    // Check for backdoor access (for development only)
    if (username === "backdoor" && atob("c3VwZXJzZWNyZXRhZG1pbg==") === password) {
        // This is a backdoor for development - REMOVE IN PRODUCTION
        showSuccessMessage("Backdoor access granted. Welcome, Developer!");
        revealFlag();
        return;
    }

    // Check for test account
    if (username === "admin_test" && password === "cybersec2023!") {
        showSuccessMessage("Test account access granted. Welcome!");
        revealFlag();
        return;
    }

    // Check credentials against user database
    const user = users.find(u => u.username === username);
    if (user && hashPassword(password) === user.passwordHash) {
        showSuccessMessage(`Authentication successful. Welcome, ${username}!`);
        // In a real system, we would redirect to the dashboard or home page
        return;
    }

    // Handle failed login
    if (loginAttempts >= config.security.maxLoginAttempts) {
        errorMessage.textContent = `Account locked. Too many failed attempts. Try again in ${config.security.lockoutTime / 60} minutes.`;
        // In a real system, we would implement an actual lockout
    } else {
        errorMessage.textContent = `Invalid username or password. Attempts remaining: ${config.security.maxLoginAttempts - loginAttempts}`;
    }
}

// Function to show success message
function showSuccessMessage(message) {
    const errorMessage = document.getElementById("error-message");
    errorMessage.style.color = "var(--success-color)";
    errorMessage.textContent = message;
}

// Function to reveal the flag (this would be triggered by successful authentication)
function revealFlag() {
    // In a real application, this would make an API call to get the flag
    setTimeout(() => {
        alert(`Congratulations! You've found the flag: ${backdoorCredentials.password}`);
    }, 1000);
}

// Simulated password hashing function (DO NOT USE IN PRODUCTION)
// In a real application, we would use a proper hashing algorithm with salt
function hashPassword(password) {
    // This is a simplified hash for demonstration purposes
    // In reality, we would use bcrypt, Argon2, or similar
    return sha256(password);
}

// Simple SHA-256 implementation for demo purposes
// In a real application, we would use a proper crypto library
function sha256(str) {
    // This is just a placeholder that returns the same hash as stored in the users array
    // for the known passwords. In a real application, this would be a real hash function.
    if (str === "Sup3rS3cur3P@ss!") {
        return "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8";
    } else if (str === "Password123!") {
        return "ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f";
    } else if (str === "cybersec2023!") {
        return "b1ad3f741a49597e0e2c466f0f6a40e899f675d2a7d14e569ed2d1f6022b89eb";
    }
    return "unknown_hash";
}
