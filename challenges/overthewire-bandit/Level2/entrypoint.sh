#!/bin/bash

# Write the flag to a hidden file
echo $FLAG > /home/challengeuser/'spaces in this filename'

# Prevent use of debuggers to pull env value (hopefully)
unset FLAG

/home/challengeuser/.cleanup.sh
