# docker buildx build --platform linux/amd64 -t registry.rydersel.cloud/bridge  . --push

FROM python:3.9-slim

# Install dependencies
RUN apt-get update && apt-get install -y \
    libffi-dev \
    libssl-dev \
    gcc \
    libc-dev \
    make \
    && apt-get clean

# Copy application files
COPY requirements.txt /app/requirements.txt

# Install Python packages
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy the application code
COPY . /app

WORKDIR /app

# Run the application
CMD ["gunicorn", "-b", "0.0.0.0:5000", "app:app", "--worker-class", "eventlet", "--workers", "1"]
