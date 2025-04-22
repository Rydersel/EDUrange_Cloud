<?php
// Database configuration
define('DB_HOST', 'DB_HOST_PLACEHOLDER');
define('DB_PORT', 'DB_PORT_PLACEHOLDER');
define('DB_NAME', 'DB_NAME_PLACEHOLDER');
// The flag is in this table name - will be revealed through errors
define('FLAG_TABLE_NAME', 'FLAG_TABLE_NAME_PLACEHOLDER');
define('DB_USER', 'DB_USER_PLACEHOLDER');
define('DB_PASSWORD', 'DB_PASSWORD_PLACEHOLDER');

// Establish database connection with PDO
function getDbConnection() {
    try {
        $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME;
        $pdo = new PDO($dsn, DB_USER, DB_PASSWORD);
        
        // Set error mode to exceptions to show detailed errors
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        return $pdo;
    } catch (PDOException $e) {
        // Log error but don't expose details to users (error is exposed in the query attempt)
        error_log("Database connection error: " . $e->getMessage());
        return null;
    }
}
?> 