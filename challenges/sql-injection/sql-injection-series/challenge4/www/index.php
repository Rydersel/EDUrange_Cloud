<?php
require_once 'config.php';

// Initialize variables
$username = '';
$message = '';
$authenticated = false;
$login_attempted = false;
$raw_query = ''; // Store the raw query for display
$flag_revealed = false;
$pin_code_correct = false;
$invalid_attempts = 0;

// Get possible PIN codes (1 real, 5 fake)
session_start();
if (!isset($_SESSION['possible_pins'])) {
    // The real PIN from config
    $real_pin = defined('PIN_CODE') ? PIN_CODE : "1337";
    
    // Generate 5 fake PINs
    generatePossiblePins($real_pin);
}

// FIXME: Remove debug configs before production
define('DEBUG_MODE', true);
define('QUERY_TIMEOUT', 10); // seconds

// Process login form submission
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['username'], $_POST['password'])) {
    $username = $_POST['username'];
    $password = $_POST['password'];
    $login_attempted = true;
    
    // Get database connection
    $conn = getDbConnection();
    
    if ($conn) {
        try {
            // VULNERABLE QUERY - susceptible to time-based SQL injection
            // Note the lack of prepared statements and direct string concatenation
            $query = "SELECT id, username FROM users WHERE username = '$username' AND password = '$password'";
            $raw_query = $query; // Store for display

            // FIXME: Remove debug logging in production!
            if (DEBUG_MODE) {
                error_log("[DEBUG] SQL Query: $query");
            }
            
            // Increase default timeout to prevent timeouts during long queries
            // FIXME: This is a security risk! Remove before deployment!
            set_time_limit(QUERY_TIMEOUT); 
            
            // Execute the query - could trigger time delay if exploited
            $result = $conn->query($query);
            
            if ($result && $result->rowCount() > 0) {
                $authenticated = true;
                // Successful login
                $message = "Login successful. Welcome, {$username}!";
            } else {
                // Generic error for security in production
                $message = "Invalid username or password.";
            }
            
        } catch (PDOException $e) {
            // Show SQL error in debug mode
            if (DEBUG_MODE) {
                $message = "[DEV-ONLY] SQL Error: " . $e->getMessage();
                error_log("[DEBUG] SQL Error: " . $e->getMessage());
            } else {
                $message = "Invalid username or password.";
            }
        }
        
        // DEV ONLY: Log database info
        // FIXME: Remove all this before production!
        if (DEBUG_MODE) {
            try {
                $tables_query = "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()";
                $tables_result = $conn->query($tables_query);
                $tables = [];
                while ($row = $tables_result->fetch(PDO::FETCH_ASSOC)) {
                    $tables[] = $row['table_name'];
                }
                error_log("[DEBUG] Database tables: " . implode(", ", $tables));
                
                // DEV ONLY: Check flag table structure
                $flag_query = "DESCRIBE flags";
                $flag_result = $conn->query($flag_query);
                $flag_columns = [];
                while ($row = $flag_result->fetch(PDO::FETCH_ASSOC)) {
                    $flag_columns[] = $row['Field'];
                }
                error_log("[DEBUG] Flag table columns: " . implode(", ", $flag_columns));
                
                // DEV ONLY: Double check the pin code is set
                $flag_check = $conn->query("SELECT pin_code FROM flags LIMIT 1");
                $flag_data = $flag_check->fetch(PDO::FETCH_ASSOC);
                error_log("[DEBUG] Pin code check: " . ($flag_data ? "Pin exists" : "Pin missing!"));
            } catch (Exception $e) {
                error_log("[DEBUG] Error accessing schema: " . $e->getMessage());
            }
        }
    } else {
        $message = "Service temporarily unavailable. Please try again later.";
    }
}

