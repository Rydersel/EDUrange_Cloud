<?php
// Database configuration
define('DB_HOST', 'DB_HOST_PLACEHOLDER');
define('DB_PORT', 'DB_PORT_PLACEHOLDER');
define('DB_NAME', 'DB_NAME_PLACEHOLDER');
define('DB_USER', 'DB_USER_PLACEHOLDER');
define('DB_PASSWORD', 'DB_PASSWORD_PLACEHOLDER');

// Application flag
define('FLAG', 'FLAG_PLACEHOLDER');

// Establish database connection
function getDbConnection() {
    try {
        $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME;
        $pdo = new PDO($dsn, DB_USER, DB_PASSWORD);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $pdo;
    } catch (PDOException $e) {
        // Log error but don't expose details to users
        error_log("Database connection error: " . $e->getMessage());
        return null;
    }
}
