<?php
// Connect to database
$conn = new mysqli("localhost", "webapp", "webapp_password", "vulnerable_db");

// Check connection
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// Initialize variables
$table = isset($_GET['table']) ? $_GET['table'] : 'products';
$keyword = isset($_GET['keyword']) ? $_GET['keyword'] : '';
$results = array();
$query = "";

// Handle search
if (!empty($keyword)) {
    // HIGHLY VULNERABLE QUERY: Direct table name injection and parameter injection
    $query = "SELECT * FROM $table WHERE id LIKE '%$keyword%'";
    $result = $conn->query($query);
    
    if ($result) {
        while($row = $result->fetch_assoc()) {
            $results[] = $row;
        }
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Advanced Search</title>
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
        .nav {
            margin-bottom: 20px;
        }
        .nav a {
            margin-right: 15px;
            text-decoration: none;
            color: #333;
        }
        .search-form {
            margin-bottom: 20px;
        }
        .search-form input, .search-form select {
            padding: 8px;
            margin-right: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        .search-form button {
            padding: 8px 15px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .result {
            border: 1px solid #ddd;
            padding: 15px;
            margin-bottom: 15px;
            border-radius: 4px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        table, th, td {
            border: 1px solid #ddd;
        }
        th, td {
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: #f2f2f2;
        }
        .query {
            font-family: monospace;
            background-color: #f5f5f5;
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 15px;
            overflow-x: auto;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Advanced Database Search</h1>
        <div class="nav">
            <a href="index.php">Home</a>
            <a href="products.php">Products</a>
            <a href="search.php">Search</a>
        </div>
        
        <div class="search-form">
            <form method="get" action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]); ?>">
                <select name="table">
                    <option value="products" <?php if($table == 'products') echo 'selected'; ?>>Products</option>
                    <option value="users" <?php if($table == 'users') echo 'selected'; ?>>Users</option>
                    <option value="orders" <?php if($table == 'orders') echo 'selected'; ?>>Orders</option>
                </select>
                <input type="text" name="keyword" placeholder="Search keyword..." value="<?php echo htmlspecialchars($keyword); ?>">
                <button type="submit">Search</button>
            </form>
        </div>
        
        <?php if (!empty($query)): ?>
            <div class="query">
                <strong>Query:</strong> <?php echo htmlspecialchars($query); ?>
            </div>
        <?php endif; ?>
        
        <div class="results">
            <?php if (empty($results)): ?>
                <p>No results found.</p>
            <?php else: ?>
                <table>
                    <tr>
                        <?php foreach(array_keys($results[0]) as $key): ?>
                            <th><?php echo htmlspecialchars($key); ?></th>
                        <?php endforeach; ?>
                    </tr>
                    
                    <?php foreach($results as $row): ?>
                        <tr>
                            <?php foreach($row as $value): ?>
                                <td><?php echo htmlspecialchars($value); ?></td>
                            <?php endforeach; ?>
                        </tr>
                    <?php endforeach; ?>
                </table>
            <?php endif; ?>
        </div>
    </div>
</body>
</html>

<?php
// Close the database connection
$conn->close();
?> 