/**
 * Database module for permanent storage of walls
 */
const fs = require('fs');
const path = require('path');

// Database directory
const DB_DIR = path.join(__dirname, '../data');
const WALLS_DIR = path.join(DB_DIR, 'walls');

// Ensure database directories exist
function initDatabase() {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    
    if (!fs.existsSync(WALLS_DIR)) {
      fs.mkdirSync(WALLS_DIR, { recursive: true });
    }
    return true;
  } catch (err) {
    console.error('Error initializing database directories:', err);
    return false;
  }
}

/**
 * Save a wall to the database
 * @param {string} wallCode - Wall code
 * @param {Object} wallData - Wall data to save
 * @returns {Promise<Object>} Saved wall data
 */
async function saveWall(wallCode, wallData) {
  if (!initDatabase()) {
    throw new Error('Failed to initialize database');
  }
  
  // Create a unique filename based on wall code and timestamp
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const filename = `${wallCode}_${timestamp}.json`;
  const filepath = path.join(WALLS_DIR, filename);
  
  // Create a unique ID for the saved wall
  const wallId = filename.replace('.json', '');
  
  try {
    console.log(`Starting to save wall ${wallCode} to ${filepath}`);
    
    // Save to file in a memory-efficient way using streams
    const fileStream = fs.createWriteStream(filepath);
    
    // Create a write promise to track completion
    const writePromise = new Promise((resolve, reject) => {
      fileStream.on('finish', () => {
        console.log(`Successfully saved wall ${wallCode}`);
        resolve();
      });
      fileStream.on('error', (err) => {
        console.error(`Error writing wall file for ${wallCode}:`, err);
        reject(err);
      });
    });
    
    // Write opening brace
    fileStream.write('{');
    
    // Write basic properties
    fileStream.write(`"id":"${wallId}",`);
    fileStream.write(`"code":"${wallCode}",`);
    fileStream.write(`"savedAt":"${new Date().toISOString()}",`);
    
    // Write users array - handle both array and Map formats
    fileStream.write('"users":');
    if (Array.isArray(wallData.users)) {
      // Already an array, limit to max 100 users
      const limitedUsers = wallData.users.slice(0, 100);
      fileStream.write(JSON.stringify(limitedUsers));
    } else {
      // Empty array as fallback
      fileStream.write('[]');
    }
    fileStream.write(',');
    
    // Write strokes array header
    fileStream.write('"strokes":[');
    
    // Process strokes in batches to reduce memory pressure
    const MAX_STROKES = 300; // Limit total strokes
    const BATCH_SIZE = 10;   // Process in small batches
    
    // Get strokes, ensuring we have an array and limiting the total
    const strokes = Array.isArray(wallData.strokes) ? 
      wallData.strokes.slice(-MAX_STROKES) : [];
    
    // Process strokes in batches
    for (let i = 0; i < strokes.length; i++) {
      // Simplify stroke data to reduce size
      const stroke = strokes[i];
      const simplifiedStroke = {
        color: stroke.color || '#000000',
        size: stroke.size || 5,
        opacity: stroke.opacity || 1,
        // Limit points to prevent memory issues
        points: Array.isArray(stroke.points) ? 
          stroke.points.slice(0, 50) : // Limit points per stroke
          (stroke.x1 !== undefined ? [{ x1: stroke.x1, y1: stroke.y1, x2: stroke.x2, y2: stroke.y2 }] : [])
      };
      
      // Write the stroke
      fileStream.write(JSON.stringify(simplifiedStroke));
      
      // Add comma if not the last stroke
      if (i < strokes.length - 1) {
        fileStream.write(',');
      }
      
      // Add a small delay every BATCH_SIZE strokes to prevent blocking
      if (i > 0 && i % BATCH_SIZE === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    // Close strokes array
    fileStream.write('],');
    
    // Write thumbnail - limit size if needed
    fileStream.write('"thumbnail":');
    if (wallData.thumbnail) {
      // If thumbnail is too large, truncate it
      const MAX_THUMBNAIL_SIZE = 50000; // ~50KB max for thumbnail
      const thumbnail = typeof wallData.thumbnail === 'string' && wallData.thumbnail.length > MAX_THUMBNAIL_SIZE ?
        wallData.thumbnail.substring(0, MAX_THUMBNAIL_SIZE) : wallData.thumbnail;
      fileStream.write(JSON.stringify(thumbnail));
    } else {
      fileStream.write('null');
    }
    
    // Write closing brace and end the stream
    fileStream.write('}');
    fileStream.end();
    
    // Wait for file to be fully written
    await writePromise;
    
    // Return minimal metadata about the saved wall
    return {
      id: wallId,
      code: wallCode,
      savedAt: new Date().toISOString(),
      thumbnail: wallData.thumbnail ? true : false,
      strokesCount: strokes.length
    };
  } catch (err) {
    console.error(`Error saving wall ${wallCode}:`, err);
    // Attempt to clean up partial file
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        console.log(`Cleaned up partial file ${filepath}`);
      }
    } catch (cleanupErr) {
      console.error(`Error cleaning up partial file ${filepath}:`, cleanupErr);
    }
    throw err;
  }
}

