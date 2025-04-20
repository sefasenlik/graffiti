const { v4: uuidv4 } = require('uuid');
const db = require('./database');

// In-memory storage for walls
const walls = new Map();

// Track saved walls
let savedWalls = [];

/**
 * Create a new wall with a unique code
 * @returns {Object} Wall object with code and users
 */
function createWall() {
  // Generate a 6-character alphanumeric code
  const generateWallCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };
  
  let wallCode = generateWallCode();
  // Ensure code is unique
  while (walls.has(wallCode)) {
    wallCode = generateWallCode();
  }
  
  const wall = {
    code: wallCode,
    users: new Map(),
    strokes: [],
    createdAt: new Date()
  };
  
  walls.set(wallCode, wall);
  console.log(`Wall created: ${wallCode}`);
  return wall;
}

/**
 * Get wall by code
 * @param {string} code - Wall code
 * @returns {Object|null} Wall object or null if not found
 */
function getWall(code) {
  return walls.has(code) ? walls.get(code) : null;
}

/**
 * Add user to a wall
 * @param {string} wallCode - Wall code
 * @param {string} userId - User ID
 * @param {string} username - User's display name
 * @returns {Object|null} Updated wall or null if wall not found
 */
function addUserToWall(wallCode, userId, username) {
  const wall = getWall(wallCode);
  if (!wall) return null;
  
  wall.users.set(userId, {
    id: userId,
    username,
    joinedAt: new Date()
  });
  
  return wall;
}

/**
 * Remove user from a wall
 * @param {string} wallCode - Wall code
 * @param {string} userId - User ID
 * @returns {Object|null} Updated wall or null if wall not found
 */
function removeUserFromWall(wallCode, userId) {
  const wall = getWall(wallCode);
  if (!wall) return null;
  
  wall.users.delete(userId);
  
  // If wall is empty, delete it after some time
  if (wall.users.size === 0) {
    setTimeout(() => {
      // Check again after timeout to be sure it's still empty
      const currentWall = getWall(wallCode);
      if (currentWall && currentWall.users.size === 0) {
        walls.delete(wallCode);
        console.log(`Empty wall deleted: ${wallCode}`);
      }
    }, 3600000); // Cleanup after 1 hour
  }
  
  return wall;
}

/**
 * Add stroke to wall history
 * @param {string} wallCode - Wall code
 * @param {Object} strokeData - Stroke data
 * @returns {Object|null} Updated wall or null if wall not found
 */
function addStrokeToWall(wallCode, strokeData) {
  const wall = getWall(wallCode);
  if (!wall) return null;
  
  // Store all strokes without limitation
  // This ensures new users see the complete wall history
  wall.strokes.push(strokeData);
  return wall;
}

/**
 * Get all active walls
 * @returns {Array} Array of wall codes and user counts
 */
function getActiveWalls() {
  const activeWalls = [];
  
  walls.forEach((wall, code) => {
    activeWalls.push({
      code,
      userCount: wall.users.size,
      createdAt: wall.createdAt
    });
  });
  
  return activeWalls;
}

/**
 * Save a wall to the database
 * @param {string} wallCode - Wall code
 * @param {string} thumbnailData - Base64 encoded thumbnail image
 * @returns {Promise<Object>} Saved wall data
 */
