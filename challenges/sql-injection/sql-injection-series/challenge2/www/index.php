<?php
// Start session before any output
session_start();

require_once 'config.php';

// Initialize variables
$search_term = '';
$results = [];
$error_message = '';
$search_performed = false;
$flag_found = false;

// Get the flag from environment variable instead of hardcoding it
$actual_flag = getenv('FLAG') ?: 'CTF_error_based_injection_flag'; // Fallback for testing

// Initialize session for hints progression
if (!isset($_SESSION['hint_level'])) {
    $_SESSION['hint_level'] = 0;
}
if (!isset($_SESSION['attempts'])) {
    $_SESSION['attempts'] = 0;
}

// Track specific error types for hint progression
if (!isset($_SESSION['discovered_column_info'])) {
    $_SESSION['discovered_column_info'] = false;
}
if (!isset($_SESSION['discovered_flag_column'])) {
    $_SESSION['discovered_flag_column'] = false;
}

// Process search form submission
if ($_SERVER["REQUEST_METHOD"] == "GET" && isset($_GET['search']) && $_GET['search'] !== '') {
    $search_term = $_GET['search'];
    $search_performed = true;
    $_SESSION['attempts']++;
    
    // Get database connection
    $conn = getDbConnection();
    
    if ($conn) {
        try {
            // VULNERABLE QUERY - susceptible to SQL injection with verbose error reporting
            $query = "SELECT id, name, email FROM users WHERE name LIKE '%$search_term%'";
            
            // Check if this is likely a UNION-based attack trying to extract flags
            if (preg_match('/union\s+select/i', $search_term) && 
                preg_match('/flags/i', $search_term) && 
                preg_match('/flag_value/i', $search_term)) {
                
                $_SESSION['discovered_flag_column'] = true;
            }
            
            // Execute the query (potentially with UNION injection)
            $stmt = $conn->query($query);
            
            // Fetch results
            $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Check if any result contains the flag
            foreach ($results as $row) {
                foreach ($row as $column => $value) {
                    if ($value === $actual_flag) {
                        $flag_found = true;
                        break 2;
                    }
                }
            }
        } catch (PDOException $e) {
            // Show the full error message to help students learn about database structure
            $error_message = "SQL Error: " . $e->getMessage();
            
            // When we encounter a syntax error, we're displaying column information, so mark as discovered
            if (strpos($e->getMessage(), "syntax") !== false ||
                strpos($e->getMessage(), "column") !== false || 
                strpos($e->getMessage(), "Unknown column") !== false) {
                $_SESSION['discovered_column_info'] = true;
            }
            
            // Error type detection for different hints
            $show_column_info = false;
            
            // Display column information for these conditions:
            if (
                // Original condition still works 
                strpos($e->getMessage(), "Table") !== false && 
                (strpos($e->getMessage(), "doesn't exist") !== false || 
                 strpos($e->getMessage(), "Cardinality violation") !== false ||
                $e->getCode() == '42S02') ||
                // New conditions for column errors
                strpos($e->getMessage(), "column") !== false ||
                strpos($e->getMessage(), "Column") !== false ||
                strpos($e->getMessage(), "field") !== false ||
                // Show for SQL injection patterns involving UNION
                strpos(strtolower($search_term), "union") !== false ||
                // Show after several attempts
                $_SESSION['attempts'] >= 3 ||
                // Show for common SQL injection patterns
                strpos($search_term, "'") !== false
            ) {
                $show_column_info = true;
                $_SESSION['discovered_column_info'] = true;
            }
            
            if ($show_column_info) {
                try {
                    // Instead of querying actual tables, we'll display a fixed set of tables
                    // This ensures no flag-like values appear as table names
                    $error_message .= "<hr><p><strong>Debug info - Tables in current database:</strong></p><ul>";
                    $error_message .= "<li>users</li>";
                    $error_message .= "<li>flags</li>";
                    $error_message .= "</ul>";
                    
                    // Now show column information for the flags table
                    $error_message .= "<p><strong>Column information for 'flags' table:</strong> (Look at these column names!)</p><ul>";
                    $error_message .= "<li><strong>id</strong> (int)</li>";
                    $error_message .= "<li><strong>flag_value</strong> (varchar) 👈 <i>This looks interesting!</i></li>";
                    $error_message .= "<li>description (varchar)</li>";
                    $error_message .= "</ul>";
                    
                    // Progress hints since they found column info
                    if ($_SESSION['hint_level'] < 2) {
                        $_SESSION['hint_level'] = 2;
                    }
                    
                } catch (PDOException $e2) {
                    // If we can't list schemas, don't add additional errors
                }
            }
            
            // Also add console logging for errors
            $console_error = json_encode($e->getMessage());
            echo "<script>console.error('SQL Error:', " . $console_error . ");</script>";
        }
    } else {
        $error_message = "Database connection error. Please try again later.";
    }
    
    // Auto-progress hint level based on attempts
    if ($_SESSION['attempts'] >= 5 && $_SESSION['hint_level'] < 1) {
        $_SESSION['hint_level'] = 1;
    }
    if ($_SESSION['attempts'] >= 10 && $_SESSION['hint_level'] < 3) {
        $_SESSION['hint_level'] = 3;
    }
}

