<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>E-Commerce Login</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f4f4f4;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background-color: white;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            text-align: center;
        }
        .form-group {
            margin-bottom: 15px;
        }
        .form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        .form-group input {
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        button {
            background-color: #4CAF50;
            color: white;
            padding: 10px 15px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
        }
        button:hover {
            background-color: #45a049;
        }
        .error {
            color: red;
            margin-bottom: 15px;
        }
        .success {
            color: green;
            margin-bottom: 15px;
        }
        .nav {
            margin-bottom: 20px;
        }
        .nav a {
            margin-right: 15px;
            text-decoration: none;
            color: #333;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>E-Commerce Login</h1>
        <div class="nav">
            <a href="index.php">Home</a>
            <a href="products.php">Products</a>
            <a href="search.php">Search</a>
        </div>
        
        <?php
        // Initialize error message
        $error_message = "";
        
        // Check if form was submitted
        if ($_SERVER["REQUEST_METHOD"] == "POST") {
            // Get username and password from form
            $username = $_POST["username"];
            $password = $_POST["password"];
            
            // Connect to database
            $conn = new mysqli("localhost", "webapp", "webapp_password", "vulnerable_db");
            
            // Check connection
            if ($conn->connect_error) {
                die("Connection failed: " . $conn->connect_error);
            }
            
            // VULNERABLE QUERY: No prepared statement or sanitization
            $query = "SELECT * FROM users WHERE username='$username' AND password='$password'";
            $result = $conn->query($query);
            
            if ($result->num_rows > 0) {
                // User found, login successful
                $user = $result->fetch_assoc();
                echo "<p class='success'>Login successful. Welcome, " . $user["name"] . "!</p>";
                
                // Set session variables or perform other login actions here
            } else {
                // User not found, login failed
                $error_message = "Invalid username or password.";
            }
            
            $conn->close();
        }
        ?>
        
        <?php if (!empty($error_message)): ?>
            <div class="error"><?php echo $error_message; ?></div>
        <?php endif; ?>
        
        <form method="post" action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]); ?>">
            <div class="form-group">
                <label for="username">Username:</label>
                <input type="text" id="username" name="username" required>
            </div>
            
            <div class="form-group">
                <label for="password">Password:</label>
                <input type="password" id="password" name="password" required>
            </div>
            
            <button type="submit">Login</button>
        </form>
        
        <p>Don't have an account? <a href="#">Register</a></p>
    </div>
</body>
</html> 