async function saveWallToDatabase(wallCode, thumbnailData) {
  console.log(`Saving wall ${wallCode} to database...`);
  const wall = getWall(wallCode);
  if (!wall) {
    console.error(`Wall ${wallCode} not found`);
    return null;
  }
  
  try {
    // Create a lightweight wall data object for saving
    // We'll do this in a memory-efficient way
    const wallDataForSaving = {
      code: wallCode,
      createdAt: wall.createdAt,
      // Process users in a memory-efficient way
      users: [],
      // We'll process strokes separately
      strokes: [],
      // Store thumbnail (already processed on client side)
      thumbnail: thumbnailData || null
    };
    
    // Process users - convert Map to array in a controlled way
    if (wall.users && wall.users instanceof Map) {
      console.log(`Processing ${wall.users.size} users for wall ${wallCode}`);
      // Take only the first 50 users to limit memory usage
      let count = 0;
      for (const [id, user] of wall.users.entries()) {
        if (count >= 50) break; // Limit to 50 users
        
        wallDataForSaving.users.push({
          id,
          username: user.username || 'Anonymous',
          joinedAt: user.joinedAt ? user.joinedAt.toISOString() : new Date().toISOString()
        });
        count++;
      }
    }
    
    // Process strokes - take only the most recent ones and simplify them
    if (Array.isArray(wall.strokes)) {
      console.log(`Processing ${wall.strokes.length} strokes for wall ${wallCode}`);
      // Take only the last 300 strokes to limit memory usage
      const MAX_STROKES = 300;
      const recentStrokes = wall.strokes.slice(-MAX_STROKES);
      
      // Process strokes in batches to avoid memory spikes
      const BATCH_SIZE = 20;
      for (let i = 0; i < recentStrokes.length; i += BATCH_SIZE) {
        const batch = recentStrokes.slice(i, i + BATCH_SIZE);
        
        // Process each stroke in the batch
        for (const stroke of batch) {
          // Create a simplified version of the stroke
          const simplifiedStroke = {
            color: stroke.color || '#000000',
            size: stroke.size || 5,
            opacity: stroke.opacity || 1,
            // Simplify points data
            points: []
          };
          
          // Process points data
          if (Array.isArray(stroke.points)) {
            // Take only a subset of points (max 50)
            const MAX_POINTS = 50;
            const pointsSubset = stroke.points.slice(0, MAX_POINTS);
            simplifiedStroke.points = pointsSubset;
          } else if (stroke.x1 !== undefined) {
            // Handle legacy format
            simplifiedStroke.points = [{ 
              x1: stroke.x1, 
              y1: stroke.y1, 
              x2: stroke.x2, 
              y2: stroke.y2 
            }];
          }
          
          // Add the simplified stroke to our data
          wallDataForSaving.strokes.push(simplifiedStroke);
        }
        
        // Add a small delay between batches to prevent blocking the event loop
        if (i + BATCH_SIZE < recentStrokes.length) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    }
    
    console.log(`Prepared wall data for ${wallCode}: ${wallDataForSaving.users.length} users, ${wallDataForSaving.strokes.length} strokes`);
    
    // Save to database
    const savedWall = await db.saveWall(wallCode, wallDataForSaving);
    
    // Update saved walls list without waiting
    refreshSavedWalls().catch(err => console.error('Error refreshing saved walls:', err));
    
    console.log(`Successfully saved wall ${wallCode} with ID ${savedWall.id}`);
    return savedWall;
  } catch (err) {
    console.error(`Error saving wall ${wallCode}:`, err);
    return null;
  }
}

/**
 * Get all saved walls from the database
 * @returns {Promise<Array>} Array of saved wall metadata
 */
async function getSavedWalls() {
  if (savedWalls.length === 0) {
    await refreshSavedWalls();
  }
  return savedWalls;
}

/**
 * Get a specific saved wall by ID
 * @param {string} wallId - Wall ID
 * @param {boolean} [getFullData=false] - Whether to return full data including strokes
 * @returns {Promise<Object|null>} Wall data or null if not found
 */
async function getSavedWall(wallId, getFullData = false) {
  try {
    return await db.getSavedWall(wallId, getFullData);
  } catch (err) {
    console.error(`Error getting saved wall ${wallId}:`, err);
    return null;
  }
}

/**
 * Refresh the saved walls list from the database
 * @private
 */
async function refreshSavedWalls() {
  try {
    savedWalls = await db.getSavedWalls();
  } catch (err) {
    console.error('Error refreshing saved walls:', err);
  }
}

// Initialize saved walls list
refreshSavedWalls().catch(console.error);

module.exports = {
  createWall,
  getWall,
  addUserToWall,
  removeUserFromWall,
  addStrokeToWall,
  getActiveWalls,
  saveWallToDatabase,
  getSavedWalls,
  getSavedWall
};