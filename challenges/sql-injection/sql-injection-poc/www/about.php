<?php
require_once 'config.php';
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>About SQL Injection</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>About SQL Injection</h1>
            <p>Learn about SQL Injection vulnerabilities and how to prevent them.</p>
        </header>
        
        <main>
            <section class="content-section">
                <h2>What is SQL Injection?</h2>
                <p>SQL Injection (SQLi) is a type of security vulnerability that occurs when an attacker is able to insert or "inject" malicious SQL code into a query that an application sends to its database. It's one of the most common web application vulnerabilities and can lead to severe consequences.</p>
                
                <h2>How SQL Injection Works</h2>
                <p>SQL injection takes advantage of poor input validation in web applications. When user input is concatenated directly into SQL queries without proper sanitation, attackers can manipulate the structure of the query to:</p>
                
                <ul>
                    <li>Bypass authentication</li>
                    <li>Access, modify, or delete data</li>
                    <li>Execute administrative operations on the database</li>
                    <li>Retrieve the content of files on the database server</li>
                </ul>
                
                <h3>Example Vulnerable Code</h3>
                <pre><code>// Vulnerable PHP code
$username = $_POST['username'];
$password = $_POST['password'];

$query = "SELECT * FROM users WHERE username = '$username' AND password = '$password'";</code></pre>
                
                <h3>Common SQL Injection Techniques</h3>
                <ol>
                    <li><strong>Basic Authentication Bypass:</strong> Using <code>admin' --</code> to log in as admin</li>
                    <li><strong>UNION Attacks:</strong> Using UNION to combine result sets from different tables</li>
                    <li><strong>Batch Queries:</strong> Using semicolons to execute multiple queries</li>
                    <li><strong>Blind SQL Injection:</strong> Extracting data when no visible output is available</li>
                </ol>
                
                <h2>Prevention Methods</h2>
                <p>To protect against SQL injection, developers should:</p>
                
                <ul>
                    <li><strong>Use Prepared Statements:</strong> Separate SQL code from data</li>
                    <li><strong>Input Validation:</strong> Validate and sanitize all user inputs</li>
                    <li><strong>Parameterized Queries:</strong> Use database-specific parameterization methods</li>
                    <li><strong>ORM Frameworks:</strong> Use Object-Relational Mapping libraries that handle SQL securely</li>
                    <li><strong>Least Privilege:</strong> Limit database account permissions</li>
                </ul>
                
                <h3>Secure Code Example</h3>
                <pre><code>// Secure PHP code using prepared statements
$stmt = $pdo->prepare("SELECT * FROM users WHERE username = ? AND password = ?");
$stmt->execute([$username, $password]);</code></pre>
                
                <div class="back-link">
                    <a href="index.php" class="button">Back to Challenge</a>
                </div>
            </section>
        </main>
        
        <footer>
            <p>&copy; 2025 SecureBank. All rights reserved.</p>
            <p class="small">This is a training application for SQL injection vulnerabilities.</p>
        </footer>
    </div>
</body>
</html> 