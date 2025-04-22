<?php
// Start the session at the very beginning before any output
session_start();
require_once 'config.php';

// Initialize variables
$error_message = '';
$success_message = '';
$debug_info = '';
$product = null;
$reviews = [];

// Get the product information
$conn = getDbConnection();
if ($conn) {
    try {
        $stmt = $conn->query("SELECT * FROM products WHERE id = 1");
        $product = $stmt->fetch(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {
        $error_message = "Error fetching product: " . $e->getMessage();
    }
}

// Get the visible reviews
if ($conn) {
    try {
        $stmt = $conn->query("SELECT * FROM reviews WHERE product_id = 1 AND hidden = 0 ORDER BY created_at DESC");
        $reviews = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {
        $error_message = "Error fetching reviews: " . $e->getMessage();
    }
}

// Process review submission
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['submit_review'])) {
    $reviewer_name = $_POST['reviewer_name'];
    $rating = $_POST['rating'];
    $review_text = $_POST['review_text'];
    
    if (empty($reviewer_name) || empty($review_text) || !is_numeric($rating)) {
        $error_message = "Please fill in all fields with valid information.";
    } else {
        $conn = getDbConnection();
        if ($conn) {
            try {
                // VULNERABLE QUERY - susceptible to SQL injection
                // This query is vulnerable to SQL injection in the reviewer_name field
                $query = "INSERT INTO reviews (product_id, reviewer_name, rating, review_text, hidden) 
                          VALUES (1, '$reviewer_name', $rating, '$review_text', 0)";
                
                // Debug info - only shown when debug_mode is enabled
                $debug_info = "Generated SQL: " . htmlspecialchars($query);
                
                $conn->exec($query);
                $success_message = "Thank you for your review!";
                
                // Refresh the reviews list
                $stmt = $conn->query("SELECT * FROM reviews WHERE product_id = 1 AND hidden = 0 ORDER BY created_at DESC");
                $reviews = $stmt->fetchAll(PDO::FETCH_ASSOC);
            } catch (PDOException $e) {
                // Show error message for educational purposes
                $error_message = "Error submitting review: " . $e->getMessage();
            }
        }
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UltraPhone X - Product Reviews</title>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Poppins', sans-serif;
        }
        
        body {
            background-color: #f8f9fa;
            color: #333;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 20px;
        }
        
        header {
            background-color: #2c3e50;
            color: white;
            padding: 1rem 0;
        }
        
        .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .logo {
            font-size: 1.8rem;
            font-weight: 700;
        }
        
        .logo span {
            color: #3498db;
        }
        
        main {
            padding: 2rem 0;
        }
        
        .product-container {
            display: flex;
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow: hidden;
            margin-bottom: 2rem;
        }
        
        .product-image {
            flex: 0 0 40%;
            background-color: #f1f1f1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
        }
        
        .product-image-placeholder {
            width: 100%;
            height: 300px;
            background-color: #e0e0e0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #666;
            font-size: 1.2rem;
            border-radius: 8px;
        }
        
        .product-details {
            flex: 0 0 60%;
            padding: 2rem;
        }
        
        .product-name {
            font-size: 2rem;
            color: #2c3e50;
            margin-bottom: 1rem;
        }
        
        .product-price {
            font-size: 1.5rem;
            color: #3498db;
            font-weight: 600;
            margin-bottom: 1rem;
        }
        
        .product-description {
            color: #666;
            margin-bottom: 1.5rem;
        }
        
        .review-form-container {
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            padding: 2rem;
            margin-bottom: 2rem;
        }
        
        .form-title {
            font-size: 1.5rem;
            color: #2c3e50;
            margin-bottom: 1.5rem;
        }
        
        .form-group {
            margin-bottom: 1.5rem;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 500;
            color: #333;
        }
        
        .form-control {
            width: 100%;
            padding: 0.8rem;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 1rem;
        }
        
        .form-control:focus {
            border-color: #3498db;
            outline: none;
        }
        
        .rating-container {
            display: flex;
            gap: 1rem;
        }
        
        .rating-option {
            display: flex;
            align-items: center;
        }
        
        .rating-option input {
            margin-right: 0.5rem;
        }
        
        .submit-btn {
            background-color: #3498db;
            color: white;
            border: none;
            padding: 0.8rem 1.5rem;
            border-radius: 4px;
            font-size: 1rem;
            cursor: pointer;
            transition: background-color 0.3s;
        }
        
        .submit-btn:hover {
            background-color: #2980b9;
        }
        
        .reviews-container {
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            padding: 2rem;
        }
        
        .reviews-title {
            font-size: 1.5rem;
            color: #2c3e50;
            margin-bottom: 1.5rem;
        }
        
        .review-card {
            border-bottom: 1px solid #eee;
            padding: 1.5rem 0;
        }
        
        .review-card:last-child {
            border-bottom: none;
        }
        
        .review-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 0.5rem;
        }
        
        .reviewer-name {
            font-weight: 600;
            color: #2c3e50;
        }
        
        .review-date {
            color: #999;
            font-size: 0.9rem;
        }
        
        .review-rating {
            margin-bottom: 0.5rem;
            color: #f39c12;
        }
        
        .review-text {
            color: #666;
        }
        
        .error-message {
            background-color: #f8d7da;
            color: #721c24;
            padding: 1rem;
            border-radius: 4px;
            margin-bottom: 1.5rem;
        }
        
        .success-message {
            background-color: #d4edda;
            color: #155724;
            padding: 1rem;
            border-radius: 4px;
            margin-bottom: 1.5rem;
        }
        
        .debug-info {
            background-color: #f8f9fa;
            border: 1px solid #ddd;
            padding: 1rem;
            border-radius: 4px;
            margin-bottom: 1.5rem;
            font-family: monospace;
            white-space: pre-wrap;
            color: #666;
        }
        
        .hint-box {
            background-color: #e3f2fd;
            border-left: 4px solid #2196f3;
            padding: 1rem;
            margin-top: 2rem;
            border-radius: 4px;
        }
        
        .hint-box h3 {
            color: #0d47a1;
            margin-bottom: 0.5rem;
        }
        
        .hint-box p {
            color: #555;
        }
        
        footer {
            background-color: #2c3e50;
            color: white;
            padding: 2rem 0;
            margin-top: 2rem;
        }
        
        .footer-content {
            display: flex;
            justify-content: space-between;
        }
        
        .footer-section {
            flex: 1;
            margin-right: 2rem;
        }
        
        .footer-section:last-child {
            margin-right: 0;
        }
        
        .footer-section h3 {
            margin-bottom: 1rem;
            font-size: 1.2rem;
        }
        
        .footer-section p {
            color: #bbb;
            font-size: 0.9rem;
        }
        
        .footer-bottom {
            text-align: center;
            margin-top: 2rem;
            padding-top: 1rem;
            border-top: 1px solid #3a546a;
            color: #bbb;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <header>
        <div class="container header-content">
            <div class="logo">Tech<span>Store</span></div>
        </div>
    </header>
    
    <div class="container">
        <main>
            <?php if (!empty($error_message)): ?>
            <div class="error-message">
                <?php echo $error_message; ?>
            </div>
            <?php endif; ?>
            
            <?php if (!empty($success_message)): ?>
            <div class="success-message">
                <?php echo $success_message; ?>
            </div>
            <?php endif; ?>
            
            <?php if (!empty($debug_info)): ?>
            <div class="debug-info">
                <strong>Debug Information:</strong>
                <?php echo $debug_info; ?>
            </div>
            <?php endif; ?>
            
            <?php if ($product): ?>
            <div class="product-container">
                <div class="product-image">
                    <div class="product-image-placeholder">
                        UltraPhone X Image
                    </div>
                </div>
                <div class="product-details">
                    <h1 class="product-name"><?php echo htmlspecialchars($product['name']); ?></h1>
                    <div class="product-price">$<?php echo htmlspecialchars($product['price']); ?></div>
                    <p class="product-description"><?php echo htmlspecialchars($product['description']); ?></p>
                </div>
            </div>
            <?php endif; ?>
            
            <div class="review-form-container">
                <h2 class="form-title">Write a Review</h2>
                <form method="POST" action="">
                    <div class="form-group">
                        <label for="reviewer_name">Your Name</label>
                        <input type="text" id="reviewer_name" name="reviewer_name" class="form-control" required>
                    </div>
                    
                    <div class="form-group">
                        <label>Rating</label>
                        <div class="rating-container">
                            <div class="rating-option">
                                <input type="radio" id="rating-1" name="rating" value="1" required>
                                <label for="rating-1">1 - Poor</label>
                            </div>
                            <div class="rating-option">
                                <input type="radio" id="rating-2" name="rating" value="2">
                                <label for="rating-2">2 - Fair</label>
                            </div>
                            <div class="rating-option">
                                <input type="radio" id="rating-3" name="rating" value="3">
                                <label for="rating-3">3 - Average</label>
                            </div>
                            <div class="rating-option">
                                <input type="radio" id="rating-4" name="rating" value="4">
                                <label for="rating-4">4 - Good</label>
                            </div>
                            <div class="rating-option">
                                <input type="radio" id="rating-5" name="rating" value="5" checked>
                                <label for="rating-5">5 - Excellent</label>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="review_text">Your Review</label>
                        <textarea id="review_text" name="review_text" class="form-control" rows="5" required></textarea>
                    </div>
                    
                    <button type="submit" name="submit_review" class="submit-btn">Submit Review</button>
                </form>
                
                <div class="hint-box">
                    <h3>Hint</h3>
                    <p>There might be hidden reviews in the database. Can you find a way to make them visible?</p>
                </div>
            </div>
            
            <div class="reviews-container">
                <h2 class="reviews-title">Customer Reviews</h2>
                
                <?php if (empty($reviews)): ?>
                <p>No reviews yet. Be the first to review this product!</p>
                <?php else: ?>
                    <?php foreach ($reviews as $review): ?>
                    <div class="review-card">
                        <div class="review-header">
                            <div class="reviewer-name"><?php echo htmlspecialchars($review['reviewer_name']); ?></div>
                            <div class="review-date"><?php echo htmlspecialchars($review['created_at']); ?></div>
                        </div>
                        <div class="review-rating">
                            <?php 
                            for ($i = 1; $i <= 5; $i++) {
                                echo ($i <= $review['rating']) ? "★" : "☆";
                            }
                            ?>
                        </div>
                        <div class="review-text"><?php echo htmlspecialchars($review['review_text']); ?></div>
                    </div>
                    <?php endforeach; ?>
                <?php endif; ?>
            </div>
        </main>
    </div>
    
    <footer>
        <div class="container">
            <div class="footer-content">
                <div class="footer-section">
                    <h3>About TechStore</h3>
                    <p>TechStore is your one-stop shop for all electronics and tech gadgets. We offer competitive prices and a wide selection of products.</p>
                </div>
                <div class="footer-section">
                    <h3>Contact Us</h3>
                    <p>Email: info@techstore.example<br>
                    Phone: (555) 123-4567<br>
                    Address: 123 Tech Street, Silicon Valley, CA</p>
                </div>
                <div class="footer-section">
                    <h3>Developer Notes</h3>
                    <p>This is a development version. Debug mode is enabled.<br>
                    Note: Need to fix the review submission form to prevent SQL injection.</p>
                </div>
            </div>
            <div class="footer-bottom">
                &copy; 2025 TechStore. All rights reserved. | <a href="#" style="color: #bbb;">Privacy Policy</a> | <a href="#" style="color: #bbb;">Terms of Service</a>
            </div>
        </div>
    </footer>
    
    <!-- Additional developer comments for hints -->
    <!-- 
        Database structure:
        - products: id, name, description, price, image_url
        - reviews: id, product_id, reviewer_name, rating, review_text, hidden, created_at
        
        There's a hidden admin review with the flag.
        
        Hint: Try using SQL injection to update the 'hidden' status of reviews.
        Example: Try something like: name', 0); UPDATE reviews SET hidden=0 WHERE reviewer_name='Admin'; --
    -->
</body>
</html>
