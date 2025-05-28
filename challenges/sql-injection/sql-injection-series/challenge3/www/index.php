<?php
require_once 'config.php';

// Initialize variables
$search_term = '';
$results = [];
$error_message = '';
$search_performed = false;
$raw_query = '';
$syntax_hint = '';

// Process search form submission
if ($_SERVER["REQUEST_METHOD"] == "GET" && isset($_GET['search']) && $_GET['search'] !== '') {
    $search_term = $_GET['search'];
    $search_performed = true;
    
    // Check if user is trying to use -- without a space
    if (strpos($search_term, '--') !== false && !strpos($search_term, '-- ')) {
        $syntax_hint = "<div class='syntax-hint'>Psst! MySQL requires a space after -- for comments. Try using '-- ' (with a space) or '#' instead.</div>";
    }
    
    // Get database connection
    $conn = getDbConnection();
    
    if ($conn) {
        try {
            // VULNERABLE QUERY - susceptible to SQL injection
            $query = "SELECT name, email FROM users WHERE name LIKE '%$search_term%'";
            
            // Store raw query for display
            $raw_query = $query;
            
            $stmt = $conn->query($query);
            
            // Fetch results
            $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
        } catch (PDOException $e) {
            // Show the error message to help students understand the database structure
            $error_message = "SQL Error: " . $e->getMessage();
        }
    } else {
        $error_message = "Database connection error. Please try again later.";
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Company Directory - User Search</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary-color: #3498db;
            --primary-dark: #2980b9;
            --secondary-color: #2ecc71;
            --secondary-dark: #27ae60;
            --text-color: #333;
            --text-light: #666;
            --bg-color: #f8f9fa;
            --bg-light: #ffffff;
            --border-color: #e0e0e0;
            --error-color: #e74c3c;
            --hint-bg: #fff8e1;
            --hint-border: #ffd54f;
            --syntax-hint-bg: #e3f2fd;
            --syntax-hint-border: #90caf9;
            --radius: 8px;
            --shadow: 0 2px 10px rgba(0,0,0,0.05);
        }
        
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            line-height: 1.6;
        }
        
        .header {
            background-color: var(--primary-color);
            color: white;
            padding: 1rem 0;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .nav-container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .logo {
            font-size: 1.5rem;
            font-weight: bold;
            display: flex;
            align-items: center;
        }
        
        .logo i {
            margin-right: 10px;
        }
        
        .nav-links {
            display: flex;
            list-style: none;
        }
        
        .nav-links li {
            margin-left: 20px;
        }
        
        .nav-links a {
            color: white;
            text-decoration: none;
            font-weight: 500;
            transition: opacity 0.3s;
        }
        
        .nav-links a:hover {
            opacity: 0.8;
        }
        
        .container {
            max-width: 1000px;
            margin: 30px auto;
            background-color: var(--bg-light);
            padding: 30px;
            box-shadow: var(--shadow);
            border-radius: var(--radius);
        }
        
        h1 {
            color: var(--text-color);
            margin-bottom: 1.5rem;
            font-weight: 600;
            font-size: 1.8rem;
        }
        
        .search-section {
            margin-bottom: 30px;
            background-color: #f5f7fa;
            padding: 20px;
            border-radius: var(--radius);
            border: 1px solid var(--border-color);
        }
        
        .search-form {
            display: flex;
            margin-bottom: 15px;
        }
        
        .search-input {
            flex-grow: 1;
            padding: 12px 15px;
            border: 1px solid var(--border-color);
            border-radius: var(--radius) 0 0 var(--radius);
            font-size: 16px;
            transition: border-color 0.3s;
        }
        
        .search-input:focus {
            outline: none;
            border-color: var(--primary-color);
        }
        
        .search-button {
            background-color: var(--primary-color);
            color: white;
            padding: 12px 20px;
            border: none;
            border-radius: 0 var(--radius) var(--radius) 0;
            cursor: pointer;
            font-size: 16px;
            transition: background-color 0.3s;
        }
        
        .search-button:hover {
            background-color: var(--primary-dark);
        }
        
        .search-info {
            color: var(--text-light);
            font-size: 0.9rem;
            margin-bottom: 10px;
        }
        
        .raw-query {
            font-family: 'Courier New', monospace;
            background-color: #f0f4f8;
            padding: 12px 15px;
            border: 1px solid var(--border-color);
            border-radius: var(--radius);
            margin: 15px 0;
            overflow-x: auto;
            font-size: 0.9rem;
            color: #24292e;
        }
        
        .raw-query strong {
            color: var(--primary-color);
        }
        
        .error {
            color: var(--error-color);
            background-color: #fdecea;
            padding: 15px;
            border-radius: var(--radius);
            margin-bottom: 20px;
            border-left: 4px solid var(--error-color);
            font-weight: 500;
        }
        
        .results {
            margin-top: 30px;
        }
        
        .results-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--border-color);
        }
        
        .results-count {
            font-size: 0.9rem;
            color: var(--text-light);
        }
        
        .user-item {
            padding: 15px;
            border: 1px solid var(--border-color);
            border-radius: var(--radius);
            margin-bottom: 10px;
            transition: transform 0.2s, box-shadow 0.2s;
            background-color: white;
        }
        
        .user-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.05);
        }
        
        .user-item strong {
            color: var(--primary-color);
        }
        
        .user-item .name {
            font-size: 1.1rem;
            margin-bottom: 5px;
            color: var(--text-color);
        }
        
        .user-item .email {
            color: var(--text-light);
        }
        
        .user-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 15px;
        }
        
        .no-results {
            color: var(--text-light);
            background-color: #f0f4f8;
            padding: 20px;
            border-radius: var(--radius);
            text-align: center;
        }
        
        .syntax-hint {
            background-color: var(--syntax-hint-bg);
            border: 1px solid var(--syntax-hint-border);
            padding: 12px 15px;
            border-radius: var(--radius);
            margin: 15px 0;
            color: #0d47a1;
            font-weight: 500;
            display: flex;
            align-items: center;
        }
        
        .syntax-hint i {
            margin-right: 10px;
            font-size: 1.2rem;
        }
        
        .hint-section {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px dashed var(--border-color);
        }
        
        .hint-toggle {
            background-color: #f0f4f8;
            border: none;
            padding: 10px 15px;
            font-size: 1rem;
            border-radius: var(--radius);
            cursor: pointer;
            display: flex;
            align-items: center;
            margin-bottom: 15px;
            color: var(--text-color);
            font-weight: 500;
        }
        
        .hint-toggle i {
            margin-right: 10px;
        }
        
        .hint {
            padding: 20px;
            background-color: var(--hint-bg);
            border: 1px solid var(--hint-border);
            border-radius: var(--radius);
            display: none;
        }
        
        .hint.active {
            display: block;
        }
        
        .hint code {
            background-color: rgba(0,0,0,0.05);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
        }
        
        .hint ul {
            padding-left: 20px;
            margin: 10px 0;
        }
        
        .hint li {
            margin-bottom: 8px;
        }
        
        .footer {
            text-align: center;
            margin-top: 50px;
            padding: 20px;
            color: var(--text-light);
            font-size: 0.9rem;
            border-top: 1px solid var(--border-color);
        }
    </style>
