-- Create users table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    password VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL
);

-- Insert sample users
INSERT INTO users (username, password, name, role) VALUES 
('admin', 'admin123', 'Administrator', 'admin'),
('john', 'password123', 'John Smith', 'user'),
('jane', 'secure456', 'Jane Doe', 'user'),
('guest', 'guest', 'Guest User', 'guest');

-- Create products table
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL
);

-- Insert sample products
INSERT INTO products (name, description, price) VALUES
('Laptop', 'High performance laptop with SSD', 999.99),
('Smartphone', 'Latest model with advanced camera', 699.99),
('Headphones', 'Noise cancelling wireless headphones', 249.99),
('Tablet', '10-inch tablet with long battery life', 399.99);

-- Create orders table
CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    total DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create flag table
CREATE TABLE flags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    flag_name VARCHAR(50) NOT NULL,
    flag_value VARCHAR(100) NOT NULL,
    description TEXT
);

-- Insert the hidden flag
INSERT INTO flags (flag_name, flag_value, description) VALUES
('challenge_flag', 'CTF{SQL_1nj3ct10n_M4st3r}', 'Congratulations on exploiting the SQL injection vulnerability!'); 