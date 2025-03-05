// ConnectSphere Social Dashboard JavaScript

// User data and configuration
const userData = {
    name: "John Doe",
    username: "johndoe",
    email: "john.doe@example.com",
    role: "user",
    lastLogin: "2023-03-15T10:30:45Z",
    preferences: {
        theme: "light",
        notifications: true,
        language: "en-US",
        timezone: "America/New_York"
    }
};

// Security configuration - DO NOT EXPOSE TO USERS
const securityConfig = {
    apiKey: "api_key_12345", // This should be kept secret in production
    encryptionKey: "enc_key_67890", // This should be kept secret in production
    debugMode: false,
    secretFlag: "FLAG_PLACEHOLDER", // This will be replaced with the actual flag
    authEndpoint: "https://api.connectsphere.example/auth",
    tokenExpiry: 3600 // seconds
};

// Analytics tracking
const analyticsData = {
    pageViews: 1259,
    uniqueVisitors: 487,
    averageSessionTime: 325, // seconds
    bounceRate: 0.32,
    topReferrers: ["google.com", "facebook.com", "twitter.com"],
    trackPageView: function() {
        this.pageViews++;
        console.log("Page view tracked. Total views: " + this.pageViews);
    }
};

// Initialize the dashboard
document.addEventListener("DOMContentLoaded", function() {
    console.log("Dashboard initialized for user: " + userData.username);
    
    // Track page view
    analyticsData.trackPageView();
    
    // Set up event listeners
    setupEventListeners();
    
    // Initialize UI components
    initializeUI();
});

// Set up event listeners for interactive elements
function setupEventListeners() {
    // Mobile sidebar toggle
    const sidebarToggle = document.getElementById("sidebarToggle");
    if (sidebarToggle) {
        sidebarToggle.addEventListener("click", function() {
            document.querySelector(".sidebar").classList.toggle("active");
        });
    }
    
    // Reveal message button
    const revealBtn = document.getElementById("reveal-btn");
    if (revealBtn) {
        revealBtn.addEventListener("click", function() {
            const message = document.getElementById("message");
            message.classList.toggle("hidden");
        });
    }
    
    // Refresh challenge button
    const refreshChallenge = document.getElementById("refreshChallenge");
    if (refreshChallenge) {
        refreshChallenge.addEventListener("click", function() {
            alert("Challenge refreshed! Keep looking for the flag!");
        });
    }
}

// Initialize UI components
function initializeUI() {
    // Update user info
    updateUserInfo();
    
    // Initialize charts (placeholder function)
    initializeCharts();
    
    // Check for notifications
    checkNotifications();
}

// Update user information in the UI
function updateUserInfo() {
    // Update user name in the welcome message
    const welcomeMessage = document.querySelector(".welcome-text h1");
    if (welcomeMessage) {
        welcomeMessage.textContent = `Welcome back, ${userData.name.split(" ")[0]}!`;
    }
    
    // Update user details in the sidebar and header
    const userNames = document.querySelectorAll(".user-details h4, .user-dropdown span");
    userNames.forEach(element => {
        element.textContent = userData.name;
    });
}

// Initialize charts (placeholder function)
function initializeCharts() {
    console.log("Charts initialized");
    // This would normally contain chart initialization code
}

// Check for notifications
function checkNotifications() {
    console.log("Checking for notifications");
    // This would normally fetch notifications from an API
}

// Helper function to format dates
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString(userData.preferences.language, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Helper function to format numbers
function formatNumber(number) {
    return number.toLocaleString(userData.preferences.language);
}

// Debug function - only works when debug mode is enabled
function debugLog(message) {
    if (securityConfig.debugMode) {
        console.log("DEBUG: " + message);
    }
}

// Function to validate user input
function validateInput(input) {
    // Simple validation to prevent XSS
    return input.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Function to simulate API calls
function simulateApiCall(endpoint, data) {
    return new Promise((resolve, reject) => {
        // Simulate network delay
        setTimeout(() => {
            console.log(`API call to ${endpoint} with data:`, data);
            resolve({ success: true, message: "Operation completed successfully" });
        }, 500);
    });
}

// Function to handle user logout
function handleLogout() {
    // Clear user session
    console.log("User logged out");
    // Redirect to login page
    // window.location.href = "/login";
}

// Easter egg function - can be triggered in console
function showEasterEgg() {
    console.log("You found an easter egg! But not the flag...");
    console.log("Keep looking!");
}

/*
 * SECURITY NOTE:
 * In a real application, sensitive information like API keys and tokens
 * should never be included in client-side JavaScript. This is just for
 * demonstration purposes.
 * 
 * The flag for this challenge is hidden in the securityConfig object.
 * In a real application, this would be a serious security vulnerability!
 */ 