<?php
// Start the session at the very beginning before any output
session_start();
require_once 'config.php';

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: index.php');
    exit;
}

// Handle logout
if (isset($_GET['logout'])) {
    // Clear all session variables
    $_SESSION = array();
    
    // Destroy the session
    session_destroy();
    
    // Redirect to login page
    header('Location: index.php');
    exit;
}

// Get username and admin status
$username = isset($_SESSION['username']) ? htmlspecialchars($_SESSION['username']) : 'Unknown User';
$isAdmin = isset($_SESSION['is_admin']) ? $_SESSION['is_admin'] : false;
$flag = isset($_SESSION['flag']) ? $_SESSION['flag'] : 'No flag available';

// Get a random account number for realism
$accountNumber = mt_rand(10000000, 99999999);
$balance = number_format(mt_rand(50000, 1000000) / 100, 2);
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SecureBank - Dashboard</title>
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
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
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
        
        .user-nav {
            display: flex;
            align-items: center;
            gap: 20px;
        }
        
        .user-greeting {
            display: flex;
            align-items: center;
        }
        
        .user-icon {
            margin-right: 8px;
        }
        
        .logout-btn {
            display: inline-block;
            background-color: rgba(255,255,255,0.2);
            color: white;
            padding: 8px 15px;
            border-radius: 5px;
            cursor: pointer;
            text-decoration: none;
            transition: background-color 0.3s;
        }
        
        .logout-btn:hover {
            background-color: rgba(255,255,255,0.3);
        }
        
        .main-content {
            padding: 40px 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .dashboard-header {
            margin-bottom: 30px;
        }
        
        .dashboard-title {
            font-size: 28px;
            color: #1e40af;
            margin-bottom: 10px;
        }
        
        .dashboard-subtitle {
            color: #666;
        }
        
        .dashboard-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .card {
            background-color: white;
            padding: 25px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            height: 100%;
        }
        
        .account-card {
            display: flex;
            flex-direction: column;
        }
        
        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .card-title {
            font-size: 18px;
            font-weight: 600;
            color: #1e40af;
        }
        
        .card-icon {
            font-size: 24px;
            color: #1e40af;
        }
        
        .account-number {
            color: #666;
            margin-bottom: 5px;
            font-size: 14px;
        }
        
        .account-balance {
            font-size: 28px;
            font-weight: 700;
            color: #333;
            margin-bottom: 20px;
        }
        
        .action-button {
            display: inline-block;
            background-color: #1e40af;
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            cursor: pointer;
            text-decoration: none;
            text-align: center;
            transition: background-color 0.3s;
            margin-top: auto;
        }
        
        .action-button:hover {
            background-color: #1e3a8a;
        }
        
        .transactions-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        
        .transactions-table th {
            background-color: #f9fafb;
            padding: 12px;
            text-align: left;
            font-weight: 600;
            color: #1e40af;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .transactions-table td {
            padding: 12px;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .trans-amount {
            font-weight: 600;
        }
        
        .amount-credit {
            color: #10b981;
        }
        
        .amount-debit {
            color: #ef4444;
        }
        
        .flag-container {
            margin-top: 30px;
            padding: 30px;
            background-color: #fff8e1;
            border: 2px dashed #ffc107;
            border-radius: 8px;
            text-align: center;
        }
        
        .flag-title {
            font-size: 24px;
            color: #b45309;
            margin-bottom: 20px;
        }
        
        .flag-icon {
            font-size: 36px;
            margin-bottom: 15px;
        }
        
        .flag {
            font-family: 'Courier New', monospace;
            font-size: 24px;
            color: #d32f2f;
            background-color: #ffebee;
            padding: 15px 20px;
            border-radius: 5px;
            display: inline-block;
            font-weight: bold;
        }
        
        .admin-badge {
            display: inline-block;
            background-color: #2196f3;
            color: white;
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 12px;
            margin-left: 10px;
            font-weight: 500;
        }
        
        .access-denied {
            margin-top: 30px;
            padding: 30px;
            background-color: #f9fafb;
            border-radius: 8px;
            text-align: center;
            border: 1px solid #e5e7eb;
        }
        
        .access-denied-icon {
            font-size: 48px;
            color: #ef4444;
            margin-bottom: 20px;
        }
        
        .access-denied-title {
            font-size: 24px;
            color: #ef4444;
            margin-bottom: 15px;
        }
        
        .access-denied-text {
            color: #666;
            max-width: 500px;
            margin: 0 auto 20px;
        }
        
        footer {
            background-color: #1e3a8a;
            color: white;
            padding: 20px 0;
            text-align: center;
            font-size: 14px;
            margin-top: 40px;
        }
        
        @media (max-width: 768px) {
            .dashboard-grid {
                grid-template-columns: 1fr;
            }
            
            .user-nav {
                gap: 10px;
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
            <div class="user-nav">
                <div class="user-greeting">
                    <span class="user-icon">👤</span>
                    <span><?php echo $username; ?></span>
                    <?php if ($isAdmin): ?>
                        <span class="admin-badge">Administrator</span>
                    <?php endif; ?>
                </div>
                <a href="?logout=1" class="logout-btn">Logout</a>
            </div>
        </div>
    </header>
    
    <main class="main-content">
        <div class="container">
            <div class="dashboard-header">
                <h1 class="dashboard-title">Welcome to Your Dashboard</h1>
                <p class="dashboard-subtitle">Manage your accounts and transactions securely</p>
            </div>
            
            <div class="dashboard-grid">
                <div class="card account-card">
                    <div class="card-header">
                        <h2 class="card-title">Checking Account</h2>
                        <span class="card-icon">💳</span>
                    </div>
                    <div class="account-number">Account #<?php echo $accountNumber; ?></div>
                    <div class="account-balance">$<?php echo $balance; ?></div>
                    <a href="#" class="action-button">View Details</a>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h2 class="card-title">Quick Actions</h2>
                        <span class="card-icon">⚡</span>
                    </div>
                    <a href="#" class="action-button" style="display: block; margin-bottom: 10px;">Transfer Money</a>
                    <a href="#" class="action-button" style="display: block; margin-bottom: 10px;">Pay Bills</a>
                    <a href="#" class="action-button" style="display: block;">Apply for Loan</a>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">Recent Transactions</h2>
                    <span class="card-icon">📊</span>
                </div>
                
                <table class="transactions-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Description</th>
                            <th>Amount</th>
                            <th>Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Oct 15, 2023</td>
                            <td>Deposit</td>
                            <td class="trans-amount amount-credit">+$1,250.00</td>
                            <td>$<?php echo $balance; ?></td>
                        </tr>
                        <tr>
                            <td>Oct 12, 2023</td>
                            <td>Coffee Shop</td>
                            <td class="trans-amount amount-debit">-$4.50</td>
                            <td>$<?php echo number_format($balance - 1250 + 4.50, 2); ?></td>
                        </tr>
                        <tr>
                            <td>Oct 10, 2023</td>
                            <td>Gas Station</td>
                            <td class="trans-amount amount-debit">-$38.75</td>
                            <td>$<?php echo number_format($balance - 1250 + 4.50 + 38.75, 2); ?></td>
                        </tr>
                        <tr>
                            <td>Oct 7, 2023</td>
                            <td>Payroll Deposit</td>
                            <td class="trans-amount amount-credit">+$2,450.00</td>
                            <td>$<?php echo number_format($balance - 1250 + 4.50 + 38.75 - 2450, 2); ?></td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            <?php if ($isAdmin): ?>
                <div class="flag-container">
                    <div class="flag-icon">🚩</div>
                    <h2 class="flag-title">Congratulations! SQL Injection Successful!</h2>
                    <p>You've successfully bypassed authentication and gained admin access.</p>
                    <div style="margin: 20px 0;">
                        <p>Here's your flag:</p>
                        <div class="flag"><?php echo $flag; ?></div>
                    </div>
                    <p>You can now collect this flag and move on to the next challenge.</p>
                </div>
            <?php else: ?>
                <div class="access-denied">
                    <div class="access-denied-icon">🔐</div>
                    <h2 class="access-denied-title">Administrator Access Required</h2>
                    <p class="access-denied-text">Your current account doesn't have administrator privileges needed to view sensitive information.</p>
                    <p class="access-denied-text">Hint: Can you find a way to login as an admin user using SQL injection?</p>
                </div>
            <?php endif; ?>
        </div>
    </main>
    
    <footer>
        <p>&copy; 2023 SecureBank. All rights reserved. | Disclaimer: This is a fictional website created for educational purposes.</p>
    </footer>
</body>
</html> 