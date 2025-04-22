<?php
// Start the session at the very beginning before any output
session_start();
require_once 'config.php';

// Check if user is already logged in
if (isset($_SESSION['logged_in']) && $_SESSION['logged_in'] === true) {
    header('Location: dashboard.php');
    exit;
}

// Initialize the error message variable
$error = "";
$debug_info = "";

// Process login form submission
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['username']) && isset($_POST['password'])) {
    $username = $_POST['username'];
    $password = $_POST['password'];

    // Debug information - echo back the input
    $debug_info = "Attempting login with: Username=" . htmlspecialchars($username) . ", Password=" . htmlspecialchars($password);

    // Get database connection
    $conn = getDbConnection();

    if ($conn) {
        try {
            // VULNERABLE QUERY - susceptible to SQL injection
            // This extremely vulnerable version doesn't use prepared statements
            $query = "SELECT * FROM users WHERE username = '$username' AND password = '$password'";

            // Print the raw query for learning purposes
            $debug_info .= "<br><br>Generated SQL: " . htmlspecialchars($query);

            $stmt = $conn->query($query);

            if ($stmt && $stmt->rowCount() > 0) {
                // Successful login
                $user = $stmt->fetch(PDO::FETCH_ASSOC);

                // Set session variables
                $_SESSION['logged_in'] = true;
                $_SESSION['username'] = $user['username'];
                $_SESSION['is_admin'] = ($user['username'] === 'admin');

                if ($_SESSION['is_admin']) {
                    // Get the flag for admin
                    $flagQuery = "SELECT flag FROM flags LIMIT 1";
                    $flagStmt = $conn->query($flagQuery);
                    $flag = $flagStmt->fetch(PDO::FETCH_COLUMN);
                    $_SESSION['flag'] = $flag;
                }

                // Redirect to dashboard
                header('Location: dashboard.php');
                exit;
            } else {
                $error = "Invalid credentials.";
            }
        } catch (PDOException $e) {
            // Show detailed error for educational purposes in this vulnerable app
            $error = "SQL Error: " . $e->getMessage();
            $debug_info .= "<br><br>Error details: " . $e->getMessage();
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
    <title>SecureBank - Login</title>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Poppins', sans-serif;
        }

        body {
            background-color: #f0f2f5;
            color: #333;
            line-height: 1.6;
        }

        .navbar {
            background-color: #1e40af;
            padding: 15px 0;
            color: white;
        }

        .nav-container {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 20px;
        }

        .logo {
            font-size: 24px;
            font-weight: 700;
            letter-spacing: 0.5px;
            display: flex;
            align-items: center;
        }

        .logo-icon {
            margin-right: 10px;
        }

        .main-content {
            padding: 40px 20px;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            gap: 30px;
        }

        .hero {
            background-color: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .hero-text {
            flex: 1;
            padding-right: 20px;
        }

        .hero h1 {
            font-size: 30px;
            color: #1e40af;
            margin-bottom: 15px;
        }

        .hero p {
            font-size: 16px;
            color: #666;
        }

        .hero-image {
            flex: 1;
            text-align: center;
        }

        .hero-image img {
            max-width: 100%;
            height: auto;
        }

        .login-card {
            background-color: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .login-header {
            margin-bottom: 20px;
            text-align: center;
        }

        .login-header h2 {
            font-size: 24px;
            color: #1e40af;
            margin-bottom: 10px;
        }

        .login-header p {
            color: #666;
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #333;
        }

        .form-control {
            width: 100%;
            padding: 12px 15px;
            font-size: 15px;
            border: 1px solid #ddd;
            border-radius: 5px;
            transition: border-color 0.3s;
            background-color: #f9fafb;
        }

        .form-control:focus {
            border-color: #1e40af;
            outline: none;
            box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.1);
        }

        .btn {
            display: inline-block;
            background-color: #1e40af;
            color: white;
            padding: 12px 15px;
            font-size: 16px;
            font-weight: 500;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            width: 100%;
            text-align: center;
            transition: background-color 0.3s;
        }

        .btn:hover {
            background-color: #1e3a8a;
        }

        .alert {
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }

        .alert-danger {
            background-color: #fee2e2;
            color: #ef4444;
            border-left: 4px solid #ef4444;
        }

        .debug-panel {
            margin-top: 20px;
            padding: 15px;
            background-color: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 5px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            overflow-x: auto;
        }

        .hint-card {
            margin-top: 30px;
            padding: 20px;
            background-color: #fffbeb;
            border: 1px solid #fef3c7;
            border-radius: 5px;
        }

        .hint-header {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
            font-weight: 600;
            color: #d97706;
        }

        .hint-icon {
            margin-right: 10px;
        }

        .code {
            background-color: #f3f4f6;
            padding: 2px 5px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
        }

        .hint-list {
            list-style-type: none;
            padding-left: 10px;
            margin-top: 10px;
        }

        .hint-list li {
            margin-bottom: 8px;
            position: relative;
            padding-left: 20px;
        }

        .hint-list li:before {
            content: "→";
            position: absolute;
            left: 0;
            color: #d97706;
        }

        footer {
            background-color: #1e3a8a;
            color: white;
            padding: 20px 0;
            text-align: center;
            font-size: 14px;
        }

        @media (max-width: 768px) {
            .hero {
                flex-direction: column;
            }

            .hero-text, .hero-image {
                padding: 0;
                margin-bottom: 20px;
            }
        }
    </style>
</head>
<body>
    <header class="navbar">
        <div class="nav-container">
            <div class="logo">
                <span class="logo-icon">🏦</span>
                <span>SecureBank</span>
            </div>
            <div>
                <span>Need help? Call 1-800-SECURE</span>
            </div>
        </div>
    </header>

    <main class="main-content">
        <div class="container">

            <section class="login-card">
                <div class="login-header">
                    <h2>Account Login</h2>
                    <p>Access your accounts securely</p>
                </div>

                <?php if (!empty($error)): ?>
                    <div class="alert alert-danger">
                        <?php echo $error; ?>
                    </div>
                <?php endif; ?>

                <form method="POST" action="">
                    <div class="form-group">
                        <label for="username">Username:</label>
                        <input type="text" id="username" name="username" class="form-control" required>
                    </div>

                    <div class="form-group">
                        <label for="password">Password:</label>
                        <input type="password" id="password" name="password" class="form-control" required>
                    </div>

                    <button type="submit" class="btn">Log In</button>
                </form>

                <?php if (!empty($debug_info)): ?>
                    <div class="debug-panel">
                        <?php echo $debug_info; ?>
                    </div>
                <?php endif; ?>

                <div class="hint-card">
                    <div class="hint-header">
                        <span class="hint-icon">💡</span>
                        <span>Challenge Hint</span>
                    </div>
                    <p>Your task is to bypass the login system using SQL injection and login as the <strong>admin</strong> user to access the admin dashboard and find the flag.</p>
                    <p>Think about how SQL might interpret input like <span class="code">' OR 1=1 --</span></p>
                    <p>Common injection patterns to try:</p>
                    <ul class="hint-list">
                        <li><span class="code">' OR '1'='1</span></li>
                        <li><span class="code">admin' --</span></li>
                        <li><span class="code">' OR 1=1 --</span></li>
                    </ul>
                </div>
            </section>
        </div>
    </main>

    <footer>
        <p>&copy; 2023 SecureBank. All rights reserved. | Disclaimer: This is a fictional website created for educational purposes.</p>
    </footer>
</body>
</html>
