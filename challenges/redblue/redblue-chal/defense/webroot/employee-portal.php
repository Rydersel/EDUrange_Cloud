<?php
// Employee Portal Login Page with SQL Injection vulnerability
session_start();

// Database connection
$db_host = 'localhost';
$db_user = 'webapp';
$db_pass = 'insecure_db_pw';  // This will be replaced by flag-setup.sh
$db_name = 'corp_data';

// Initialize variables
$error = '';
$username = '';

// Check if form is submitted
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // Get username and password from form
    $username = $_POST["username"] ?? '';
    $password = $_POST["password"] ?? '';
    
    // Connect to database
    $conn = new mysqli($db_host, $db_user, $db_pass, $db_name);
    
    // Check connection
    if ($conn->connect_error) {
        $error = "Database connection failed: " . $conn->connect_error;
    } else {
        // VULNERABLE: SQL Injection vulnerability - no prepared statement
        $sql = "SELECT * FROM employees WHERE name = '$username' AND notes LIKE '%$password%'";
        
        // Log attempted login for the monitoring system
        file_put_contents('/var/log/web-logins.log', date('Y-m-d H:i:s') . " - Login attempt: $username\n", FILE_APPEND);
        
        $result = $conn->query($sql);
        
        if ($result && $result->num_rows > 0) {
            // Successful login
            $_SESSION['logged_in'] = true;
            $_SESSION['username'] = $username;
            
            // Redirect to employee dashboard
            header("Location: employee-dashboard.php");
            exit;
        } else {
            // Failed login
            $error = "Invalid username or password";
        }
        
        $conn->close();
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ACME Corporation - Employee Portal</title>
    <link rel="stylesheet" href="css/style.css">
    <style>
        .login-container {
            max-width: 400px;
            margin: 50px auto;
            padding: 20px;
            background-color: #f9f9f9;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        input[type="text"],
        input[type="password"] {
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 3px;
        }
        .error {
            color: #ff0000;
            margin-bottom: 15px;
        }
        .btn {
            background-color: #4CAF50;
            color: white;
            padding: 10px 15px;
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        .btn:hover {
            background-color: #45a049;
        }
    </style>
</head>
<body>
    <header>
        <div class="logo">
            <h1>ACME Corporation</h1>
        </div>
        <nav>
            <ul>
                <li><a href="index.html">Home</a></li>
                <li><a href="about.html">About Us</a></li>
                <li><a href="services.html">Services</a></li>
                <li><a href="contact.html">Contact</a></li>
                <li><a href="employee-portal.php" class="active">Employee Portal</a></li>
            </ul>
        </nav>
    </header>

    <main>
        <div class="login-container">
            <h2>Employee Portal Login</h2>
            
            <?php if ($error): ?>
                <div class="error"><?php echo $error; ?></div>
            <?php endif; ?>
            
            <form method="POST" action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]); ?>">
                <div class="form-group">
                    <label for="username">Username:</label>
                    <input type="text" id="username" name="username" value="<?php echo htmlspecialchars($username); ?>" required>
                </div>
                
                <div class="form-group">
                    <label for="password">Password:</label>
                    <input type="password" id="password" name="password" required>
                </div>
                
                <div class="form-group">
                    <button type="submit" class="btn">Login</button>
                </div>
            </form>
            
            <p><small>Forgot your password? Contact IT department at ext. 1234.</small></p>
        </div>
    </main>

    <footer>
        <div class="footer-content">
            <div class="footer-section">
                <h3>ACME Corporation</h3>
                <p>123 Business Avenue<br>Corporate Park, CA 94105<br>USA</p>
            </div>
            <div class="footer-section">
                <h3>Contact</h3>
                <p>Email: info@acmecorp.example<br>Phone: (555) 123-4567</p>
            </div>
            <div class="footer-section">
                <h3>Follow Us</h3>
                <div class="social-links">
                    <a href="#">Twitter</a>
                    <a href="#">LinkedIn</a>
                    <a href="#">Facebook</a>
                </div>
            </div>
        </div>
        <div class="copyright">
            <p>&copy; 2023 ACME Corporation. All rights reserved.</p>
        </div>
    </footer>
</body>
</html> 