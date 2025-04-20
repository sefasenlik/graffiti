const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const socketIO = require('socket.io');
const wallManager = require('./wall-manager');
const setupSocketHandlers = require('./socket-handlers');
const db = require('./database');

// Initialize express app
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  maxHttpBufferSize: 5e6, // 5MB
  pingTimeout: 60000,     // 60 seconds
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Route for the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API endpoint to get a wall thumbnail
app.get('/api/wall/:wallId/thumbnail', async (req, res) => {
  try {
    const wallId = req.params.wallId;
    console.log(`Thumbnail requested for wall ${wallId}`);
    
    // Get the wall file path
    const wallsDir = path.join(__dirname, '../data/walls');
    const filename = `${wallId}.json`;
    const filepath = path.join(wallsDir, filename);
    
    // Check if file exists
    if (!fs.existsSync(filepath)) {
      console.error(`Wall file not found: ${filepath}`);
      return res.status(404).send('Wall not found');
    }
    
    // Read the file and extract only the thumbnail
    const data = await fs.promises.readFile(filepath, 'utf8');
    let thumbnailData = null;
    
    try {
      const wall = JSON.parse(data);
      thumbnailData = wall.thumbnail;
    } catch (err) {
      console.error(`Error parsing wall data for ${wallId}:`, err);
      return res.status(500).send('Error parsing wall data');
    }
    
    if (!thumbnailData) {
      return res.status(404).send('Thumbnail not available');
    }
    
    // Get the MIME type from the data URL
    let contentType = 'image/png';
    if (thumbnailData.startsWith('data:')) {
      const mimeMatch = thumbnailData.match(/^data:([^;]+);base64,/);
      if (mimeMatch) {
        contentType = mimeMatch[1];
        thumbnailData = thumbnailData.replace(/^data:[^;]+;base64,/, '');
      }
    }
    
    // Set the content type and send the image data
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    // Send the image data
    const buffer = Buffer.from(thumbnailData, 'base64');
    res.send(buffer);
  } catch (err) {
    console.error('Error serving thumbnail:', err);
    res.status(500).send('Error serving thumbnail');
  }
});

// Initialize socket handlers
setupSocketHandlers(io, wallManager, app);

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});