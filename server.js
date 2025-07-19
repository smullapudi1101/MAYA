// server.js - Main server file for Maya AI Assistant
// This file starts your application and handles all incoming requests

// Load environment variables from .env file
require('dotenv').config();

// Import required packages
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

// Create Express app
const app = express();

// Security and parsing middleware
app.use(helmet()); // Adds security headers
app.use(cors()); // Allows cross-origin requests
app.use(express.json()); // Parses JSON requests
app.use(express.urlencoded({ extended: true })); // Parses form data

// Import our webhook handlers
const voiceWebhook = require('./api/webhooks/voice');

// Health check endpoint (to verify server is running)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'Maya AI Assistant',
    timestamp: new Date().toISOString() 
  });
});

// Main webhook endpoint for Twilio
app.post('/webhook/voice', voiceWebhook.handleIncomingCall);
app.post('/webhook/conversation', voiceWebhook.handleConversation);

// Handle 404 errors
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});
// Allow GET so Twilio's Console can validate the webhook
app.get('/webhook/voice', (req, res) => {
  // You can return a minimal valid TwiML or just 200 OK
  res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
🚀 MAYA is running!
🌐 Server: http://localhost:${PORT}
🏥 Health Check: http://localhost:${PORT}/health
📞 Webhook URL: http://localhost:${PORT}/webhook/voice

MAYA is ready to handle calls! 📞
  `);
});