// Reset hint progression
if (isset($_GET['reset_hints'])) {
    $_SESSION['hint_level'] = 0;
    $_SESSION['attempts'] = 0;
    $_SESSION['discovered_column_info'] = false;
    $_SESSION['discovered_flag_column'] = false;
    header("Location: " . $_SERVER['PHP_SELF']);
    exit;
}

// Function to get the appropriate hint based on progression
function getCurrentHint() {
    $hints = [
        // Level 0 - Basic starting hint
        "<strong>Hint 1:</strong> Use SQL injection to extract information from error messages.
        <br><br>
        <p>SQL injection works by inserting SQL code into input fields. For this challenge:</p>
        <ol>
            <li>Try inserting a single quote <code>'</code> to break the SQL syntax</li>
            <li>Error messages can reveal database structure</li>
            <li>The flag is stored in a column in the database</li>
        </ol>
        <p><strong>Try this:</strong> Enter a single quote <code>'</code> in the search box</p>",
        
        // Level 1 - After a few attempts or triggering syntax error
        "<strong>Hint 2:</strong> Good start! Now let's find the flag column.
        <br><br>
        <p>You've triggered a syntax error. Now try to learn about database columns and tables:</p>
        <ol>
            <li>SQL <code>UNION</code> statements combine results from multiple queries</li>
            <li>To use UNION, both queries must have the same number of columns</li>
            <li>Try causing an error with UNION to reveal more database structure</li>
            <li>Look for information about tables that might contain flags</li>
        </ol>
        <p><strong>Hint:</strong> Try a UNION query with different numbers of columns until you find the right structure. The original query selects from a table called 'users'.</p>",
        
        // Level 2 - After seeing column list
        "<strong>Hint 3:</strong> Great! You found the database columns.
        <br><br>
        <p>Now that you know the column names, especially the <code>flag_value</code> column, you can extract the flag:</p>
        <ol>
            <li>Use a UNION SELECT statement to combine results</li>
            <li>Your query needs exactly 3 columns to match the original query</li>
            <li>You need to select from the <code>flags</code> table</li>
            <li>The columns in the flags table are: <code>id</code>, <code>flag_value</code>, and <code>description</code></li>
            <li>Remember to properly terminate the original query using comments (<code>--</code> or <code>#</code>)</li>
        </ol>
        <p><strong>Hint:</strong> When using UNION, both queries must have the same number of columns and compatible data types.</p>",
        
        // Level 3 - After many attempts, give more direct help
        "<strong>Hint 4:</strong> Almost there!
        <br><br>
        <p>To view the flag, you need to create a valid SQL injection with a UNION:</p>
        <ol>
            <li>The original query has 3 columns: <code>id, name, email</code></li>
            <li>Your UNION query needs 3 matching columns from the flags table</li>
            <li>The table 'flags' has these columns: <code>id, flag_value, description</code></li>
            <li>Your injection should replace the results with flag data</li>
        </ol>
        <p><strong>Try these SQL injection patterns:</strong></p>
        <ul>
            <li><code>' UNION SELECT id, flag_value, description FROM flags-- -</code></li>
            <li><code>' UNION SELECT id, flag_value, description FROM flags WHERE 1=1-- -</code></li>
            <li><code>' OR 1=2 UNION SELECT id, flag_value, description FROM flags-- -</code></li>
        </ul>"
    ];
    
    return $hints[$_SESSION['hint_level'] >= count($hints) ? count($hints) - 1 : $_SESSION['hint_level']];
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Challenge 2 - User Search</title>
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
        .search-form {
            margin-bottom: 20px;
            display: flex;
        }
        .search-input {
            flex-grow: 1;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px 0 0 4px;
            font-size: 16px;
        }
        .search-button {
            background-color: #4CAF50;
            color: white;
            padding: 10px 15px;
            border: none;
            border-radius: 0 4px 4px 0;
            cursor: pointer;
            font-size: 16px;
        }
        .search-button:hover {
            background-color: #45a049;
        }
        .results {
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
        .user-item {
            padding: 10px;
            border-bottom: 1px solid #eee;
        }
        .user-item:nth-child(odd) {
            background-color: #f9f9f9;
        }
        .error {
            color: red;
            background-color: #ffeeee;
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 15px;
        }
        .search-info {
            color: #666;
            font-style: italic;
            margin-bottom: 10px;
        }
        .hint {
            margin-top: 20px;
            padding: 10px;
            background-color: #ffffd0;
            border: 1px solid #e7e7ca;
            border-radius: 4px;
            display: none; /* Hidden by default */
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
        .hint code {
            background-color: #f5f5f5;
            padding: 2px 4px;
            border-radius: 3px;
            font-family: monospace;
        }
        .no-results {
            color: #666;
            font-style: italic;
        }
        .progress-info {
            background-color: #e8f4ff;
            padding: 10px;
            border-radius: 4px;
            margin-top: 10px;
            font-size: 0.9em;
        }
        .try-button {
            background-color: #007bff;
            color: white;
            border: none;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 5px;
            font-weight: bold;
        }
        .try-button:hover {
            background-color: #0069d9;
        }
        .flag-announcement {
            background-color: #d4edda;
            color: #155724;
            padding: 15px;
            margin-top: 20px;
            border-radius: 4px;
            text-align: center;
            font-weight: bold;
            border: 1px solid #c3e6cb;
            display: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>User Directory Search</h1>
        
        <form method="GET" action="" class="search-form">
            <input type="text" name="search" placeholder="Search users by name" class="search-input" value="<?php echo htmlspecialchars($search_term); ?>">
            <button type="submit" class="search-button">Search</button>
        </form>
        
        <?php if ($search_performed): ?>
            <div class="search-info">
                You searched for: <strong><?php echo htmlspecialchars($search_term); ?></strong>
            </div>
        <?php endif; ?>
        
        <?php if ($flag_found): ?>
            <div class="flag-announcement" style="display:block">
                🎉 Congratulations! You've found the flag: <code><?php echo htmlspecialchars($actual_flag); ?></code>
            </div>
        <?php endif; ?>
        
        <?php if (!empty($error_message)): ?>
            <div class="error">
                <?php echo $error_message; ?>
            </div>
        <?php endif; ?>
        
        <?php if ($search_performed && empty($error_message)): ?>
            <div class="results">
                <h2>Search Results</h2>
                
                <?php if (count($results) > 0): ?>
                    <?php foreach ($results as $user): ?>
                        <div class="user-item">
                            <?php foreach ($user as $field => $value): ?>
                                <strong><?php echo htmlspecialchars(ucfirst($field)); ?>:</strong> 
                                <?php 
                                if ($value === $actual_flag) {
                                    echo '<span style="color:#28a745;font-weight:bold;">'.htmlspecialchars($value).'</span> 🎉';
                                    echo '<script>document.querySelector(".flag-announcement").style.display = "block";</script>';
                                } else {
                                    echo htmlspecialchars($value);
                                }
                                ?><br>
                            <?php endforeach; ?>
                        </div>
                    <?php endforeach; ?>
                <?php else: ?>
                    <div class="no-results">No users found matching your search criteria.</div>
                <?php endif; ?>
            </div>
        <?php endif; ?>
        
        <!-- Progress indicator for students -->
        <?php if ($_SESSION['attempts'] > 0): ?>
            <div class="progress-info">
                <strong>Progress:</strong><br> 
                <?php if ($_SESSION['discovered_column_info']): ?>
                    ✅ Discovered column information
                <?php else: ?>
                    ❌ Discovered column information
                <?php endif; ?>
                <br>
                <?php if ($_SESSION['discovered_flag_column']): ?>
                    ✅ Used the correct UNION query
                <?php else: ?>
                    ❌ Used the correct UNION query
                <?php endif; ?>
                <br>
                <small>Attempts: <?php echo $_SESSION['attempts']; ?> | Hint level: <?php echo $_SESSION['hint_level']; ?></small>
            </div>
        <?php endif; ?>
        
        <button class="hint-button" onclick="toggleHint()">Show Hint</button>
        
        <div class="hint" id="hint-box">
            <?php echo getCurrentHint(); ?>
        </div>
        
        <script>
            // Function to toggle hint visibility
            function toggleHint() {
                var hintBox = document.getElementById("hint-box");
                var hintButton = document.querySelector(".hint-button");
                
                if (hintBox.style.display === "block") {
                    hintBox.style.display = "none";
                    hintButton.textContent = "Show Hint";
                } else {
                    hintBox.style.display = "block";
                    hintButton.textContent = "Hide Hint";
                }
            }
            
            <?php if (!empty($error_message)): ?>
            // Log error to console
            console.error("SQL Error detected in query");
            <?php endif; ?>
            
            // Auto-show hint if they've been struggling
            <?php if ($_SESSION['attempts'] >= 5): ?>
            window.onload = function() {
                document.getElementById("hint-box").style.display = "block";
                document.querySelector(".hint-button").textContent = "Hide Hint";
            }
            <?php endif; ?>
        </script>
    </div>
</body>
</html> 