/**
 * Get all saved walls
 * @returns {Promise<Array>} Array of saved wall metadata
 */
async function getSavedWalls() {
  if (!initDatabase()) {
    console.error('Failed to initialize database');
    return [];
  }
  
  try {
    // Just list the files and extract basic info from filenames
    console.log(`Loading saved wall list from ${WALLS_DIR}`);
    const files = await fs.promises.readdir(WALLS_DIR);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    console.log(`Found ${jsonFiles.length} saved walls`);
    
    // Create a simple list with just the basic info
    // This is extremely fast and avoids reading files
    const simpleWalls = jsonFiles.map(file => {
      try {
        // Extract basic info from filename
        const id = file.replace('.json', '');
        const parts = id.split('_');
        const code = parts[0];
        
        // Extract date from filename if possible
        let savedAt = 'Unknown';
        if (parts.length > 1) {
          try {
            // Try to format the date from the filename
            const dateStr = parts.slice(1).join('_').replace(/-/g, ':');
            savedAt = dateStr;
          } catch (dateErr) {
            // Ignore date parsing errors
          }
        }
        
        return {
          id,
          code,
          savedAt,
          // Use the API endpoint to load thumbnails on demand
          thumbnailUrl: `/api/wall/${id}/thumbnail`,
          hasThumbnail: true // Assume all have thumbnails, UI will handle missing ones
        };
      } catch (err) {
        console.error(`Error processing wall filename ${file}:`, err);
        return null;
      }
    });
    
    // Filter out nulls and sort by date (newest first)
    return simpleWalls
      .filter(Boolean)
      .sort((a, b) => {
        try {
          return new Date(b.savedAt) - new Date(a.savedAt);
        } catch (err) {
          return 0; // If date parsing fails, don't change order
        }
      });
  } catch (err) {
    console.error('Error getting saved walls:', err);
    return [];
  }
}

/**
 * Get a specific saved wall by ID
 * @param {string} wallId - Wall ID
 * @param {boolean} [getFullData=false] - Whether to return full data including strokes
 * @returns {Promise<Object|null>} Wall data or null if not found
 */
async function getSavedWall(wallId, getFullData = false) {
  if (!initDatabase()) {
    console.error('Failed to initialize database');
    return null;
  }
  
  try {
    // Make sure the ID includes .json extension
    const filename = wallId.endsWith('.json') ? wallId : `${wallId}.json`;
    const filepath = path.join(WALLS_DIR, filename);
    
    // Check if file exists
    if (!fs.existsSync(filepath)) {
      console.error(`Wall file not found: ${filepath}`);
      return null;
    }
    
    // Read the file in a memory-efficient way
    const fileStats = await fs.promises.stat(filepath);
    
    // If file is too large, only read metadata
    if (fileStats.size > 1000000) { // 1MB limit
      console.log(`Wall file ${filename} is large (${fileStats.size} bytes), returning metadata only`);
      
      // Return metadata only, regardless of getFullData flag, as it's too large
      return {
        id: wallId,
        code: wallId.split('_')[0],
        savedAt: wallId.split('_').slice(1).join('_').replace('.json', '').replace(/-/g, ':'),
        thumbnail: true, // Assume there's a thumbnail
        strokesCount: 'unknown', // We don't know without parsing
        error: 'Wall data too large to load completely'
      };
    }
    
    // For smaller files, read normally
    const data = await fs.promises.readFile(filepath, 'utf8');
    let wall;
    
    try {
      wall = JSON.parse(data);
    } catch (parseErr) {
      console.error(`Error parsing wall data for ${wallId}:`, parseErr);
      return {
        id: wallId,
        code: wallId.split('_')[0],
        savedAt: 'unknown',
        error: 'Could not parse wall data'
      };
    }
    
    // Return full data if requested
    if (getFullData) {
      console.log(`Returning full data for wall ${wallId}`);
      // Add the ID to the wall object if it's not already there
      if (!wall.id) wall.id = wallId;
      return wall; 
    }
    
    // Otherwise, return the summarized metadata
    console.log(`Returning summarized data for wall ${wallId}`);
    return {
      id: wallId,
      code: wall.code || wallId.split('_')[0],
      savedAt: wall.savedAt || 'unknown',
      thumbnail: wall.thumbnail || null,
      strokesCount: wall.strokes ? wall.strokes.length : 0
    };
  } catch (err) {
    console.error(`Error getting saved wall ${wallId}:`, err);
    return null;
  }
}

module.exports = {
  saveWall,
  getSavedWalls,
  getSavedWall
};
