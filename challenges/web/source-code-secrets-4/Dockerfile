FROM nginx:alpine

# Set working directory
WORKDIR /usr/share/nginx/html

# Copy website files
COPY index.html .
COPY style.css .
COPY script.js .

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh

# Make entrypoint script executable
RUN chmod +x /entrypoint.sh

# Set environment variables
ENV FLAG="EDU-{m4st3r_0f_s0urc3_c0d3_s3cr3ts}"

# Expose port
EXPOSE 80

# Use entrypoint script to replace flag placeholder
ENTRYPOINT ["/entrypoint.sh"]

# Start nginx
CMD ["nginx", "-g", "daemon off;"] 