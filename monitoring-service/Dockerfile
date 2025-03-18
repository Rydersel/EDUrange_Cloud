# docker buildx build --platform linux/amd64 -t registry.rydersel.cloud/monitoring-service . --push
FROM python:3.9-slim

WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ .

# Expose ports for the Flask API and Prometheus metrics
EXPOSE 5000
EXPOSE 9100

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV FLASK_APP=app.py

# Run the application with gunicorn (setting to more then one worker causes them to compete for same bind causing an [Errno 98])
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "4", "app:app"]

