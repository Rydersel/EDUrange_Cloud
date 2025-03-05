// JavaScript for Web Challenge

// This function is called when the page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log("Web Challenge loaded successfully!");
    console.log("Looking for the flag? You're getting warmer...");
    console.log("But it's not in the console. Keep looking!");
    
    // Add event listener to the hints section
    const hintsSection = document.querySelector('.hints');
    if (hintsSection) {
        hintsSection.addEventListener('click', function() {
            console.log("Hint: Have you checked the HTML source code?");
        });
    }
});

/*
    Nice try looking in the JavaScript file!
    
    The flag isn't here, but you're on the right track.
    
    Remember to check all possible locations where developers
    might hide information.
    
    What about checking for files that search engines are told not to index?
*/ 