// Process pin code submission 
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['pin_code'])) {
    $submitted_pin = $_POST['pin_code'];
    
    // Get database connection
    $conn = getDbConnection();
    
    if ($conn) {
        try {
            // Check if pin code is correct
            $pin_query = "SELECT _s3cr3t_flag FROM flags WHERE pin_code = ?";
            $stmt = $conn->prepare($pin_query);
            $stmt->execute([$submitted_pin]);
            
            if ($stmt->rowCount() > 0) {
                $result = $stmt->fetch(PDO::FETCH_ASSOC);
                $flag_revealed = true;
                $flag_value = $result['_s3cr3t_flag'];
                $pin_code_correct = true;
                
                // Additional debug logging
                error_log("[DEBUG] Flag revealed: $flag_value");
            } else {
                $message = "Incorrect PIN code. Try again.";
                $invalid_attempts++;
                
                // Generate a completely new PIN and update it in the database
                $new_pin = sprintf("%04d", mt_rand(1000, 9999));
                
                try {
                    // Update the PIN in the database
                    $update_query = "UPDATE flags SET pin_code = ? WHERE id = 1";
                    $update_stmt = $conn->prepare($update_query);
                    $update_stmt->execute([$new_pin]);
                    
                    // Now regenerate the possible PINs with this new PIN
                    generatePossiblePins($new_pin);
                    
                    error_log("[DEBUG] PIN randomized to: $new_pin after incorrect attempt");
                } catch (Exception $e) {
                    error_log("[ERROR] Error updating PIN code: " . $e->getMessage());
                }
            }
        } catch (PDOException $e) {
            $message = "Error checking PIN code: " . $e->getMessage();
            error_log("[ERROR] PIN check error: " . $e->getMessage());
        }
    }
}

