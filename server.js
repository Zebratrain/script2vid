const express = require('express');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Your Render service endpoint
app.post('/generate-video', async (req, res) => {
  try {
    console.log('Received video generation request:', req.body);
    
    // 1. Extract data from request
    const { title, content, voiceId, autoGenerateImages, userId } = req.body;
    
    // 2. Your existing video processing logic here
    // (FFmpeg, image generation, audio synthesis, etc.)
    const processedVideoData = await processVideo({
      title,
      content,
      voiceId,
      autoGenerateImages
    });
    
    // 3. Call Supabase Edge Function to save to database
    const supabaseResponse = await fetch('https://wnczujabypadhtsankif.supabase.co/functions/v1/generate-video', {
      method: 'POST',
      headers: {
        'Authorization': req.headers.authorization, // Pass through auth token
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InduY3p1amFieXBhZGh0c2Fua2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgyNzI4NTEsImV4cCI6MjA2Mzg0ODg1MX0.gQNqJkyk4ov5ocQVxCS4AblC4JRCz44-RVs_mDy4zH4'
      },
      body: JSON.stringify({
        title,
        userId,
        mp4Url: processedVideoData.mp4Url,
        audioUrl: processedVideoData.audioUrl,
        subtitleUrl: processedVideoData.subtitleUrl,
        thumbnailUrl: processedVideoData.thumbnailUrl,
        duration: processedVideoData.duration,
        status: 'completed',
        metadata: processedVideoData.metadata
      })
    });
    
    if (!supabaseResponse.ok) {
      throw new Error(`Supabase call failed: ${supabaseResponse.status}`);
    }
    
    const supabaseResult = await supabaseResponse.json();
    
    // 4. Return success response to frontend
    res.json({
      success: true,
      videoData: supabaseResult.videoData
    });
    
  } catch (error) {
    console.error('Video generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Your existing video processing function
async function processVideo({ title, content, voiceId, autoGenerateImages }) {
  // Your FFmpeg and processing logic here
  // Return the processed video data with URLs
  return {
    mp4Url: 'https://your-storage/video.mp4',
    audioUrl: 'https://your-storage/audio.mp3',
    subtitleUrl: 'https://your-storage/subtitles.srt',
    thumbnailUrl: 'https://your-storage/thumbnail.jpg',
    duration: '2:30',
    metadata: {
      hasFFmpegProcessing: true,
      imageCount: 5,
      wordCount: content.split(' ').length
    }
  };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
