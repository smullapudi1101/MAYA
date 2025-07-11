// api/webhooks/voice.js - Handles incoming phone calls from Twilio

const twilio = require('twilio');
const aiService = require('../services/aiService');
const airtableService = require('../services/airtableService');

// This handles the initial incoming call
exports.handleIncomingCall = async (req, res) => {
  console.log('📞 Incoming call from:', req.body.From);
  
  try {
    // Create TwiML response (Twilio's XML format)
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Get business info based on the forwarding number that was called
    const business = await airtableService.getBusinessByForwardingNumber(req.body.To);
    
    if (!business) {
      // If we can't find the business, play error message
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'Sorry, I cannot find the business information. Please try again later.');
      
      return res.type('text/xml').send(twiml.toString());
    }
    
    // Store call info in session
  const gather = twiml.gather({
  input: 'speech',
  timeout: 10,  // Increase from 3-5 to 10 seconds (time to wait for any speech)
  speechTimeout: 3,  // Change from 'auto' to 3 seconds (silence after speaking)
  action: `/webhook/conversation?business_id=${business.id}`,
  method: 'POST',
  actionOnEmptyResult: true
});
    
    // Greet the caller
    gather.say({
      voice: 'alice',
      language: 'en-US'
    }, `Thank you for calling ${business.fields['Name']}. I'm Maya, your AI assistant. How can I help you today?`);
    
    // If caller doesn't say anything, ask again
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I didn\'t hear anything. Please tell me how I can help you.');
    
    // Log the call
    await airtableService.createCallLog({
      business_id: business.id,
      caller_number: req.body.From,
      call_sid: req.body.CallSid,
      status: 'Started'
    });
    
    // Send response back to Twilio
    res.type('text/xml').send(twiml.toString());
    
  } catch (error) {
    console.error('Error handling incoming call:', error);
    
    // Error response
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I\'m sorry, I\'m having technical difficulties. Please try calling back in a few moments.');
    
    res.type('text/xml').send(twiml.toString());
  }
};

// This handles the conversation after the caller speaks
exports.handleConversation = async (req, res) => {
  console.log('💬 Conversation input:', req.body.SpeechResult);
  
  try {
    const businessId = req.query.business_id;
    const userInput = req.body.SpeechResult;
    const callSid = req.body.CallSid;
    
    // Get business details
    const business = await airtableService.getBusinessById(businessId);
    
    // Get conversation history (if any)
    const conversationHistory = await airtableService.getCallHistory(callSid);
    
    // Generate AI response
    const aiResponse = await aiService.generateResponse(
      business,
      conversationHistory,
      userInput
    );
    
    // Update call log with conversation
    await airtableService.updateCallLog(callSid, {
      transcript: conversationHistory + '\nCustomer: ' + userInput + '\nAI: ' + aiResponse.message,
      intent: aiResponse.intent
    });
    
    // Create TwiML response
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Process any actions (bookings, orders, etc.)
    if (aiResponse.action) {
      await processAction(aiResponse.action, business, req.body);
    }
    
    // Say the AI response
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, aiResponse.message);
    
    // Continue conversation or end call
    if (aiResponse.continueConversation) {
      const gather = twiml.gather({
  input: 'speech',
  timeout: 10,  // Increase timeout
  speechTimeout: 3,  // Give people time to think
  action: `/webhook/conversation?business_id=${businessId}`,
  method: 'POST',
  actionOnEmptyResult: true
    });
      
      gather.say({
        voice: 'alice',
        language: 'en-US'
      }, 'Is there anything else I can help you with?');
    } else {
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, `Thank you for calling ${business.fields['Name']}. Have a great day!`);
    }
    
    res.type('text/xml').send(twiml.toString());
    
  } catch (error) {
    console.error('Error in conversation:', error);
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I apologize, but I\'m having trouble understanding. Let me transfer you to someone who can help.');
    
    res.type('text/xml').send(twiml.toString());
  }
};

// Process actions like bookings or orders
async function processAction(action, business, callData) {
  console.log('🎯 Processing action:', action.type);
  
  switch (action.type) {
    case 'booking':
      // Create appointment in Airtable
      await airtableService.createAppointment({
        business_id: business.id,
        customer_name: action.data.customer_name,
        customer_phone: callData.From,
        service: action.data.service,
        date_time: action.data.date_time,
        status: 'Confirmed'
      });
      
      // TODO: Send SMS confirmation
      break;
      
    case 'order':
      // Create order in Airtable
      await airtableService.createOrder({
        business_id: business.id,
        customer_name: action.data.customer_name,
        customer_phone: callData.From,
        items: action.data.items,
        total: action.data.total,
        pickup_time: action.data.pickup_time,
        status: 'Received'
      });
      
      // TODO: Send SMS confirmation
      break;
      
    case 'info':
      // Just providing information, no action needed
      break;
  }
}