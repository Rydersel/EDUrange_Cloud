<?php
// Start the session at the very beginning before any output
session_start();
require_once 'config.php';

// Initialize variables
$search_term = '';
$search_results = [];
$error_message = '';
$debug_info = '';

// Process search form submission
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['search'])) {
    $search_term = $_POST['search'];
    
    // Get database connection
    $conn = getDbConnection();
    
    if ($conn) {
        try {
            // VULNERABLE QUERY - susceptible to SQL injection
            // This query is vulnerable to UNION-based attacks
            $query = "SELECT id, name, description, price, category FROM products WHERE name LIKE '%$search_term%' OR description LIKE '%$search_term%'";
            
            // Debug info - always shown for educational purposes
            $debug_info = "Generated SQL: " . htmlspecialchars($query);
            
            $stmt = $conn->query($query);
            $search_results = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            if (count($search_results) === 0) {
                $error_message = "No results found matching your search criteria.";
            }
        } catch (PDOException $e) {
            // Show error message for educational purposes
            $error_message = "Error executing query: " . $e->getMessage();
        }
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SQL Injection Challenge 5</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f0f8ff;
            color: #333;
        }
        
        .container {
            max-width: 900px;
            margin: 0 auto;
            background-color: #fff;
            padding: 20px;
            border: 1px solid #ddd;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        
        .challenge-header {
            background-color: #2c3e50;
            color: white;
            padding: 15px;
            margin-bottom: 20px;
        }
        
        .objective-box {
            background-color: #e8f4f8;
            padding: 15px;
            margin-bottom: 20px;
            border-left: 5px solid #3498db;
        }
        
        h1 {
            margin: 0;
            font-size: 24px;
        }
        
        h2 {
            margin-top: 20px;
            margin-bottom: 10px;
            color: #2c3e50;
        }
        
        h3 {
            color: #3498db;
        }
        
        .search-form {
            display: flex;
            margin-bottom: 20px;
        }
        
        .search-input {
            flex: 1;
            padding: 10px;
            border: 1px solid #ddd;
            font-size: 16px;
            border-radius: 3px 0 0 3px;
        }
        
        .search-button {
            background-color: #3498db;
            color: white;
            border: none;
            padding: 10px 20px;
            cursor: pointer;
            font-size: 16px;
            border-radius: 0 3px 3px 0;
            transition: background-color 0.2s;
        }
        
        .search-button:hover {
            background-color: #2980b9;
        }
        
        .results-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
            margin-bottom: 30px;
        }
        
        .results-table th {
            background-color: #3498db;
            color: white;
            text-align: left;
            padding: 10px;
            border: 1px solid #ddd;
        }
        
        .results-table td {
            padding: 10px;
            border: 1px solid #ddd;
        }
        
        .results-table tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        
        .error-message {
            background-color: #ffebee;
            color: #c62828;
            padding: 10px;
            margin-bottom: 15px;
            border-left: 4px solid #c62828;
        }
        
        .debug-info {
            background-color: #f5f5f5;
            border: 1px solid #ddd;
            padding: 10px;
            margin-bottom: 15px;
            font-family: monospace;
            white-space: pre-wrap;
        }
        
        .resources-section {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
        }
        
        .resources-grid {
            display: flex;
            gap: 20px;
            margin-top: 15px;
        }
        
        .resource-box {
            flex: 1;
            background-color: #f9f9f9;
            padding: 15px;
            border: 1px solid #ddd;
            border-radius: 3px;
        }
        
        .hint-box {
            background-color: #e3f2fd;
            border-left: 4px solid #2196f3;
            padding: 15px;
            margin-top: 10px;
            border-radius: 3px;
        }
        
        .resource-toggle {
            display: inline-block;
            background-color: #3498db;
            color: white;
            padding: 8px 15px;
            margin-right: 10px;
            margin-bottom: 10px;
            border-radius: 3px;
            cursor: pointer;
            border: none;
            font-size: 14px;
        }
        
        .resource-toggle:hover {
            background-color: #2980b9;
        }
        
        .developer-note {
            margin-top: 30px;
            background-color: #fff8e1;
            border-left: 4px solid #ffc107;
            padding: 15px;
            font-size: 14px;
            border-radius: 3px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="challenge-header">
            <h1>SQL Injection Challenge 5: Data Extraction</h1>
        </div>
        
        <div class="objective-box">
            <h2>Challenge Objective:</h2>
            <p>This challenge has a SQL injection vulnerability in its search function. Your goal is to extract a flag from a hidden table in the database.</p>
            <ol>
                <li>Use the search box to inject SQL code</li>
                <li>Find the hidden table using UNION-based SQL injection</li>
                <li>Extract the flag value</li>
            </ol>
        </div>
        
        <form class="search-form" method="POST" action="">
            <input type="text" name="search" class="search-input" placeholder="Enter your search query..." value="<?php echo htmlspecialchars($search_term); ?>">
            <button type="submit" class="search-button">Search</button>
        </form>
        
        <?php if (!empty($error_message)): ?>
        <div class="error-message">
            <?php echo $error_message; ?>
        </div>
        <?php endif; ?>
        
        <?php if (!empty($debug_info)): ?>
        <div class="debug-info">
            <strong>Debug Information:</strong>
            <?php echo $debug_info; ?>
        </div>
        <?php endif; ?>
        
        <h2>Search Results</h2>
        
        <?php if (empty($search_results) && empty($search_term)): ?>
            <p>Enter a search term to begin.</p>
            <?php
            // Show sample data if no search performed
            $conn = getDbConnection();
            if ($conn) {
                try {
                    $stmt = $conn->query("SELECT id, name, description, price, category FROM products LIMIT 3");
                    $search_results = $stmt->fetchAll(PDO::FETCH_ASSOC);
                } catch (PDOException $e) {
                    // Silently fail
                }
            }
            ?>
        <?php endif; ?>
        
        <?php if (!empty($search_results)): ?>
            <table class="results-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Description</th>
                        <th>Price</th>
                        <th>Category</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($search_results as $result): ?>
                    <tr>
                        <td><?php echo htmlspecialchars($result['id'] ?? 'N/A'); ?></td>
                        <td><?php echo htmlspecialchars($result['name'] ?? 'N/A'); ?></td>
                        <td><?php echo htmlspecialchars($result['description'] ?? 'N/A'); ?></td>
                        <td><?php echo htmlspecialchars($result['price'] ?? 'N/A'); ?></td>
                        <td><?php echo htmlspecialchars($result['category'] ?? 'N/A'); ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php elseif (!empty($search_term)): ?>
            <p>No results found matching your search criteria.</p>
        <?php endif; ?>
        
        <div class="resources-section">
            <h2>Helpful Resources</h2>
            
            <button class="resource-toggle" onclick="toggleHint()">Show/Hide Hints</button>
            <button class="resource-toggle" onclick="toggleTables()">Show/Hide Database Help</button>
            
            <div class="resources-grid">
                <div class="resource-box" id="hint-box" style="display: none;">
                    <h3>SQL Injection Hints:</h3>
                    <ol>
                        <li>Use ORDER BY to find the number of columns (try ORDER BY 1, ORDER BY 2, etc.)</li>
                        <li>Use UNION SELECT to combine queries (must match the same number of columns)</li>
                        <li>Look for hidden tables using information_schema.tables</li>
                        <li>Examine column names using information_schema.columns</li>
                    </ol>
                </div>
                
                <div class="resource-box" id="tables-info" style="display: none;">
                    <h3>Useful Database Tables:</h3>
                    <ul>
                        <li><code>information_schema.tables</code> - Contains information about all tables</li>
                        <li><code>information_schema.columns</code> - Contains information about all columns</li>
                        <li><code>secret_documents</code> - A hidden table with sensitive information</li>
                    </ul>
                    <p>Example query to explore tables: <code>' UNION SELECT 1, table_name, table_schema, 4, 5 FROM information_schema.tables WHERE table_schema = database() -- </code></p>
                </div>
            </div>
        </div>
        
        <div class="developer-note">
            <p><strong>Developer Note:</strong> This is a development version with debug mode enabled. The search functionality has a SQL injection vulnerability.</p>
            <p>Note: The database contains a table called <code>secret_documents</code> with sensitive information that should not be accessible.</p>
        </div>
    </div>
    
    <script>
        function toggleHint() {
            const hintBox = document.getElementById('hint-box');
            hintBox.style.display = hintBox.style.display === 'none' ? 'block' : 'none';
        }
        
        function toggleTables() {
            const tablesInfo = document.getElementById('tables-info');
            tablesInfo.style.display = tablesInfo.style.display === 'none' ? 'block' : 'none';
        }
    </script>
</body>
</html>
