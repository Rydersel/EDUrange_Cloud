# Use an official Ubuntu base image
FROM ubuntu:20.04

# Avoid prompts from apt
ARG DEBIAN_FRONTEND=noninteractive

# Install basic utilities and Python
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    sudo \
    vim \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /home/user


# Copy the local directory contents into the container
COPY . .

# Install any needed packages specified in requirements.txt
#COPY requirements.txt ./
#RUN pip3 install --no-cache-dir #-r requirements.txt

# Make port 80 available to the world outside this container
EXPOSE 80
CMD ["/bin/bash"]

# Define environment variable
ENV NAME CTFChallenge

# Run app.py when the container launches
#CMD ["python3", "main.py"]
