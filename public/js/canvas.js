/**
 * Canvas Controller Module
 * Manages drawing functionality and canvas state
 */
const Canvas = (function() {
    // Canvas elements
    const canvas = document.getElementById('drawing-canvas');
    const ctx = canvas.getContext('2d');
    
    // Toolbar elements
    const colorOptions = document.querySelectorAll('.color-option');
    const brushSlider = document.getElementById('brush-slider');
    const brushSizeDisplay = document.getElementById('brush-size');
    const clearBtn = document.getElementById('clear-btn');
    
    // Drawing state
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    let lastTimestamp = 0;
    let currentColor = '#ff0000';
    let currentSize = 10;
    let currentOpacity = 0.8;
    
    // Spray paint effect variables
    let accumulationPoints = [];
    let accumulationTimer = null;
    let lastMoveSpeed = 0;
    const MAX_DRIP_LENGTH = 15;
    const DRIP_THRESHOLD_TIME = 500; // ms to start dripping
    let lastTime = 0;
    let stationaryTime = 0;
    let stationaryPosition = { x: 0, y: 0 };
    let lastVelocity = 0;
    
    // Current stroke data
    let currentStroke = [];
    
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
    
    // Initialize canvas controller
    function init() {
      setupCanvas();
      setupEventListeners();
    }
    
    // Configure canvas
    function setupCanvas() {
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);
    }
    
    // Resize canvas to fit container
    function resizeCanvas() {
      const header = document.querySelector('.header');
      const toolbar = document.querySelector('.toolbar');
      
      const headerHeight = header.offsetHeight || 0;
      const toolbarHeight = toolbar.offsetHeight || 0;
      
      // Set canvas dimensions to match the available space
      canvas.width = canvas.offsetWidth;
      canvas.height = window.innerHeight - headerHeight - toolbarHeight;
      
      // Don't fill with black - let the CSS background image show through
      // Just clear the canvas to make it transparent
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    // Set up event listeners
    function setupEventListeners() {
      // Mouse events
      canvas.addEventListener('mousedown', startDrawing);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseup', stopDrawing);
      canvas.addEventListener('mouseout', stopDrawing);
      
      // Touch events
      canvas.addEventListener('touchstart', handleTouchStart);
      canvas.addEventListener('touchmove', handleTouchMove);
      canvas.addEventListener('touchend', handleTouchEnd);
      
      // Toolbar events
      colorOptions.forEach(option => {
        option.addEventListener('click', () => {
          // Remove active class from all options
          colorOptions.forEach(opt => opt.classList.remove('active'));
          // Add active class to clicked option
          option.classList.add('active');
          // Update current color
          currentColor = option.getAttribute('data-color');
        });
      });
      
      brushSlider.addEventListener('input', () => {
        currentSize = brushSlider.value;
        brushSizeDisplay.textContent = `${currentSize}px`;
      });
      
      clearBtn.addEventListener('click', () => {
        clearCanvas();
        events.emit('canvasCleared');
      });
    }
    
    // Helper function to get pointer position
    function getPointerPosition(e) {
      const rect = canvas.getBoundingClientRect();
      if (e.touches) {
        // Touch event
        const touch = e.touches[0];
        return [touch.clientX - rect.left, touch.clientY - rect.top];
      } else {
        // Mouse event
        return [e.clientX - rect.left, e.clientY - rect.top];
      }
    }
    
    // Touch event handlers
    function handleTouchStart(e) {
      e.preventDefault();
      isDrawing = true;
      [lastX, lastY] = getPointerPosition(e);
      lastTimestamp = Date.now();
      
      // Draw a single dot if the user just clicks
      drawDot(lastX, lastY);
      
      // Start tracking accumulation for drip effect
      accumulationPoints.push({ x: lastX, y: lastY, time: lastTimestamp, amount: 0 });
      
      // Start accumulation timer for drip effect
      if (accumulationTimer) clearInterval(accumulationTimer);
      accumulationTimer = setInterval(processAccumulation, 100);
    }
    
    function handleTouchMove(e) {
      e.preventDefault();
      if (!isDrawing) return;
      
      const currentTimestamp = Date.now();
      const [currentX, currentY] = getPointerPosition(e);
      
      // Calculate movement speed (pixels per millisecond)
      const distance = Math.sqrt(Math.pow(currentX - lastX, 2) + Math.pow(currentY - lastY, 2));
      const timeDelta = currentTimestamp - lastTimestamp || 1; // Avoid division by zero
      const speed = distance / timeDelta;
      
      // Update last move speed for spray effect
      lastMoveSpeed = speed;
      
      // Draw line from last position to current position with speed-based effects
      drawLine(lastX, lastY, currentX, currentY, speed);
      
      // Add to accumulation points for drip effect
      accumulationPoints.push({ x: currentX, y: currentY, time: currentTimestamp, amount: 0 });
      
      // Save current position and time for the next draw
      lastX = currentX;
      lastY = currentY;
      lastTimestamp = currentTimestamp;
    }
    
    function handleTouchEnd(e) {
      e.preventDefault();
      isDrawing = false;
      
      // Emit the current stroke to be saved
      events.emit('lineDraw', {
        color: currentColor,
        size: currentSize,
        opacity: currentOpacity,
        points: currentStroke
      });
      
      // Reset current stroke
      currentStroke = [];
      
      // Clear accumulation timer
      if (accumulationTimer) {
        clearInterval(accumulationTimer);
        accumulationTimer = null;
      }
      
      // Clear accumulation points after a short delay to allow final drips
      setTimeout(() => {
        accumulationPoints = [];
      }, 1000);
    }
    
    // Mouse event handlers
    function startDrawing(e) {
      isDrawing = true;
      const [x, y] = getPointerPosition(e);
      lastX = x;
      lastY = y;
      lastTimestamp = Date.now();
      
      // Draw a single dot if the user just clicks
      drawDot(lastX, lastY);
      
      // Start tracking accumulation for drip effect
      accumulationPoints.push({ x: lastX, y: lastY, time: lastTimestamp, amount: 0 });
      
      // Start accumulation timer for drip effect
      if (accumulationTimer) clearInterval(accumulationTimer);
      accumulationTimer = setInterval(processAccumulation, 100);
    }
    
    function draw(e) {
      if (!isDrawing) return;
      
      const [x, y] = getPointerPosition(e);
      const currentTimestamp = Date.now();
      
      // Calculate movement speed (pixels per millisecond)
      const distance = Math.sqrt(Math.pow(x - lastX, 2) + Math.pow(y - lastY, 2));
      const timeDelta = currentTimestamp - lastTimestamp || 1; // Avoid division by zero
      const speed = distance / timeDelta;
      
      // Update last move speed for spray effect
      lastMoveSpeed = speed;
      
      // Draw line from last position to current position with speed-based effects
      drawLine(lastX, lastY, x, y, speed);
      
      // Add to accumulation points for drip effect
      accumulationPoints.push({ x, y, time: currentTimestamp, amount: 0 });
      
      // Save current position and time for the next draw
      lastX = x;
      lastY = y;
      lastTimestamp = currentTimestamp;
    }
    
    function stopDrawing() {
      if (!isDrawing) return;
      isDrawing = false;
      
      // Emit the current stroke to be saved
      events.emit('lineDraw', {
        color: currentColor,
        size: currentSize,
        opacity: currentOpacity,
        points: currentStroke
      });
      
      // Reset current stroke
      currentStroke = [];
      
      // Clear accumulation timer
      if (accumulationTimer) {
        clearInterval(accumulationTimer);
        accumulationTimer = null;
      }
      
      // Clear accumulation points after a short delay to allow final drips
      setTimeout(() => {
        accumulationPoints = [];
      }, 1000);
    }
    
    // Draw a line and emit the event
    function drawAndEmit(fromX, fromY, toX, toY, timeDelta) {
      // Draw on local canvas
      drawLine(fromX, fromY, toX, toY, currentColor, currentSize, timeDelta);
      
      // Emit the drawing event
      events.emit('lineDraw', {
        fromX,
        fromY,
        toX,
        toY,
        color: currentColor,
        size: currentSize,
        timeDelta: timeDelta || 16 // Default value for network events
      });
    }
    
    // Draw a line on the canvas with realistic spray paint effect
    function drawLine(x1, y1, x2, y2, speed = 0) {
      // Adjust line width based on speed
      // Faster movement = thinner line, slower movement = thicker line
      const speedFactor = speed > 0 ? Math.min(1, speed * 10) : 0;
      const dynamicSize = currentSize * (1 - speedFactor * 0.7);
      
      // Create spray paint effect
      const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const steps = Math.max(Math.floor(length), 1);
      
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const x = x1 + (x2 - x1) * t;
        const y = y1 + (y2 - y1) * t;
        
        // Main spray dot
        drawSprayDot(x, y, dynamicSize);
        
        // Add spray particles based on speed (more particles when slower)
        const particleCount = Math.floor(10 * (1 - speedFactor * 0.8)) + 3;
        drawSprayParticles(x, y, dynamicSize, particleCount);
      }
      
      // Save points for the current stroke
      currentStroke.push({ x1, y1, x2, y2, size: dynamicSize });
    }
    
    // Draw a spray dot on the canvas
    function drawSprayDot(x, y, size) {
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = currentColor;
      ctx.globalAlpha = currentOpacity * 0.6;
      ctx.fill();
    }
    
    // Draw spray particles
    function drawSprayParticles(x, y, size, count) {
      for (let i = 0; i < count; i++) {
        // Calculate random position for spray particle
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * size;
        const particleX = x + radius * Math.cos(angle);
        const particleY = y + radius * Math.sin(angle);
        
        // Draw particle
        drawSprayDot(particleX, particleY, size / 5);
      }
    }
    
    // Draw a dot - used for single clicks
    function drawDot(x, y) {
      // Simply use the existing drawSprayDot with current size
      drawSprayDot(x, y, currentSize);
      drawSprayParticles(x, y, currentSize, 10);
    }
    
    // Create paint drips when stationary
    function createPaintDrip(x, y, color, size) {
      // Create 1-3 drips
      const dripsCount = Math.floor(Math.random() * 3) + 1;
      
      for (let i = 0; i < dripsCount; i++) {
        // Randomize drip position slightly
        const dripX = x + (Math.random() * 2 - 1) * size * 0.5;
        const dripY = y + (Math.random() * size * 0.3); // Slightly below the point
        
        // Drip length based on size and randomness
        const dripLength = size * (Math.random() * 2 + 2);
        
        // Create the drip path
        ctx.beginPath();
        ctx.moveTo(dripX, dripY);
        
        // Control points for the bezier curve
        const cp1x = dripX + (Math.random() * 2 - 1) * size * 0.3;
        const cp1y = dripY + dripLength * 0.3;
        const cp2x = dripX + (Math.random() * 2 - 1) * size * 0.3;
        const cp2y = dripY + dripLength * 0.6;
        const endX = dripX + (Math.random() * 2 - 1) * size * 0.5;
        const endY = dripY + dripLength;
        
        // Draw the curved drip
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
        
        // Drip style
        ctx.lineWidth = Math.max(1, size * 0.3 * (1 - i * 0.2)); // Thinner for secondary drips
        ctx.strokeStyle = hexToRgba(color, 0.8);
        ctx.lineCap = 'round';
        ctx.stroke();
        
        // Add a blob at the end of the drip
        ctx.beginPath();
        ctx.arc(endX, endY, Math.max(1, size * 0.2), 0, Math.PI * 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
      }
    }
    
    // Helper function to convert hex color to rgba
    function hexToRgba(hex, alpha) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    
    // Draw a line from external source (another user)
    function drawExternalLine(data) {
      if (!data) {
        console.error('Canvas: drawExternalLine received null/undefined data');
        return;
      }
      
      console.log('Canvas: drawExternalLine processing stroke:', 
        JSON.stringify(data).substring(0, 100) + '...');
      
      // Extract properties with defaults
      const color = data.color || '#000000';
      const size = data.size || 5;
      const opacity = data.opacity || 0.8;
      
      // Save current settings
      const savedColor = currentColor;
      const savedSize = currentSize;
      const savedOpacity = currentOpacity;
      
      // Set drawing style based on external data
      currentColor = color;
      currentOpacity = opacity;
      
      try {
        // Handle different stroke data formats
        
        // Format 1: Direct x1,y1,x2,y2 properties on the stroke object
        if (data.x1 !== undefined && data.y1 !== undefined && 
            data.x2 !== undefined && data.y2 !== undefined) {
          
          console.log('Canvas: Processing Format 1 - direct coordinates');
          const dynamicSize = data.size || size;
          currentSize = dynamicSize;
          
          // Create spray paint effect for the segment
          const length = Math.sqrt(Math.pow(data.x2 - data.x1, 2) + Math.pow(data.y2 - data.y1, 2));
          const steps = Math.max(Math.floor(length), 1);
          
          for (let i = 0; i < steps; i++) {
            const t = i / steps;
            const x = data.x1 + (data.x2 - data.x1) * t;
            const y = data.y1 + (data.y2 - data.y1) * t;
            
            // Draw spray effects
            drawSprayDot(x, y, dynamicSize);
            drawSprayParticles(x, y, dynamicSize, 5);
          }
        }
        // Format 2: Array of points with x1,y1,x2,y2 properties
        else if (Array.isArray(data.points) && data.points.length > 0) {
          console.log(`Canvas: Processing Format 2 - points array with ${data.points.length} points`);
          
          // Draw all points in the stroke using spray effect
          data.points.forEach(point => {
            if (!point || point.x1 === undefined) {
              console.warn('Canvas: Invalid point in points array', point);
              return; // Skip this point
            }
            
            const dynamicSize = point.size || size;
            currentSize = dynamicSize;
            
            // Create spray paint effect for each segment
            const length = Math.sqrt(Math.pow(point.x2 - point.x1, 2) + Math.pow(point.y2 - point.y1, 2));
            const steps = Math.max(Math.floor(length), 1);
            
            for (let i = 0; i < steps; i++) {
              const t = i / steps;
              const x = point.x1 + (point.x2 - point.x1) * t;
              const y = point.y1 + (point.y2 - point.y1) * t;
              
              // Draw spray effects
              drawSprayDot(x, y, dynamicSize);
              drawSprayParticles(x, y, dynamicSize, 5);
            }
          });
        }
        // Format 3: Single point for a dot (x, y properties)
        else if (data.x !== undefined && data.y !== undefined) {
          console.log('Canvas: Processing Format 3 - single point');
          const dynamicSize = data.size || size;
          currentSize = dynamicSize;
          
          drawSprayDot(data.x, data.y, dynamicSize);
          drawSprayParticles(data.x, data.y, dynamicSize, 5);
        }
        else {
          console.warn('Canvas: Unknown stroke format', data);
        }
      } catch (err) {
        console.error('Canvas: Error in drawExternalLine:', err);
      }
      
      // Restore original settings
      currentColor = savedColor;
      currentSize = savedSize;
      currentOpacity = savedOpacity;
    }
    
    // Clear the canvas
    function clearCanvas() {
      // Clear the entire canvas first
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Instead of filling with a solid color, we'll make the canvas transparent
      // to let the CSS background image show through
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Reset any accumulated points
      accumulationPoints = [];
      
      // Reset current stroke
      currentStroke = [];
    }
    
    // Process paint accumulation for drip effect
    function processAccumulation() {
      if (!isDrawing && accumulationPoints.length === 0) return;
      
      const currentTime = Date.now();
      const newAccumulationPoints = [];
      
      // Process each accumulation point
      accumulationPoints.forEach(point => {
        // Calculate how long the point has been accumulating
        const timeAccumulating = currentTime - point.time;
        
        // If point has been accumulating long enough, create drip effect
        if (timeAccumulating > DRIP_THRESHOLD_TIME) {
          // Calculate drip length based on time (longer time = longer drip)
          const timeFactor = Math.min(1, (timeAccumulating - DRIP_THRESHOLD_TIME) / 2000);
          const dripLength = MAX_DRIP_LENGTH * timeFactor;
          
          if (dripLength > 1) {
            // Draw drip
            const dripEndY = point.y + dripLength;
            
            // Create gradient for drip
            const gradient = ctx.createLinearGradient(point.x, point.y, point.x, dripEndY);
            gradient.addColorStop(0, currentColor);
            gradient.addColorStop(1, adjustColorOpacity(currentColor, 0.1));
            
            ctx.beginPath();
            ctx.moveTo(point.x, point.y);
            ctx.lineTo(point.x, dripEndY);
            ctx.strokeStyle = gradient;
            ctx.lineWidth = (currentSize / 3) * (1 - timeFactor * 0.7);
            ctx.globalAlpha = currentOpacity * (1 - timeFactor * 0.7);
            ctx.stroke();
            
            // Add some random drip particles
            if (Math.random() > 0.7) {
              const particleY = point.y + Math.random() * dripLength;
              drawSprayDot(point.x + (Math.random() * 2 - 1), particleY, currentSize * 0.3);
            }
          }
        }
        
        // Keep points that are still relevant (not too old)
        if (timeAccumulating < 3000) {
          newAccumulationPoints.push(point);
        }
      });
      
      // Update accumulation points
      accumulationPoints = newAccumulationPoints;
    }
    
    // Adjust color opacity for drip effect
    function adjustColorOpacity(color, opacity) {
      // Handle hex colors
      if (color.startsWith('#')) {
        let r = parseInt(color.slice(1, 3), 16);
        let g = parseInt(color.slice(3, 5), 16);
        let b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      }
      // Handle rgb/rgba colors
      else if (color.startsWith('rgb')) {
        if (color.startsWith('rgba')) {
          return color.replace(/rgba\([^,]+,[^,]+,[^,]+,[^)]+\)/, `rgba($1,$2,$3,${opacity})`);
        } else {
          return color.replace(/rgb\([^,]+,[^,]+,[^)]+\)/, `rgba($1,$2,$3,${opacity})`);
        }
      }
      return color;
    }
    
    // Load wall data onto the canvas
    function loadWallData(strokes) {
      console.log(`Canvas: Loading ${strokes?.length || 0} strokes onto canvas.`);
      console.log('Canvas: First stroke sample:', strokes?.[0] ? JSON.stringify(strokes[0]).substring(0, 200) + '...' : 'None');
      
      // 1. Clear the current canvas content completely
      console.log('Canvas: Clearing canvas before drawing strokes');
      clearCanvas();
      
      // 2. Draw the loaded strokes
      if (strokes && strokes.length > 0) {
        console.log(`Canvas: Drawing ${strokes.length} loaded strokes...`);
        let successCount = 0;
        let errorCount = 0;
        
        strokes.forEach((stroke, index) => {
          try {
            // Log every 10th stroke to avoid console spam
            if (index % 10 === 0) {
              console.log(`Canvas: Drawing stroke ${index}/${strokes.length}`);
            }
            
            // We reuse drawExternalLine as it handles the stroke format
            drawExternalLine(stroke);
            successCount++;
          } catch (err) {
            console.error(`Canvas: Error drawing stroke ${index}:`, err);
            console.error('Canvas: Problematic stroke data:', stroke);
            errorCount++;
          }
        });
        
        console.log(`Canvas: Finished drawing strokes. Success: ${successCount}, Errors: ${errorCount}`);
      } else {
        console.log('Canvas: No strokes to draw for this wall.');
      }
      
      // Optionally reset local stroke history if needed
      // currentStroke = []; // Decide if this is necessary
    }
    
    // Load stroke history
    function loadHistory(strokes) {
      if (!strokes || !strokes.length) return;
      
      strokes.forEach(stroke => {
        drawExternalLine(stroke);
      });
    }
    
    return {
      init,
      events,
      drawExternalLine,
      clearCanvas,
      loadHistory,
      loadWallData
    };
  })();
  
  // Initialize Canvas when DOM is ready
  document.addEventListener('DOMContentLoaded', Canvas.init);