FROM nginx:alpine

# Install necessary tools
RUN apk add --no-cache bash

# Set working directory
WORKDIR /usr/share/nginx/html

# Configure nginx to run on port 8080 and without root
RUN sed -i 's/listen\s*80;/listen 8080;/g' /etc/nginx/conf.d/default.conf && \
    sed -i 's/user\s*nginx;/#user nginx;/g' /etc/nginx/nginx.conf && \
    sed -i 's/pid\s*\/var\/run\/nginx.pid;/pid \/tmp\/nginx.pid;/g' /etc/nginx/nginx.conf

# Create and set proper permissions for nginx directories
RUN mkdir -p /var/cache/nginx/client_temp \
    /var/cache/nginx/proxy_temp \
    /var/cache/nginx/fastcgi_temp \
    /var/cache/nginx/uwsgi_temp \
    /var/cache/nginx/scgi_temp \
    /tmp \
    && chown -R 1000:1000 /usr/share/nginx/html /var/cache/nginx /var/log/nginx /etc/nginx/conf.d /tmp

# Copy website files
COPY index.html .
COPY style.css .
COPY script.js .

# Set permissions for web files
RUN chmod -R 755 /usr/share/nginx/html

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose port 8080 (instead of 80)
EXPOSE 8080

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]

# Start nginx
CMD ["nginx", "-g", "daemon off;"] 