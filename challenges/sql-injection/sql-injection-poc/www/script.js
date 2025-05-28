// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add event listener to the login form if it exists
    const loginForm = document.querySelector('.login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', function(event) {
            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value.trim();
            
            // Basic validation
            if (!username || !password) {
                event.preventDefault();
                alert('Please enter both username and password');
            }
        });
    }
    
    // Add a subtle hint about SQL injection when clicking on the hint text
    const hintElement = document.querySelector('.hint');
    if (hintElement) {
        hintElement.addEventListener('click', function() {
            const hints = [
                "Try using quotation marks to escape the SQL query...",
                "What happens if you input: admin' --",
                "SQL injection allows you to manipulate the underlying query"
            ];
            
            // Display a random hint
            const randomHint = hints[Math.floor(Math.random() * hints.length)];
            
            // Create or update hint tooltip
            let tooltip = document.getElementById('sql-hint-tooltip');
            if (!tooltip) {
                tooltip = document.createElement('div');
                tooltip.id = 'sql-hint-tooltip';
                tooltip.style.backgroundColor = '#004d99';
                tooltip.style.color = 'white';
                tooltip.style.padding = '10px';
                tooltip.style.borderRadius = '4px';
                tooltip.style.marginTop = '10px';
                tooltip.style.fontSize = '0.9rem';
                hintElement.appendChild(tooltip);
            }
            
            tooltip.textContent = randomHint;
            
            // Hide the tooltip after 5 seconds
            setTimeout(function() {
                tooltip.style.display = 'none';
            }, 5000);
            
            // Show the tooltip
            tooltip.style.display = 'block';
        });
    }
}); 