#!/bin/bash

# Write the flag to a hidden file
mkdir /home/challengeuser/inhere && \
touch /home/challengeuser/inhere/'...Hiding-From-You' && \
echo $FLAG > /home/challengeuser/inhere/'...Hiding-From-You'

# Prevent use of debuggers to pull env value (hopefully)
unset FLAG

./.cleanup.sh
