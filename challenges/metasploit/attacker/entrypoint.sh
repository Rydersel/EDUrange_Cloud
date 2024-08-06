#!/bin/bash

# Start a simple HTTP server to keep the container running
python3 -m http.server 8080 &

# Keep the container running
tail -f /dev/null
