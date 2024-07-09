#!/bin/bash

# Write the flag to a hidden file
echo $FLAG > /home/challengeuser/-

# Prevent use of debuggers to pull env value (hopefully)
unset FLAG

./.cleanup.sh
