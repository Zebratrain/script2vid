const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration - must be before routes
app.use(cors({
  origin: ['https://49341d2d-11cd-4a62-966f-010843c6c816.lovableproject.com', 'http://localhost:3000'],
  credentials: true
}));

// Other middleware
app.use(express.json({ limit: '50mb' }));

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Test endpoint to verify FFmpeg installation
app.get('/test-ffmpeg', (req, res) => {
  const { exec } = require('child_process');
  exec('ffmpeg -version', (error, stdout, stderr) => {
    if (error) {
      res.status(500).json({ error: error.message });
    } else {
      res.json({ ffmpeg: stdout.split('\n')[0] });
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date().toISOString() });
});

// Video generation endpoint
app.post('/generate-video', async (req, res) => {
  try {
    const { title, content, voiceId, autoGenerateImages, userId } = req.body;
    
    console.log('Starting video generation for:', title);
    console.log('Request body:', { title, voiceId, autoGenerateImages, contentLength: content?.length });
    
    // Validate required fields
    if (!title || !content || !voiceId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: title, content, and voiceId are required' 
      });
    }
    
    // Your video generation logic here
    // (We'll implement this in the next step)
    
    res.json({ 
      success: true, 
      message: 'Video generation started',
      videoData: {
        id: 'test-id',
        title: title,
        status: 'processing'
      }
    });
  } catch (error) {
    console.error('Error in video generation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`FFmpeg test: http://localhost:${PORT}/test-ffmpeg`);
});
