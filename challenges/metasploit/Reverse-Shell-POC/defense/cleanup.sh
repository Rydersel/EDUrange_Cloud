#!/bin/bash

# No need to delete the original script since it's in a writable directory
# Optionally: clear sensitive content from the entrypoint script for extra security
if [ -f /tmp/scripts/entrypoint.sh ]; then
  echo "#!/bin/bash" > /tmp/scripts/entrypoint.sh
  echo "echo 'Script cleaned for security'" >> /tmp/scripts/entrypoint.sh
  echo "# Original content removed" >> /tmp/scripts/entrypoint.sh
  chmod 644 /tmp/scripts/entrypoint.sh
  echo "Cleaned entrypoint.sh for security"
fi

# Keep the container running
tail -f /dev/null
