# SQL Injection Basic Challenge

A basic SQL injection challenge for the EDURange platform, designed to teach students about SQL injection vulnerabilities and how to exploit them.

## Challenge Overview

This challenge simulates a vulnerable web application with a login system connected to a MySQL database. The application is vulnerable to SQL injection attacks, which allows unauthenticated users to bypass authentication and access administrator content.

## Deployment

The challenge consists of two main components:
- A web application container running PHP/Apache
- A MySQL database container

The web application connects to the database using environment variables that are injected at runtime.

## Challenge Solution Guide

### Step 1: Understand the Vulnerability

The login form on the web application is vulnerable to SQL injection because it directly concatenates user input into an SQL query without proper sanitization or prepared statements.

### Step 2: Access the Challenge

1. Log in to the EDURange platform
2. Navigate to the SQL Injection challenge
3. Launch the challenge environment
4. Click the "Start Challenge" button to open the web application

### Step 3: Exploit the Login Form

1. In the login form, enter the following in the username field:
   ```
   admin' OR '1'='1
   ```

2. Enter anything (or nothing) in the password field

3. Click the "Login" button

### Step 4: Explanation of the Exploit

When you enter `admin' OR '1'='1` as the username, the resulting SQL query becomes:

```sql
SELECT * FROM users WHERE username = 'admin' OR '1'='1' AND password = 'whatever'
```

The expression `'1'='1'` is always true, which makes the entire WHERE clause evaluate to true regardless of the actual username or password. This causes the query to return all users, and the application logs in as the first user (typically admin).

### Step 5: Access Admin Account

After successful exploitation, you'll be logged in as the admin user without knowing the actual password.

### Step 6: Find the Flag

1. Once logged in as admin, navigate to the "Account Details" or "Profile" section
2. Look for sensitive information in the admin account
3. You should find the flag in the "Secrets" section with the format `EDU-{...}`

### Step 7: Complete the Challenge

1. Submit the flag in the challenge prompt
2. Answer the follow-up question about the SQL injection technique used

## Additional Challenge Variants

Students can try additional exploit techniques:
- `' OR 1=1 --` (an alternative syntax)
- `admin' --` to use SQL comments to bypass password checking (may not work in all configurations)
- `' UNION SELECT 1, 'admin', 'hacked', 'email@example.com', NOW() --` to create a union-based injection

## Defense Techniques

After completing the challenge, students should understand these countermeasures:

1. **Prepared Statements**: Separate SQL code from data to prevent injection
2. **Input Validation**: Validate and sanitize all user inputs
3. **Parameterized Queries**: Use database-specific parameter binding
4. **Least Privilege**: Use database accounts with minimal necessary permissions
5. **Error Handling**: Avoid exposing database errors to users

## Technology Stack

- PHP 7.4
- Apache Web Server
- MySQL 5.7/8.0
- HTML/CSS/JavaScript (frontend)

## Challenge Description

The challenge simulates a banking application with a vulnerable login form. The goal is to exploit an SQL injection vulnerability to bypass authentication and access sensitive information, including a flag stored in the database.

## Learning Objectives

- Understand how SQL injection vulnerabilities work
- Learn how to identify vulnerable input fields
- Practice basic SQL injection techniques for authentication bypass
- Learn how to extract sensitive data from databases using SQL injection
- Understand prevention techniques for SQL injection vulnerabilities

## Technical Details

This challenge consists of two main components:

1. **Web Application Container**: A PHP application with a vulnerable login form
2. **Database Container**: A MySQL database with user accounts and sensitive information

## Building the Challenge

To build the challenge locally for testing:

```bash
# Navigate to the challenge directory
cd challenges/sql-injection/sql-injection-basic

# Build the Docker image
docker build -t sql-injection-basic .
```

To push the image to the registry (requires access):

```bash
./build.sh
```

## Running the Challenge

The challenge will automatically configure both containers when deployed through the EDURange platform. The database will be initialized with sample data including user accounts and a flag.

## Solution

To solve the challenge, users need to:

1. Identify the SQL injection vulnerability in the login form
2. Use SQL injection techniques to bypass authentication
3. Access the admin account to view sensitive information
4. Find the flag in the admin's secrets

### Basic Solution (Authentication Bypass)

Enter the following in the username field:
```
admin' OR '1'='1
```

This will comment out the password check in the SQL query, allowing authentication as the admin user without knowing the password.

### Alternative Solution (Using UNION)

Enter the following in the username field:
```
' UNION SELECT 1, 'admin', 'password', 'admin@example.com', NOW() --
```

This creates a UNION query that returns a fabricated user record.

## Prevention

The about.php page in the challenge explains different prevention techniques:

- Using prepared statements
- Input validation and sanitization
- Parameterized queries
- ORM frameworks
- Principle of least privilege

## Common SQL Injection Payloads

- `' OR '1'='1' --` - Basic authentication bypass
- `' OR 1=1 --` - Another authentication bypass variant
- `admin' --` - Log in as a specific user
- `' UNION SELECT column1, column2... FROM table --` - Extract data using UNION
- `' OR sleep(5) --` - Time-based blind SQL injection

## Additional Resources

- [OWASP SQL Injection](https://owasp.org/www-community/attacks/SQL_Injection)
- [PortSwigger SQL Injection Tutorial](https://portswigger.net/web-security/sql-injection)
- [SQL Injection Cheat Sheet](https://www.invicti.com/blog/web-security/sql-injection-cheat-sheet/) 