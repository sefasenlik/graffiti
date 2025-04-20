/**
 * Set up socket event handlers
 * @param {Object} io - Socket.IO server instance
 * @param {Object} wallManager - Wall manager module
 * @param {Object} app - Express app instance
 */
function setupSocketHandlers(io, wallManager, app) {
  // Set up HTTP routes for saved walls
  setupHttpRoutes(app, wallManager);

  // Track which wall each socket is connected to
  const socketToWall = new Map();

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    
    // This socket isn't connected to any wall yet
    
    // Create a new wall
    socket.on('create-wall', ({ username }, callback) => {
      try {
        // Leave current wall if any
        const currentWall = socketToWall.get(socket.id);
        if (currentWall) {
          console.log(`User ${socket.id} leaving wall ${currentWall} to create a new one`);
          socket.leave(currentWall);
          wallManager.removeUserFromWall(currentWall, socket.id);
        }
        
        // Create a new wall
        const wall = wallManager.createWall();
        const newWallCode = wall.code;
        console.log(`User ${socket.id} created new wall ${newWallCode}`);
        
        // Store the wall code for this socket
        socketToWall.set(socket.id, newWallCode);
        
        // Join socket room for this wall
        socket.join(newWallCode);
        
        // Add user to wall
        wallManager.addUserToWall(newWallCode, socket.id, username);
        
        // Send wall info back to client
        callback({
          success: true,
          wallCode: newWallCode
        });
        
        // Notify room that user joined
        io.to(newWallCode).emit('user-joined', {
          userId: socket.id,
          username,
          userCount: wall.users.size
        });
      } catch (err) {
        console.error('Error creating wall:', err);
        callback({ success: false, error: 'Server error creating wall' });
      }
    });
    
    // Join existing wall
    socket.on('join-wall', ({ wallCode, username }, callback) => {
      try {
        const sanitizedWallCode = wallCode.trim().toUpperCase();
        const wall = wallManager.getWall(sanitizedWallCode);
        
        if (!wall) {
          return callback({
            success: false,
            error: 'Wall not found'
          });
        }
        
        // Leave current wall if any
        const currentWall = socketToWall.get(socket.id);
        if (currentWall && currentWall !== sanitizedWallCode) {
          console.log(`User ${socket.id} leaving wall ${currentWall} to join ${sanitizedWallCode}`);
          socket.leave(currentWall);
          wallManager.removeUserFromWall(currentWall, socket.id);
        }
        
        // Store the wall code for this socket
        socketToWall.set(socket.id, sanitizedWallCode);
        console.log(`User ${socket.id} joined wall ${sanitizedWallCode}`);
        
        // Join socket room for this wall
        socket.join(sanitizedWallCode);
        
        // Add user to wall
        wallManager.addUserToWall(sanitizedWallCode, socket.id, username);
        
        // Send wall info and history back to client
        callback({
          success: true,
          wallCode: sanitizedWallCode,
          strokes: wall.strokes
        });
        
        // Notify room that user joined
        io.to(sanitizedWallCode).emit('user-joined', {
          userId: socket.id,
          username,
          userCount: wall.users.size
        });
      } catch (err) {
        console.error('Error joining wall:', err);
        callback({ success: false, error: 'Server error joining wall' });
      }
    });
    
    // Handle drawing events
    socket.on('draw-line', (data) => {
      // Get wall code from the map
      const wallCode = socketToWall.get(socket.id);
      if (!wallCode) return;
      
      // Add stroke to wall history
      wallManager.addStrokeToWall(wallCode, data);
      
      // Broadcast to all other clients in the room
      socket.to(wallCode).emit('draw-line', data);
    });
    
    // Handle user leaving
    socket.on('disconnect', () => {
      try {
        console.log(`User disconnected: ${socket.id}`);
        
        // Get wall code from the map
        const wallCode = socketToWall.get(socket.id);
        if (!wallCode) {
          console.log(`User ${socket.id} was not in any wall`);
          return;
        }
        
        console.log(`User ${socket.id} disconnected from wall ${wallCode}`);
        
        const wall = wallManager.getWall(wallCode);
        if (!wall) {
          console.log(`Wall ${wallCode} not found for disconnecting user ${socket.id}`);
          socketToWall.delete(socket.id);
          return;
        }
        
        const user = wall.users.get(socket.id);
        
        // Remove user from wall
        wallManager.removeUserFromWall(wallCode, socket.id);
        
        // Remove from socket-wall mapping
        socketToWall.delete(socket.id);
        
        // Notify room that user left (only if we had user data)
        if (user) {
          io.to(wallCode).emit('user-left', {
            userId: socket.id,
            username: user.username,
            userCount: wall.users.size
          });
        }
      } catch (err) {
        console.error('Error handling disconnect:', err);
      }
    });
    
    // Handle clear canvas event
    socket.on('clear-canvas', () => {
      // Get wall code from the map
      const wallCode = socketToWall.get(socket.id);
      if (!wallCode) return;
      
      const wall = wallManager.getWall(wallCode);
      if (!wall) return;
      
      // Clear strokes from wall history
      wall.strokes = [];
      
      // Broadcast to all clients in the room
      io.to(wallCode).emit('clear-canvas');
    });
    
    // Handle save wall event
    socket.on('save-wall', async ({ thumbnailData }, callback) => {
      try {
        // Get wall code from the map
        const wallCode = socketToWall.get(socket.id);
        if (!wallCode) {
          console.log(`User ${socket.id} tried to save wall but is not in any wall`);
          return callback({ success: false, error: 'No active wall' });
        }
        
        console.log(`User ${socket.id} saving wall ${wallCode}`);
        
        // Process thumbnail data to reduce size
        let processedThumbnail = null;
        if (thumbnailData) {
          // Remove data URL prefix and limit size
          processedThumbnail = thumbnailData.replace(/^data:image\/\w+;base64,/, '');
          if (processedThumbnail.length > 100000) {
            processedThumbnail = processedThumbnail.substring(0, 100000);
          }
        }
        
        // Save wall with processed thumbnail
        const savedWall = await wallManager.saveWallToDatabase(wallCode, processedThumbnail);
        
        if (savedWall) {
          console.log(`Wall ${wallCode} saved successfully with ID ${savedWall.id}`);
          
          // Notify all users in the room that the wall was saved
          io.to(wallCode).emit('wall-saved', {
            id: savedWall.id,
            savedAt: savedWall.savedAt
          });
          
          callback({ success: true, wallId: savedWall.id });
        } else {
          console.log(`Failed to save wall ${wallCode}`);
          callback({ success: false, error: 'Failed to save wall' });
        }
      } catch (err) {
        console.error('Error saving wall:', err);
        callback({ success: false, error: 'Server error saving wall' });
      }
    });
    
    // Handle get saved walls event
    socket.on('get-saved-walls', async (callback) => {
      try {
        console.log(`User ${socket.id} requested saved walls`);
        
        // Add a timeout to prevent hanging
        const timeoutPromise = new Promise((resolve) => {
          setTimeout(() => {
            resolve({ timedOut: true, walls: [] });
          }, 5000); // 5 second timeout
        });
        
        // Race between actual data and timeout
        const savedWallsPromise = wallManager.getSavedWalls();
        const result = await Promise.race([savedWallsPromise, timeoutPromise]);
        
        if (result.timedOut) {
          console.warn('Getting saved walls timed out, returning empty list');
          callback({ success: true, walls: [], warning: 'Timed out, showing partial results' });
          return;
        }
        
        console.log(`Returning ${result.length} saved walls to user ${socket.id}`);
        callback({ success: true, walls: result });
      } catch (err) {
        console.error('Error getting saved walls:', err);
        // Return success with empty array rather than an error
        // This way UI will show empty state rather than error
        callback({ success: true, walls: [], error: 'Failed to load wall data' });
      }
    });
    
    // Handle get saved wall event
    socket.on('get-saved-wall', async ({ wallId }, callback) => {
      try {
        const savedWall = await wallManager.getSavedWall(wallId);
        
        if (savedWall) {
          callback({ success: true, wall: savedWall });
        } else {
          callback({ success: false, error: 'Wall not found' });
        }
      } catch (err) {
        console.error('Error getting saved wall:', err);
        callback({ success: false, error: 'Server error' });
      }
    });
    
    // Handle request to load a saved wall's data
    socket.on('request-load-wall', async ({ wallId }, callback) => {
      console.log(`Socket ${socket.id} requested to load wall ID: ${wallId}`);
      try {
        // Fetch the full wall data from the database
        console.log(`Requesting full wall data from database for ID: ${wallId}`);
        const wallData = await wallManager.getSavedWall(wallId, true); // true to get full data
        console.log(`Got response from database for wall ${wallId}:`, 
          wallData ? 
            `Found: ${!!wallData}, Has Error: ${!!wallData.error}, Has Strokes: ${!!(wallData.strokes && wallData.strokes.length)}, Strokes Count: ${wallData.strokes?.length || 0}` : 
            'null');
        
        if (!wallData) {
          console.error(`Wall data not found for ID: ${wallId}`);
          // Acknowledge the request failed immediately
          if (typeof callback === 'function') callback({ success: false, error: 'Wall not found' });
          return;
        }
        
        // Check if there was an error loading (e.g., too large)
        if (wallData.error) {
           console.error(`Error loading wall data for ${wallId}: ${wallData.error}`);
           if (typeof callback === 'function') callback({ success: false, error: wallData.error });
           return;
        }
        
        // Acknowledge the request was received successfully (optional)
        if (typeof callback === 'function') callback({ success: true });
        
        // Now send the actual wall data back to the requesting client ONLY
        console.log(`Sending wall data for ${wallData.code || wallId} back to socket ${socket.id}. Strokes count: ${wallData.strokes?.length || 0}`);
        
        // Create a response object with all necessary data
        const responseData = {
          success: true,
          wall: {
            id: wallData.id || wallId,
            code: wallData.code || wallId.split('_')[0], // Ensure code is present
            strokes: wallData.strokes || [], // Ensure strokes is an array
            savedAt: wallData.savedAt || new Date().toISOString()
          },
          userCount: 1 // When loading a saved wall, assume user count is 1 initially
        };
        
        console.log(`Response data prepared. Wall code: ${responseData.wall.code}, Strokes: ${responseData.wall.strokes.length}`);
        socket.emit('load-wall-data', responseData);
        console.log('load-wall-data event emitted to client');
        
        // --- Note on joining loaded walls (See previous explanation) --- 

      } catch (err) {
        console.error(`Error processing request-load-wall for ${wallId}:`, err);
        if (typeof callback === 'function') callback({ success: false, error: 'Server error loading wall' });
      }
    });
  }); // End of io.on('connection')
}

/**
 * Set up HTTP routes for saved walls
 * @param {Object} app - Express app instance
 * @param {Object} wallManager - Wall manager module
 */
function setupHttpRoutes(app, wallManager) {
  
  // API route to get all saved walls
  app.get('/api/saved-walls', async (req, res) => {
    try {
      const savedWalls = await wallManager.getSavedWalls();
      res.json({ success: true, walls: savedWalls });
    } catch (err) {
      console.error('Error getting saved walls:', err);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  });
  
  // API route to get a specific saved wall
  app.get('/api/saved-walls/:id', async (req, res) => {
    try {
      const savedWall = await wallManager.getSavedWall(req.params.id);
      
      if (savedWall) {
        res.json({ success: true, wall: savedWall });
      } else {
        res.status(404).json({ success: false, error: 'Wall not found' });
      }
    } catch (err) {
      console.error('Error getting saved wall:', err);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  });
}

module.exports = setupSocketHandlers;