</head>
<body>
    <header class="header">
        <div class="nav-container">
            <div class="logo">
                <i class="fas fa-users"></i>
                <span>Company Directory</span>
            </div>
            <ul class="nav-links">
                <li><a href="#"><i class="fas fa-home"></i> Home</a></li>
                <li><a href="#"><i class="fas fa-user-circle"></i> Employees</a></li>
                <li><a href="#"><i class="fas fa-building"></i> Departments</a></li>
                <li><a href="#"><i class="fas fa-info-circle"></i> About</a></li>
            </ul>
        </div>
    </header>
    
    <div class="container">
        <h1><i class="fas fa-search"></i> Employee Directory Search</h1>
        
        <div class="search-section">
            <form method="GET" action="" class="search-form">
                <input type="text" name="search" placeholder="Search employees by name..." class="search-input" value="<?php echo htmlspecialchars($search_term); ?>">
                <button type="submit" class="search-button"><i class="fas fa-search"></i> Search</button>
            </form>
            
            <?php if ($search_performed): ?>
                <div class="search-info">
                    Search results for: <strong><?php echo htmlspecialchars($search_term); ?></strong>
                </div>
                
                <?php if (!empty($syntax_hint)): ?>
                    <div class="syntax-hint">
                        <i class="fas fa-lightbulb"></i>
                        Psst! MySQL requires a space after -- for comments. Try using '-- ' (with a space) or '#' instead.
                    </div>
                <?php endif; ?>
                
                <?php if (!empty($raw_query)): ?>
                    <div class="raw-query">
                        <strong>Generated SQL:</strong> <?php echo htmlspecialchars($raw_query); ?>
                    </div>
                <?php endif; ?>
            <?php endif; ?>
            
            <?php if (!empty($error_message)): ?>
                <div class="error">
                    <i class="fas fa-exclamation-circle"></i> <?php echo $error_message; ?>
                </div>
            <?php endif; ?>
        </div>
        
        <?php if ($search_performed && empty($error_message)): ?>
            <div class="results">
                <div class="results-header">
                    <h2>Search Results</h2>
                    <div class="results-count"><?php echo count($results); ?> employees found</div>
                </div>
                
                <?php if (count($results) > 0): ?>
                    <div class="user-grid">
                        <?php foreach ($results as $user): ?>
                            <div class="user-item">
                                <div class="name"><i class="fas fa-user"></i> <strong><?php echo htmlspecialchars($user['name']); ?></strong></div>
                                <div class="email"><i class="fas fa-envelope"></i> <?php echo htmlspecialchars($user['email']); ?></div>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php else: ?>
                    <div class="no-results">
                        <i class="fas fa-search"></i> No employees found matching your search criteria.
                    </div>
                <?php endif; ?>
            </div>
        <?php endif; ?>
        
        <div class="hint-section">
            <button class="hint-toggle" onclick="toggleHint()">
                <i class="fas fa-question-circle"></i> Challenge Hints (Click to Toggle)
            </button>
            
            <div class="hint" id="hintSection">
                <strong>Hint 1:</strong> Use SQL injection to cause errors and learn about the database structure.
                <br><br>
                <strong>Key Information:</strong>
                <ul>
                    <li>The database has a table called <code>flags</code> which contains the information you need to find</li>
                    <li>First determine how many columns are in the current query</li>
                    <li>Then use UNION to access the <code>flags</code> table</li>
                </ul>
                <br>
                <strong>Try these steps:</strong>
                <ul>
                    <li><code>' ORDER BY 3 #</code> (What happens?)</li>
                    <li><code>' ORDER BY 2 #</code> (Compare with above)</li>
                    <li>Once you know how many columns are in the query, think about using UNION to combine results from the <code>flags</code> table with matching column count</li>
                </ul>
                <br>
                <strong>Remember:</strong> Error messages can reveal valuable information about the database structure!
            </div>
        </div>
    </div>
    
    <footer class="footer">
        <p>Company Directory &copy; 2023 - All rights reserved</p>
    </footer>
    
    <script>
        function toggleHint() {
            const hintSection = document.getElementById('hintSection');
            hintSection.classList.toggle('active');
            
            const toggleButton = document.querySelector('.hint-toggle');
            if (hintSection.classList.contains('active')) {
                toggleButton.innerHTML = '<i class="fas fa-minus-circle"></i> Hide Challenge Hints';
            } else {
                toggleButton.innerHTML = '<i class="fas fa-question-circle"></i> Challenge Hints (Click to Toggle)';
            }
        }
        
        // Initialize hint section (hidden by default)
        document.addEventListener('DOMContentLoaded', function() {
            const urlParams = new URLSearchParams(window.location.search);
            const showHints = urlParams.get('hints');
            
            if (showHints === 'show') {
                toggleHint();
            }
        });
    </script>
</body>
</html> 