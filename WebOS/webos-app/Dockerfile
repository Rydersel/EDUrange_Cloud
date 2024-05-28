# Use an official Node.js runtime as a parent image
FROM node:14

# Set the working directory in the container
WORKDIR /app

# Copy the package.json and package-lock.json files
COPY package*.json ./

# Install any needed packages specified in package.json
RUN npm install

# Copy the rest of your application files
COPY . .

# Make port 3000 available to the world outside this container
EXPOSE 3000

# Run the app
CMD ["npm", "run", "dev"]
