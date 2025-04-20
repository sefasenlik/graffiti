# Deploying Graffiti Wall App with Docker

This guide explains how to deploy the Collaborative Graffiti Wall application on an Ubuntu server using Docker.

## Prerequisites

- Ubuntu server (18.04 LTS or newer)
- Docker and Docker Compose installed
- Git installed (to clone the repository)

## Installing Docker on Ubuntu

If you don't have Docker installed on your Ubuntu server, you can install it with these commands:

```bash
# Update package index
sudo apt update

# Install required packages
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -

# Add Docker repository
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"

# Update package index again
sudo apt update

# Install Docker
sudo apt install -y docker-ce

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.18.1/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Add your user to the docker group to run Docker without sudo
sudo usermod -aG docker $USER

# Apply the group changes (or you can log out and back in)
newgrp docker
```

## Deployment Steps

1. Clone your repository on the server:

```bash
git clone <your-repository-url>
cd graffiti
```

2. Build and start the Docker containers:

```bash
docker-compose up -d
```

This will:
- Build the Docker image for your application
- Start the container in detached mode
- Map port 3000 from the container to port 3001 on your host
- Create a persistent volume for your data

3. Your application should now be running at `http://your-server-ip:3001`

## Customizing the Port

The application is configured to run on port 3001 on your host machine, which maps to port 3000 inside the container. If you need to use a different port:

1. Modify the `docker-compose.yml` file to change the port mapping:

```yaml
ports:
  - "YOUR_DESIRED_PORT:3000"
```

For example, to use port 8080:

```yaml
ports:
  - "8080:3000"
```

2. If you're using a reverse proxy, update your proxy configuration to point to the new port.

## Managing Your Application

- View logs:
```bash
docker-compose logs -f
```

- Stop the application:
```bash
docker-compose down
```

- Restart the application:
```bash
docker-compose restart
```

- Update after code changes:
```bash
git pull
docker-compose down
docker-compose up --build -d
```

## Using a Reverse Proxy (Optional)

For production use, it's recommended to set up Nginx as a reverse proxy to:
- Enable HTTPS with SSL/TLS certificates
- Handle multiple applications on the same server
- Improve security

Here's a basic Nginx configuration example:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

You can then use Certbot to add HTTPS support.

## Data Persistence

Your graffiti wall data is stored in a Docker volume named `graffiti-data`. This ensures your data persists even if the container is removed.

To back up this data:

```bash
# Create a backup directory
mkdir -p ~/graffiti-backups

# Backup the volume data
docker run --rm -v graffiti-data:/data -v ~/graffiti-backups:/backup alpine tar -czf /backup/graffiti-data-$(date +%Y%m%d).tar.gz /data
```

This creates a timestamped backup file in the ~/graffiti-backups directory.
