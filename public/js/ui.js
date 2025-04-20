/**
 * UI Controller Module
 * Manages UI interactions and screen transitions
 */
const UI = (function() {
    // DOM Elements
    const welcomeScreen = document.getElementById('welcome-screen');
    const canvasScreen = document.getElementById('canvas-screen');
    const galleryScreen = document.getElementById('gallery-screen');
    const wallViewerScreen = document.getElementById('wall-viewer-screen');
    
    // Welcome screen elements
    const usernameInput = document.getElementById('username-input');
    const wallCodeInput = document.getElementById('wall-code-input');
    const createWallBtn = document.getElementById('create-wall-btn');
    const joinWallBtn = document.getElementById('join-wall-btn');
    
    // Canvas screen elements
    const leaveWallBtn = document.getElementById('leave-wall-btn');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const saveWallBtn = document.getElementById('save-wall-btn');
    const viewGalleryBtn = document.getElementById('view-gallery-btn');
    const wallCodeDisplay = document.getElementById('wall-code-display');
    const usersCountDisplay = document.getElementById('users-count');
    
    // Gallery screen elements
    const closeGalleryBtn = document.getElementById('close-gallery-btn');
    const galleryLoading = document.querySelector('.gallery-loading');
    const galleryEmpty = document.querySelector('.gallery-empty');
    const galleryGrid = document.querySelector('.gallery-grid');
    
    // Wall viewer screen elements
    const closeViewerBtn = document.getElementById('close-viewer-btn');
    const viewerWallCode = document.getElementById('viewer-wall-code');
    const viewerWallDate = document.getElementById('viewer-wall-date');
    const wallImage = document.getElementById('wall-image');
    
    // Notification container
    const notificationContainer = document.getElementById('notification-container');
    
    // Track current active screen
    let currentScreen = welcomeScreen;
    let activeWallId = null;
    
    // Initialize UI
    function init() {
      // Set random username if empty
      if (!usernameInput.value) {
        const randomNames = ['Banksy', 'Picasso', 'Basquiat', 'Warhol', 'Haring', 'Dali'];
        usernameInput.placeholder = `${randomNames[Math.floor(Math.random() * randomNames.length)]}${Math.floor(Math.random() * 100)}`;
      }
      
      // Event listeners for welcome screen
      createWallBtn.addEventListener('click', () => {
        const username = usernameInput.value || usernameInput.placeholder;
        events.emit('createWallRequested', { username });
      });
      
      joinWallBtn.addEventListener('click', () => {
        const wallCode = wallCodeInput.value.trim();
        if (!wallCode) {
          showNotification('error', 'Error', 'Please enter a wall code');
          return;
        }
        
        const username = usernameInput.value || usernameInput.placeholder;
        events.emit('joinWallRequested', { wallCode, username });
      });
      
      // Event listeners for canvas screen
      leaveWallBtn.addEventListener('click', () => {
        events.emit('leaveWallRequested');
      });
      
      copyLinkBtn.addEventListener('click', () => {
        const wallCode = wallCodeDisplay.textContent;
        const shareUrl = `${window.location.origin}?wall=${wallCode}`;
        
        navigator.clipboard.writeText(shareUrl)
          .then(() => {
            showNotification('success', 'Link Copied', 'Share this link with friends to invite them to your wall');
          })
          .catch(() => {
            showNotification('error', 'Copy Failed', 'Could not copy link to clipboard');
          });
      });
      
      saveWallBtn.addEventListener('click', () => {
        // Create a thumbnail of the canvas
        const canvas = document.getElementById('drawing-canvas');
        const thumbnailData = canvas.toDataURL('image/png');
        
        // Emit save wall event
        events.emit('saveWallRequested', { thumbnailData });
        showNotification('info', 'Saving Wall', 'Saving your masterpiece...');
      });
      
      viewGalleryBtn.addEventListener('click', () => {
        showGalleryScreen();
      });
      
      // Event listeners for gallery screen
      closeGalleryBtn.addEventListener('click', () => {
        showCanvasScreen(wallCodeDisplay.textContent);
      });
      
      // Event listeners for wall viewer screen
      closeViewerBtn.addEventListener('click', () => {
        showGalleryScreen();
      });
      
      // Listen for wall saved event
      events.on('wallSaved', (data) => {
        showNotification('success', 'Wall Saved', `Your wall has been saved! ID: ${data.id}`);
      });
      
      // Check for wall code in URL params on load
      window.addEventListener('load', () => {
        const params = new URLSearchParams(window.location.search);
        const wallCode = params.get('wall');
        
        if (wallCode) {
          wallCodeInput.value = wallCode;
        }
      });
    }
    
    // Simple event system
    const events = {
      handlers: {},
      on: function(event, handler) {
        if (!this.handlers[event]) {
          this.handlers[event] = [];
        }
        this.handlers[event].push(handler);
      },
      emit: function(event, data) {
        if (this.handlers[event]) {
          this.handlers[event].forEach(handler => handler(data));
        }
      }
    };
    
    // Show welcome screen
    function showWelcomeScreen() {
      // Hide all screens
      hideAllScreens();
      
      // Show welcome screen
      welcomeScreen.classList.add('active');
      currentScreen = welcomeScreen;
      
      // Clear URL params
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    // Show canvas screen
    function showCanvasScreen(wallCode) {
      // Hide all screens
      hideAllScreens();
      
      // Update wall code display
      wallCodeDisplay.textContent = wallCode;
      
      // Update URL with wall code
      window.history.replaceState({}, document.title, `?wall=${wallCode}`);
      
      // Show canvas screen
      canvasScreen.classList.add('active');
      currentScreen = canvasScreen;
    }
    
    // Show gallery screen
    function showGalleryScreen() {
      // Hide all screens
      hideAllScreens();
      
      // Show gallery screen
      galleryScreen.classList.add('active');
      currentScreen = galleryScreen;
      
      // Load saved walls
      loadSavedWalls();
    }
    
    // Show wall viewer screen
    function showWallViewerScreen(wallId) {
      // Hide all screens
      hideAllScreens();
      
      // Show wall viewer screen
      wallViewerScreen.classList.add('active');
      currentScreen = wallViewerScreen;
      activeWallId = wallId;
      
      // Load wall data
      loadWallData(wallId);
    }
    
    // Hide all screens
    function hideAllScreens() {
      welcomeScreen.classList.remove('active');
      canvasScreen.classList.remove('active');
      galleryScreen.classList.remove('active');
      wallViewerScreen.classList.remove('active');
    }
    
    // Update users count
    function updateUsersCount(count) {
      usersCountDisplay.textContent = count;
    }
    
    // Show notification
    function showNotification(type, title, message) {
      const notification = document.createElement('div');
      notification.className = `notification ${type}`;
      
      notification.innerHTML = `
        <div class="notification-content">
          <div class="notification-title">${title}</div>
          <div class="notification-message">${message}</div>
        </div>
      `;
      
      notificationContainer.appendChild(notification);
      
      // Remove after 5 seconds
      setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        
        setTimeout(() => {
          notification.remove();
        }, 300);
      }, 5000);
    }
    
    // Load saved walls for gallery
    function loadSavedWalls() {
      console.log('UI: Loading saved walls...');
      // Show loading, hide empty message and clear grid
      galleryLoading.classList.remove('hidden');
      galleryEmpty.classList.add('hidden');
      galleryGrid.innerHTML = '';
      
      // Create a function to handle the response to ensure it's a proper function
      function handleResponse(response) {
        console.log('UI: handleResponse called with:', response);
        galleryLoading.classList.add('hidden');
        
        if (!response || !response.success) {
          console.error('UI: Error loading saved walls', response?.error);
          showNotification('error', 'Error', 'Failed to load saved walls');
          galleryEmpty.classList.remove('hidden');
          return;
        }
        
        const walls = response.walls || [];
        console.log(`UI: Received ${walls.length} walls from server`);
        
        if (walls.length === 0) {
          console.log('UI: No walls found, showing empty message');
          galleryEmpty.classList.remove('hidden');
          return;
        }
        
        // Create gallery items
        console.log('UI: Creating gallery items...');
        walls.forEach((wall, index) => {
          const item = createGalleryItem(wall);
          galleryGrid.appendChild(item);
        });
        
        console.log('UI: Gallery loading complete');
      }
      
      // Try using direct fetch first as it's more reliable
      console.log('UI: Trying direct fetch first...');
      fetch('/api/saved-walls')
        .then(response => response.json())
        .then(data => {
          console.log('UI: Fetch response:', data);
          handleResponse(data);
        })
        .catch(error => {
          console.error('UI: Fetch error, falling back to socket:', error);
          
          // Fall back to socket method
          console.log('UI: Requesting saved walls from server via socket...');
          events.emit('getSavedWallsRequested', {}, handleResponse);
          
          // Set a timeout as fallback for socket method
          setTimeout(() => {
            // Only do this if loading is still visible
            if (!galleryLoading.classList.contains('hidden')) {
              console.error('UI: Gallery loading timeout after 5 seconds');
              galleryLoading.classList.add('hidden');
              showNotification('warning', 'Gallery Timeout', 'Loading saved walls timed out');
              galleryEmpty.classList.remove('hidden');
            }
          }, 5000);
        });
    }
    
    // Create a gallery item
    function createGalleryItem(wall) {
      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.dataset.id = wall.id;
      
      // Format date
      let formattedDate = 'Unknown';
      try {
        const date = new Date(wall.savedAt);
        formattedDate = date.toLocaleString();
      } catch (err) {
        console.error('Error formatting date', err);
      }
      
      // Determine the thumbnail source
      let thumbnailSrc = '';
      if (wall.thumbnailUrl) {
        thumbnailSrc = wall.thumbnailUrl; // Use the URL from the server
      } else if (wall.thumbnail && typeof wall.thumbnail === 'string') {
        thumbnailSrc = wall.thumbnail; // Fallback to base64 if available
      } else if (wall.hasThumbnail) {
        thumbnailSrc = `/api/wall/${wall.id}/thumbnail`; // Alternative URL format
      }
      
      // Create placeholder background if no thumbnail
      const placeholderStyle = !thumbnailSrc ? 'style="background: linear-gradient(45deg, #333, #666);"' : '';
      
      item.innerHTML = `
        <div class="gallery-thumbnail-container" ${placeholderStyle}>
          ${thumbnailSrc ? `<img class="gallery-thumbnail" src="${thumbnailSrc}" alt="Wall ${wall.code}" loading="lazy">` : 
            `<div class="gallery-placeholder">No Preview</div>`}
        </div>
        <div class="gallery-info">
          <div class="gallery-code">Wall: ${wall.code}</div>
          <div class="gallery-date">${formattedDate}</div>
        </div>
      `;
      
      // Add click event to request loading the wall onto the canvas
      item.addEventListener('click', () => {
        console.log(`UI: Requesting to load wall ${wall.id} (${wall.code})`);
        showNotification('info', 'Loading Wall', `Fetching data for wall ${wall.code}...`);
        events.emit('requestLoadWall', wall.id);
        // Optionally switch screen immediately or wait for server response
        // For now, let's wait for the server to send the data before switching
      });
      
      return item;
    }
    
    // Load wall data for viewer
    function loadWallData(wallId) {
      // Request wall data from server
      events.emit('getSavedWallRequested', { wallId }, (response) => {
        if (!response.success) {
          showNotification('error', 'Error', 'Failed to load wall data');
          return;
        }
        
        const wall = response.wall;
        
        // Update viewer UI
        viewerWallCode.textContent = wall.code;
        
        // Format date
        const date = new Date(wall.savedAt);
        viewerWallDate.textContent = date.toLocaleString();
        
        // Set wall image
        wallImage.src = wall.thumbnail || '';
      });
    }
    
    return {
      init,
      events,
      showWelcomeScreen,
      showCanvasScreen,
      showGalleryScreen,
      showWallViewerScreen,
      updateUsersCount,
      showNotification,
      getUsername: () => usernameInput.value || usernameInput.placeholder
    };
  })();
  
  // Initialize UI when DOM is ready
  document.addEventListener('DOMContentLoaded', UI.init);