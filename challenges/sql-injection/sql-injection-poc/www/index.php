<?php
require_once 'config.php';

// Initialize the error message variable
$error = "";
$logged_in = false;
$user_data = [];

// Process login form submission
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['username']) && isset($_POST['password'])) {
    $username = $_POST['username'];
    $password = $_POST['password'];
    
    // Get database connection
    $conn = getDbConnection();
    
    if ($conn) {
        try {
            // VULNERABLE QUERY - susceptible to SQL injection
            $query = "SELECT * FROM users WHERE username = '$username' AND password = '$password'";
            $stmt = $conn->query($query);
            
            if ($stmt->rowCount() > 0) {
                $logged_in = true;
                $user_data = $stmt->fetch(PDO::FETCH_ASSOC);
            } else {
                $error = "Invalid username or password.";
            }
        } catch (PDOException $e) {
            // Log the error but show a generic message to the user
            error_log("Login error: " . $e->getMessage());
            $error = "An error occurred during login. Please try again.";
        }
    } else {
        $error = "Database connection error. Please try again later.";
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>User Portal - Login</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>SecureBank User Portal</h1>
            <p>Welcome to the SecureBank online banking system.</p>
        </header>
        
        <main>
            <?php if ($logged_in): ?>
                <!-- Display user information when logged in -->
                <div class="welcome-message">
                    <h2>Welcome, <?php echo htmlspecialchars($user_data['username']); ?>!</h2>
                    <p>You have successfully logged in.</p>
                    
                    <div class="user-info">
                        <h3>Your Account Information:</h3>
                        <p><strong>Email:</strong> <?php echo htmlspecialchars($user_data['email']); ?></p>
                        <p><strong>Account created:</strong> <?php echo htmlspecialchars($user_data['created_at']); ?></p>
                        
                        <?php
                        // Fetch user's secrets
                        try {
                            $query = "SELECT secret_text FROM secrets WHERE user_id = " . $user_data['id'];
                            $secrets = $conn->query($query)->fetchAll(PDO::FETCH_COLUMN);
                            
                            if (count($secrets) > 0) {
                                echo "<h3>Your Secure Notes:</h3>";
                                echo "<ul class='secrets-list'>";
                                foreach ($secrets as $secret) {
                                    echo "<li>" . htmlspecialchars($secret) . "</li>";
                                }
                                echo "</ul>";
                            }
                        } catch (PDOException $e) {
                            error_log("Error fetching secrets: " . $e->getMessage());
                        }
                        ?>
                    </div>
                    
                    <p><a href="index.php" class="button">Log Out</a></p>
                </div>
            <?php else: ?>
                <!-- Display login form when not logged in -->
                <div class="login-container">
                    <h2>Login to Your Account</h2>
                    
                    <?php if (!empty($error)): ?>
                        <div class="error-message"><?php echo htmlspecialchars($error); ?></div>
                    <?php endif; ?>
                    
                    <form action="index.php" method="post" class="login-form">
                        <div class="form-group">
                            <label for="username">Username:</label>
                            <input type="text" id="username" name="username" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="password">Password:</label>
                            <input type="password" id="password" name="password" required>
                        </div>
                        
                        <div class="form-group">
                            <button type="submit" class="button">Login</button>
                        </div>
                    </form>
                    
                    <div class="hint">
                        <p>Hint: Try to log in as the 'admin' user to find the flag.</p>
                    </div>
                </div>
            <?php endif; ?>
        </main>
        
        <footer>
            <p>&copy; 2025 SecureBank. All rights reserved.</p>
            <p class="small">This is a training application for SQL injection vulnerabilities.</p>
        </footer>
    </div>
    
    <script src="script.js"></script>
</body>
</html> 