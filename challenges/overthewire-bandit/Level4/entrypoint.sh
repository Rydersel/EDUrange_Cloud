#!/bin/bash

# Write the flag to a hidden file
mkdir /home/challengeuser/inhere && \

for i in {00..09}; do
    # Construct the filename
    filename="-file$i"
    # Create an empty file with the constructed filename
    base64 /dev/urandom | head -c 1000 > "./inhere/$filename"
done

echo $FLAG > /home/challengeuser/inhere/'-file07'

# Prevent use of debuggers to pull env value (hopefully)
unset FLAG

/home/challengeuser/.cleanup.sh
