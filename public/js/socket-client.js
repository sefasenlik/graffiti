/**
 * Socket Client Module
 * Handles real-time communication with the server
 */
const SocketClient = (function() {
    // Socket.io instance
    let socket = null;
    
    // Track current wall code
    let currentWallCode = null;
    
    // Track connection state
    let isConnected = false;
    
    // Track pending operations
    let pendingOperations = [];
    
    // Initialize socket connection and set up event handlers
    function init() {
      try {
        console.log('Initializing SocketClient...');
        
        // Create new socket connection with reconnection options
        socket = io({
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          timeout: 20000
        });
        
        // Set up UI event listeners
        UI.events.on('createWallRequested', createWall);
        UI.events.on('joinWallRequested', joinWall);
        UI.events.on('leaveWallRequested', leaveWall);
        UI.events.on('saveWallRequested', saveWall);
        UI.events.on('getSavedWallsRequested', getSavedWalls);
        UI.events.on('getSavedWallRequested', getSavedWall);
        UI.events.on('requestLoadWall', requestLoadWallData); 
        
        // Set up Canvas event listeners
        Canvas.events.on('lineDraw', sendDrawingData);
        Canvas.events.on('canvasCleared', sendClearCanvas);
        
        // Set up socket event listeners
        setupSocketEvents();
        
        console.log('SocketClient initialized successfully');
      } catch (err) {
        console.error('Error initializing SocketClient:', err);
      }
    }
    
    // Set up socket event handlers
    function setupSocketEvents() {
      // Handle connection events
      socket.on('connect', () => {
        console.log('Connected to server');
        isConnected = true;
        
        // Process any pending operations
        processPendingOperations();
      });
      
      socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        isConnected = false;
      });
      
      socket.on('disconnect', () => {
        console.log('Disconnected from server');
        isConnected = false;
        
        UI.showNotification('error', 'Disconnected', 'Lost connection to the server');
        
        // Return to welcome screen if we were in a wall
        if (currentWallCode) {
          UI.showWelcomeScreen();
          currentWallCode = null;
        }
      });
      
      socket.on('reconnect', (attemptNumber) => {
        console.log(`Reconnected to server after ${attemptNumber} attempts`);
        isConnected = true;
        UI.showNotification('success', 'Reconnected', 'Connection to the server restored');
      });
      
      socket.on('reconnect_failed', () => {
        console.log('Failed to reconnect to server');
        UI.showNotification('error', 'Connection Failed', 'Could not reconnect to the server');
      });
      
      // Handle drawing events
      socket.on('draw-line', (data) => {
        try {
          Canvas.drawExternalLine(data);
        } catch (err) {
          console.error('Error drawing external line:', err);
        }
      });
      
      // Handle user events
      socket.on('user-joined', (data) => {
        UI.updateUsersCount(data.userCount);
        UI.showNotification('info', 'User Joined', `${data.username} joined the wall`);
      });
      
      socket.on('user-left', (data) => {
        UI.updateUsersCount(data.userCount);
        UI.showNotification('info', 'User Left', `${data.username} left the wall`);
      });
      
      // Handle clear canvas event
      socket.on('clear-canvas', () => {
        Canvas.clearCanvas();
        UI.showNotification('info', 'Canvas Cleared', 'The canvas was cleared');
      });
      
      // Handle wall saved event
      socket.on('wall-saved', (data) => {
        UI.events.emit('wallSaved', data);
      });
      
      // Handle receiving loaded wall data
      socket.on('load-wall-data', (data) => {
        console.log('SocketClient: Received load-wall-data event', data);
        console.log('SocketClient: Data structure:', {
          hasData: !!data,
          success: data?.success,
          hasWall: !!data?.wall,
          wallCode: data?.wall?.code,
          hasStrokes: !!data?.wall?.strokes,
          strokesLength: data?.wall?.strokes?.length || 0,
          firstStroke: data?.wall?.strokes?.[0] ? 'Present' : 'None'
        });
        
        if (data && data.success && data.wall && data.wall.strokes) {
          console.log(`SocketClient: Processing wall ${data.wall.code} with ${data.wall.strokes.length} strokes`);
          
          // We need the wall code to "join" it visually
          currentWallCode = data.wall.code;
          console.log(`SocketClient: Set currentWallCode to ${currentWallCode}`);
          
          // Call Canvas to draw the strokes
          console.log('SocketClient: Calling Canvas.loadWallData with strokes');
          Canvas.loadWallData(data.wall.strokes);
          
          // Switch to the canvas screen
          console.log(`SocketClient: Showing canvas screen for wall ${data.wall.code}`);
          UI.showCanvasScreen(data.wall.code, data.userCount || 1); // Pass wall code and user count
          UI.showNotification('success', 'Wall Loaded', `Loaded wall ${data.wall.code}`);
        } else {
          console.error('SocketClient: Error loading wall data', data?.error);
          UI.showNotification('error', 'Load Failed', `Failed to load wall: ${data?.error || 'Unknown error'}`);
        }
      });
    }
    
    // Process any pending operations when connection is restored
    function processPendingOperations() {
      if (pendingOperations.length > 0) {
        console.log(`Processing ${pendingOperations.length} pending operations`);
        
        // Process each pending operation
        pendingOperations.forEach(op => {
          try {
            if (op.type === 'create-wall') {
              createWall(op.data);
            } else if (op.type === 'join-wall') {
              joinWall(op.data);
            } else if (op.type === 'save-wall') {
              saveWall(op.data);
            }
          } catch (err) {
            console.error(`Error processing pending operation ${op.type}:`, err);
          }
        });
        
        // Clear pending operations
        pendingOperations = [];
      }
    }
    
    // Create a new wall
    function createWall(data) {
      if (!isConnected) {
        console.log('Not connected, queueing create-wall operation');
        pendingOperations.push({ type: 'create-wall', data });
        UI.showNotification('warning', 'Not Connected', 'Will create wall when connection is restored');
        return;
      }
      
      console.log('Creating new wall...');
      
      // First, leave current wall if any
      if (currentWallCode) {
        console.log(`Leaving current wall ${currentWallCode} before creating new one`);
        leaveCurrentWall();
      }
      
      // Reset canvas
      Canvas.clearCanvas();
      
      // Create new wall
      socket.emit('create-wall', { username: data.username }, (response) => {
        if (response && response.success) {
          currentWallCode = response.wallCode;
          console.log(`Successfully created wall ${currentWallCode}`);
          
          UI.showCanvasScreen(response.wallCode);
          UI.showNotification('success', 'Wall Created', `Your wall code is ${response.wallCode}`);
          UI.updateUsersCount(1); // Start with 1 user (self)
        } else {
          console.error('Failed to create wall:', response?.error || 'Unknown error');
          UI.showNotification('error', 'Error', response?.error || 'Failed to create wall');
        }
      });
    }
    
    // Helper function to leave current wall
    function leaveCurrentWall() {
      if (currentWallCode && isConnected) {
        socket.emit('leave-wall', { wallCode: currentWallCode });
        currentWallCode = null;
      }
    }
    
    // Join an existing wall
    function joinWall(data) {
      if (!isConnected) {
        console.log('Not connected, queueing join-wall operation');
        pendingOperations.push({ type: 'join-wall', data });
        UI.showNotification('warning', 'Not Connected', 'Will join wall when connection is restored');
        return;
      }
      
      console.log(`Joining wall ${data.wallCode}...`);
      
      // First, leave current wall if any
      if (currentWallCode) {
        console.log(`Leaving current wall ${currentWallCode} before joining ${data.wallCode}`);
        leaveCurrentWall();
      }
      
      // Reset canvas
      Canvas.clearCanvas();
      
      // Join wall
      socket.emit('join-wall', { 
        wallCode: data.wallCode,
        username: data.username
      }, (response) => {
        if (response && response.success) {
          currentWallCode = response.wallCode;
          console.log(`Successfully joined wall ${currentWallCode}`);
          
          UI.showCanvasScreen(response.wallCode);
          UI.showNotification('success', 'Wall Joined', `You joined wall ${response.wallCode}`);
          
          // Load existing strokes
          if (response.strokes && response.strokes.length) {
            console.log(`Loading ${response.strokes.length} existing strokes`);
            Canvas.loadHistory(response.strokes);
          }
        } else {
          console.error('Failed to join wall:', response?.error || 'Unknown error');
          UI.showNotification('error', 'Error', response?.error || 'Failed to join wall');
        }
      });
    }
    
    // Leave the current wall
    function leaveWall() {
      console.log('Leaving wall...');
      
      // Explicitly leave the wall
      leaveCurrentWall();
      
      // Reset state and UI
      currentWallCode = null;
      UI.showWelcomeScreen();
    }
    
    // Send drawing data to server
    function sendDrawingData(data) {
      if (!currentWallCode || !isConnected) return;
      
      try {
        // Add user info to drawing data
        const drawingData = {
          ...data,
          username: UI.getUsername()
        };
        
        socket.emit('draw-line', drawingData);
      } catch (err) {
        console.error('Error sending drawing data:', err);
      }
    }
    
    // Send clear canvas event to server
    function sendClearCanvas() {
      if (!currentWallCode || !isConnected) return;
      
      try {
        socket.emit('clear-canvas');
      } catch (err) {
        console.error('Error sending clear canvas event:', err);
      }
    }
    
    // Save wall to database
    function saveWall(data) {
      if (!currentWallCode) {
        UI.showNotification('error', 'Error', 'No active wall to save');
        return;
      }
      
      if (!isConnected) {
        console.log('Not connected, queueing save-wall operation');
        pendingOperations.push({ type: 'save-wall', data });
        UI.showNotification('warning', 'Not Connected', 'Will save wall when connection is restored');
        return;
      }
      
      console.log(`Saving wall ${currentWallCode}...`);
      UI.showNotification('info', 'Saving', 'Saving your wall...');
      
      try {
        // Process thumbnail to reduce size
        let processedThumbnail = null;
        
        if (data.thumbnailData) {
          // Reduce quality and size of thumbnail
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const img = new Image();
          
          img.onload = function() {
            // Resize to smaller dimensions
            const maxDimension = 800;
            let width = img.width;
            let height = img.height;
            
            if (width > height && width > maxDimension) {
              height = height * (maxDimension / width);
              width = maxDimension;
            } else if (height > maxDimension) {
              width = width * (maxDimension / height);
              height = maxDimension;
            }
            
            canvas.width = width;
            canvas.height = height;
            
            // Draw and get reduced quality image
            ctx.drawImage(img, 0, 0, width, height);
            processedThumbnail = canvas.toDataURL('image/jpeg', 0.6); // Use JPEG with 60% quality
            
            // Now send the save request with processed thumbnail
            sendSaveRequest(processedThumbnail);
          };
          
          img.onerror = function() {
            console.error('Error processing thumbnail');
            // Send without processing if there's an error
            sendSaveRequest(data.thumbnailData);
          };
          
          img.src = data.thumbnailData;
        } else {
          // No thumbnail to process
          sendSaveRequest(null);
        }
      } catch (err) {
        console.error('Error preparing wall save:', err);
        UI.showNotification('error', 'Error', 'Failed to prepare wall for saving');
      }
    }
    
    // Helper function to send the actual save request
    function sendSaveRequest(thumbnailData) {
      socket.emit('save-wall', { thumbnailData }, (response) => {
        if (response && response.success) {
          console.log(`Wall ${currentWallCode} saved successfully with ID ${response.wallId}`);
          // Success notification will be shown by the 'wall-saved' event handler
        } else {
          console.error('Failed to save wall:', response?.error || 'Unknown error');
          UI.showNotification('error', 'Error', response?.error || 'Failed to save wall');
        }
      });
    }
    
    // Get saved walls from database
    function getSavedWalls(data, callback) {
      console.log('SocketClient: getSavedWalls called');
      // Ensure callback is a function
      const safeCallback = typeof callback === 'function' ? callback : () => {};
      console.log('SocketClient: Callback is a function:', typeof callback === 'function');
      
      if (!isConnected) {
        console.log('SocketClient: Not connected, cannot get saved walls');
        safeCallback({ success: false, error: 'Not connected to server' });
        return;
      }
      
      console.log('SocketClient: Connected, getting saved walls...');
      
      // Add a direct HTTP fetch as a fallback
      // This will help us determine if it's a socket issue or a server issue
      try {
        // Start timeout to detect hung socket calls
        const timeoutId = setTimeout(() => {
          console.warn('SocketClient: Socket get-saved-walls timed out after 5 seconds, trying HTTP fallback');
          // Try HTTP fallback
          fetch('/api/saved-walls')
            .then(response => response.json())
            .then(data => {
              console.log('SocketClient: HTTP fallback response:', data);
              if (data && data.success) {
                safeCallback(data);
              } else {
                console.error('SocketClient: HTTP fallback failed');
                safeCallback({ success: true, walls: [], error: 'Failed via both socket and HTTP' });
              }
            })
            .catch(error => {
              console.error('SocketClient: HTTP fallback error:', error);
              safeCallback({ success: true, walls: [], error: 'Failed via both socket and HTTP' });
            });
        }, 5000);
        
        console.log('SocketClient: Emitting get-saved-walls event');
        socket.emit('get-saved-walls', (response) => {
          clearTimeout(timeoutId); // Clear the timeout if socket succeeds
          
          console.log('SocketClient: Received socket response for get-saved-walls');
          
          if (response && response.success) {
            console.log(`SocketClient: Retrieved ${response.walls?.length || 0} saved walls via socket`);
          } else {
            console.error('SocketClient: Failed to get saved walls via socket:', response?.error || 'Unknown error');
          }
          
          console.log('SocketClient: Calling callback with response');
          safeCallback(response || { success: true, walls: [], error: 'No response from server' });
        });
      } catch (err) {
        console.error('SocketClient: Error in getSavedWalls:', err);
        safeCallback({ success: true, walls: [], error: 'Error getting saved walls' });
      }
    }
    
    // Get a specific saved wall from database
    function getSavedWall(data, callback) {
      // Ensure callback is a function
      const safeCallback = typeof callback === 'function' ? callback : () => {};
      
      if (!isConnected) {
        console.log('Not connected, cannot get saved wall');
        safeCallback({ success: false, error: 'Not connected to server' });
        return;
      }
      
      console.log(`Getting saved wall ${data.wallId}...`);
      
      try {
        socket.emit('get-saved-wall', { wallId: data.wallId }, (response) => {
          if (response && response.success) {
            console.log(`Retrieved saved wall ${data.wallId}`);
          } else {
            console.error('Failed to get saved wall:', response?.error || 'Unknown error');
          }
          safeCallback(response || { success: false, error: 'No response from server' });
        });
      } catch (err) {
        console.error('Error getting saved wall:', err);
        safeCallback({ success: false, error: 'Error getting saved wall' });
      }
    }
    
    // Request to load a specific wall's data
    function requestLoadWallData(wallId) {
      if (!isConnected) {
        console.error('SocketClient: Not connected, cannot request wall load');
        UI.showNotification('error', 'Connection Error', 'Cannot load wall, not connected.');
        return;
      }
      if (!socket) {
        console.error('SocketClient: Socket not initialized.');
        return;
      }
      
      console.log(`SocketClient: Emitting request-load-wall for wall ID: ${wallId}`);
      socket.emit('request-load-wall', { wallId }, (response) => {
        // The server might send an immediate ack/nack here, separate from the main data load
        if (!response || !response.success) {
          console.error('SocketClient: Server immediately rejected request-load-wall:', response?.error);
          UI.showNotification('error', 'Load Error', `Server rejected request: ${response?.error || 'Unknown error'}`);
        } else {
          console.log('SocketClient: Server acknowledged request-load-wall.');
          // We wait for the separate 'load-wall-data' event for the actual data
        }
      });
    }

    // Public API
    return {
      init,
      isConnected: () => isConnected,
      getCurrentWall: () => currentWallCode
    };
  })();
  
  // Initialize SocketClient when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing SocketClient...');
    SocketClient.init();
  });