// Function to generate possible PINs (1 real, 5 fake)
function generatePossiblePins($real_pin) {
    $possible_pins = array($real_pin);
    
    // Generate 5 unique fake PINs
    while (count($possible_pins) < 6) {
        $fake_pin = sprintf("%04d", mt_rand(1000, 9999));
        if (!in_array($fake_pin, $possible_pins)) {
            $possible_pins[] = $fake_pin;
        }
    }
    
    // Shuffle to randomize position of real PIN
    shuffle($possible_pins);
    
    $_SESSION['possible_pins'] = $possible_pins;
    // We don't store the real PIN in the session for security
    return $possible_pins;
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Secure Login Portal</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 20px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background-color: white;
            padding: 20px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            border-radius: 5px;
        }
        h1 {
            color: #333;
            text-align: center;
        }
        .login-form {
            margin-top: 20px;
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
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 16px;
        }
        .login-button {
            background-color: #4CAF50;
            color: white;
            padding: 10px 15px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            width: 100%;
        }
        .login-button:hover {
            background-color: #45a049;
        }
        .back-button {
            background-color: #6c757d;
            color: white;
            padding: 8px 15px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-bottom: 20px;
            display: inline-block;
            text-decoration: none;
        }
        .back-button:hover {
            background-color: #5a6268;
        }
        .message {
            margin-top: 20px;
            padding: 10px;
            border-radius: 4px;
        }
        .success {
            background-color: #d4edda;
            color: #155724;
        }
        .error {
            background-color: #f8d7da;
            color: #721c24;
        }
        .hint-button {
            background-color: #f0ad4e;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 20px;
            font-weight: bold;
        }
        .hint-button:hover {
            background-color: #ec971f;
        }
        .hint {
            margin-top: 20px;
            padding: 10px;
            background-color: #ffffd0;
            border: 1px solid #e7e7ca;
            border-radius: 4px;
            display: none; /* Hidden by default */
        }
        .hint code {
            background-color: #f5f5f5;
            padding: 2px 4px;
            border-radius: 3px;
            font-family: monospace;
        }
        .authenticated-content {
            margin-top: 20px;
            padding: 15px;
            background-color: #e8f5e9;
            border-radius: 4px;
        }
        pre {
            background-color: #f5f5f5;
            padding: 10px;
            border-radius: 4px;
            overflow-x: auto;
        }
        .debug-info {
            margin-top: 20px;
            padding: 15px;
            background-color: #e6f3ff;
            border-radius: 4px; 
            border: 1px solid #b3d7ff;
        }
        .timer {
            position: fixed;
            bottom: 10px;
            right: 10px;
            background-color: rgba(0,0,0,0.7);
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-family: monospace;
        }
        
        /* FIXME: Remove this dev-only class before production */
        .dev-info {
            display: none;
        }
        
        .flag-display {
            margin-top: 20px;
            padding: 20px;
            background-color: #d1ecf1;
            border: 1px solid #bee5eb;
            border-radius: 4px;
            color: #0c5460;
            text-align: center;
        }
        
        .flag-display h2 {
            margin-top: 0;
        }
        
        .flag-value {
            font-family: monospace;
            font-size: 24px;
            background-color: #f8f9fa;
            padding: 10px;
            border-radius: 4px;
            display: inline-block;
            margin-top: 10px;
        }
        
        .pin-form {
            margin-top: 30px;
            padding: 20px;
            background-color: #e9ecef;
            border-radius: 4px;
            border: 1px solid #dee2e6;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Secure Login Portal</h1>
        
        <?php if ($flag_revealed): ?>
            <div class="flag-display">
                <h2>Congratulations!</h2>
                <p>You have successfully extracted the correct PIN code and authenticated to the secure area.</p>
                <p>Your flag is:</p>
                <div class="flag-value"><?php echo !empty($flag_value) ? htmlspecialchars($flag_value) : (defined('FLAG') ? htmlspecialchars(FLAG) : 'FLAG_ERROR'); ?></div>
                <?php if (empty($flag_value) && !defined('FLAG')): ?>
                <p class="error">Error: Flag value is empty. Please contact the administrator.</p>
                <?php endif; ?>
            </div>
            <a href="index.php" class="back-button">← Back to Login</a>
        <?php elseif ($authenticated): ?>
            <!-- Content shown after successful login -->
            <a href="index.php" class="back-button">← Back to Login</a>
            <div class="authenticated-content">
                <h2>Welcome, Administrator!</h2>
                <p>You've successfully authenticated. Here's your user information:</p>
                <pre>
Username: <?php echo htmlspecialchars($username); ?>
Role: Administrator
Last Login: <?php echo date('Y-m-d H:i:s'); ?>
                </pre>
            </div>
            
            <div class="pin-form">
                <h3>Secure Area Access</h3>
                <p>Enter the 4-digit PIN code to access the flag:</p>
                <form method="POST" action="">
                    <div class="form-group">
                        <label for="pin_code">PIN Code:</label>
                        <input type="text" id="pin_code" name="pin_code" placeholder="Enter 4-digit PIN" maxlength="4" pattern="\d{4}" required>
                    </div>
                    <button type="submit" class="login-button">Access Secure Area</button>
                </form>
                <?php if (!empty($message) && !$pin_code_correct): ?>
                <div class="message error">
                    <?php echo $message; ?>
                    <?php if ($invalid_attempts > 0): ?>
                    <p><small>Note: Possible PIN codes are randomized after each incorrect attempt for security.</small></p>
                    <?php endif; ?>
                </div>
                <?php endif; ?>
            </div>
        <?php else: ?>
            <form method="POST" action="" class="login-form">
                <div class="form-group">
                    <label for="username">Username:</label>
                    <input type="text" id="username" name="username" value="<?php echo htmlspecialchars($username); ?>" required>
                </div>
                <div class="form-group">
                    <label for="password">Password:</label>
                    <input type="password" id="password" name="password" required>
                </div>
                <button type="submit" class="login-button">Login</button>
            </form>
            
            <?php if ($login_attempted): ?>
                <div class="message <?php echo $authenticated ? 'success' : 'error'; ?>">
                    <?php echo $message; ?>
                </div>
                
                <!-- DEV-ONLY: Remove in production! -->
                <?php if (DEBUG_MODE && !empty($raw_query)): ?>
                <div class="debug-info">
                    <h4>DEV-ONLY: SQL Query</h4>
                    <pre><?php echo htmlspecialchars($raw_query); ?></pre>
                    <p><small>FIXME: Remove this debugging info before deployment!</small></p>
                </div>
                <?php endif; ?>
            <?php endif; ?>
            
            <button class="hint-button" onclick="toggleHint()">Need Help?</button>
            
            <div class="hint" id="hint-box">
                <h3>SQL Injection Challenge</h3>
                
                <p>This login form appears to have SQL injection vulnerabilities that can be exploited.</p>
                
                <p><strong>Hints:</strong></p>
                <ul>
                    <li>SQL injection often works by manipulating the query structure</li>
                    <li>Check the browser console (F12) for any useful information</li>
                    <li>When error messages are hidden, timing attacks might be effective</li>
                    <li>MySQL's SLEEP() function can introduce delays in queries</li>
                    <li>The flag is stored in the database using a non-standard column name</li>
                    <li>Focus on extracting the 4-digit PIN code, not the flag directly</li>
                    <li>Look for possible PIN codes in the debug logs, then submit the correct one to access the flag</li>
                </ul>
                
                <p><strong>Try different payloads to test for vulnerabilities.</strong></p>
            </div>
            
        <?php endif; ?>
        
        <!-- FIXME: Remove this debug element before production -->
        <div id="debug-data" class="dev-info"></div>
    </div>
    
    <div id="timer" class="timer">Loading...</div>
    
    <script>
        // Function to toggle hint visibility
        function toggleHint() {
            var hintBox = document.getElementById("hint-box");
            var hintButton = document.querySelector(".hint-button");
            
            if (hintBox.style.display === "block") {
                hintBox.style.display = "none";
                hintButton.textContent = "Need Help?";
            } else {
                hintBox.style.display = "block";
                hintButton.textContent = "Hide Help";
            }
        }
        
        // DEV-ONLY: Performance metrics tracking
        // FIXME: Remove before production!
        var _debugData = {
            pageLoadStart: new Date().getTime(),
            serverInfo: {
                dbTables: ["users", "flags"],
                flagColumn: "_s3cr3t_flag",
                pinColumn: "pin_code",
                appVersion: "0.9.2-dev"
            },
            testQueries: {
                bypass: "' OR 1=1 -- ",
                union: "' UNION SELECT 1, _s3cr3t_flag FROM flags -- ", 
                timeBased: "' OR IF(SUBSTR((SELECT pin_code FROM flags LIMIT 0,1),1,1)='1', SLEEP(3), 0) -- "
            },
            possiblePINCodes: <?php echo json_encode($_SESSION['possible_pins'] ?? []); ?>,
            timeout: <?php echo QUERY_TIMEOUT; ?>,
            invalidAttempts: <?php echo $invalid_attempts; ?>,
            correctPIN: "<?php 
                // Fetch the current correct PIN directly from the database for testing
                $conn = getDbConnection();
                $correct_pin = "unknown";
                if ($conn) {
                    try {
                        $pin_check = $conn->query("SELECT pin_code FROM flags LIMIT 1");
                        $correct_pin = $pin_check->fetch(PDO::FETCH_COLUMN);
                    } catch (Exception $e) {
                        error_log("[DEBUG] Error fetching current PIN: " . $e->getMessage());
                    }
                }
                echo $correct_pin;
            ?>"
        };
        
        var timerElement = document.getElementById("timer");
        var debugElement = document.getElementById("debug-data");
        
        window.onload = function() {
            var loadTime = new Date().getTime() - _debugData.pageLoadStart;
            timerElement.textContent = "Page loaded in " + loadTime + "ms";
            
            // DEV-ONLY: Debug logging
            // FIXME: REMOVE ALL THIS BEFORE PRODUCTION DEPLOYMENT!!!
            console.log("[DEV DEBUG] Environment: development");
            console.log("[DEV DEBUG] Database connection: success");
            console.log("[DEV DEBUG] Database tables found: users, flags");
            console.log("[DEV DEBUG] Checking flag table...");
            console.log("[DEV DEBUG] Flag table columns: id, _s3cr3t_flag, pin_code");
            console.log("[DEV DEBUG] Security audit: Password length check failed - insufficient protection");
            console.log("[DEV DEBUG] SQL injection protections: none (FIXME!)");
            console.log("[DEV DEBUG] Flag stored in database with obscured column name (_s3cr3t_flag)");
            console.log("[DEV DEBUG] Direct flag access via basic SQL injection: difficult due to non-standard column name");
            console.log("[DEV DEBUG] Query timeout set to: " + _debugData.timeout + "s (ALERT: security risk!)");
            
            // Log the correct PIN code for testing purposes (remove in production)
            console.log("[DEV DEBUG] *** CORRECT-CODE: " + _debugData.correctPIN + " ***");
            
            console.log("[DEV DEBUG] Possible PIN codes (only one is correct, randomized after each failed attempt):");
            
            // Log possible PIN codes
            if (_debugData.possiblePINCodes && _debugData.possiblePINCodes.length > 0) {
                _debugData.possiblePINCodes.forEach(function(pin, index) {
                    console.log("[DEV DEBUG]   PIN Option " + (index + 1) + ": " + pin);
                });
            }
            
            console.log("[DEV DEBUG] Test query examples:");
            console.log("[DEV DEBUG] - Login bypass: " + _debugData.testQueries.bypass);
            console.log("[DEV DEBUG] - UNION tests: " + _debugData.testQueries.union);
            
            // Generate time-based example for first digit of first possible PIN
            if (_debugData.possiblePINCodes && _debugData.possiblePINCodes.length > 0) {
                var firstDigit = _debugData.possiblePINCodes[0].charAt(0);
                console.log("[DEV DEBUG] - Time-based test: ' OR IF(SUBSTR((SELECT pin_code FROM flags LIMIT 0,1),1,1)='" + firstDigit + "', SLEEP(3), 0) -- ");
            } else {
                console.log("[DEV DEBUG] - Time-based test: " + _debugData.testQueries.timeBased);
            }
            
            console.log("[DEV DEBUG] Time-based attacks detected: no (use SLEEP() logging to monitor)");
            console.log("[DEV DEBUG] REMEMBER TO REMOVE ALL DEBUG INFO BEFORE PRODUCTION!");
            
            // Store debug data for development
            debugElement.textContent = JSON.stringify(_debugData, null, 2);
        };
    </script>
</body>
</html> 