FROM nginx:alpine

# Install necessary tools
RUN apk add --no-cache bash

# Create directory for web content
RUN mkdir -p /usr/share/nginx/html

# Copy web files
COPY index.html /usr/share/nginx/html/
COPY style.css /usr/share/nginx/html/

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose port 80
EXPOSE 80

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]

# Start nginx
CMD ["nginx", "-g", "daemon off;"] 