#!/bin/sh

# Replace the flag placeholder in the JavaScript file
if [ -n "$FLAG" ]; then
    # Replace the flag in the script.js file
    sed -i "s/EDU-{m4st3r_0f_s0urc3_c0d3_s3cr3ts}/$FLAG/g" /usr/share/nginx/html/script.js
    echo "Flag has been set in the JavaScript file."
else
    echo "Warning: FLAG environment variable is not set. Using default flag."
fi

# Start the command provided as arguments (nginx)
exec "$@" 