# Use Node.js LTS (Long Term Support) as the base image
FROM node:18-slim

# Set working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Create data directory if it doesn't exist
RUN mkdir -p data/walls

# Expose the port the app runs on
EXPOSE 3000

# Define environment variable
ENV NODE_ENV=production
ENV PORT=3000

# Command to run the application
CMD ["node", "server/server.js"]
