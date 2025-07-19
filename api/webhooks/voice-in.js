// api/webhooks/voice.js - Handles incoming phone calls from Twilio

const twilio = require('twilio');
// const aiService = require('../services/aiService');
const aiService = require('../services/groqAiService');
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
        language: 'en-IN'
      }, 'Sorry, I cannot find the business information. Please try again later.');
      
      return res.type('text/xml').send(twiml.toString());
    }
    
    // Store call info in session
    const gather = twiml.gather({
      input: 'speech dtmf',  // Accept both speech AND keypad input
      numDigits: 1,
      timeout: 10,  // Increased timeout
      speechTimeout: 'auto',  // Let Twilio auto-detect end of speech
      language: 'en-IN',  // English (India) - better for Indian accent
      hints: 'menu, hours, order, biryani, chicken, yes, no, hello',  // Common words
      speechModel: 'phone_call',  // Optimized for phone
      enhanced: true,  // Better accuracy
      profanityFilter: false,  // Don't filter words
      action: `/webhook/conversation?business_id=${business.id}`,
      method: 'POST',
      actionOnEmptyResult: true
    });
    
    // Greet the caller
    gather.say({
      voice: 'alice',
      language: 'en-IN'
    }, `Thank you for calling ${business.fields['Name']}. I'm Maya, your AI assistant. How can I help you today? You can also press 1 for menu or 2 for hours.`);
    
    // If caller doesn't say anything, ask again
    twiml.say({
      voice: 'alice',
      language: 'en-IN'
    }, 'I didn\'t hear anything. Please tell me how I can help you or press a number.');
    
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
      language: 'en-IN'
    }, 'I\'m sorry, I\'m having technical difficulties. Please try calling back in a few moments.');
    
    res.type('text/xml').send(twiml.toString());
  }
};

// This handles the conversation after the caller speaks
exports.handleConversation = async (req, res) => {
  console.log('\n========== CONVERSATION DEBUG ==========');
  console.log('1. Call SID:', req.body.CallSid);
  console.log('2. Speech Result:', req.body.SpeechResult);
  console.log('3. Speech Confidence:', req.body.Confidence);
  console.log('4. Digits Pressed:', req.body.Digits);
  console.log('5. All Request Keys:', Object.keys(req.body));
  console.log('=======================================\n');
  
  try {
    const businessId = req.query.business_id;
    const callSid = req.body.CallSid;
    let userInput = req.body.SpeechResult || '';
    
    // Handle DTMF (keypad) input
    if (req.body.Digits) {
      const digit = req.body.Digits;
      if (digit === '1') {
        userInput = 'What is your menu?';
      } else if (digit === '2') {
        userInput = 'What are your hours?';
      } else {
        userInput = `User pressed ${digit}`;
      }
      console.log('📱 Converted digit to:', userInput);
    }
    
    // Check if we got any input
    if (!userInput || userInput.trim() === '') {
      console.log('❌ No speech or digit detected!');
      const twiml = new twilio.twiml.VoiceResponse();
      
      twiml.say({
        voice: 'alice',
        language: 'en-IN'
      }, 'I didn\'t catch that. Could you please speak more clearly or press 1 for menu, 2 for hours?');
      
      const gather = twiml.gather({
        input: 'speech dtmf',
        numDigits: 1,
        timeout: 10,
        speechTimeout: 'auto',
        language: 'en-IN',
        hints: 'yes, no, menu, hours, order',
        speechModel: 'phone_call',
        enhanced: true,
        action: `/webhook/conversation?business_id=${businessId}`,
        method: 'POST',
        actionOnEmptyResult: true
      });
      
      return res.type('text/xml').send(twiml.toString());
    }
    
    // Get business details
    const business = await airtableService.getBusinessById(businessId);
    
    // Get conversation history (if any)
    const conversationHistory = await airtableService.getCallHistory(callSid);
    
    // Generate AI response
    console.log('🤖 Sending to AI:', userInput);
    const aiResponse = await aiService.generateResponse(
      business,
      conversationHistory,
      userInput
    );
    console.log('🤖 AI Response:', aiResponse.message);
    
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
      language: 'en-IN'
    }, aiResponse.message);
    
    // Continue conversation or end call
    if (aiResponse.continueConversation) {
      const gather = twiml.gather({
        input: 'speech dtmf',
        numDigits: 1,
        timeout: 10,
        speechTimeout: 'auto',
        language: 'en-IN',
        hints: 'yes, no, done, finished, bye, order, menu',
        speechModel: 'phone_call',
        enhanced: true,
        profanityFilter: false,
        action: `/webhook/conversation?business_id=${businessId}`,
        method: 'POST',
        actionOnEmptyResult: true
      });
      
      // Note: This is still here but should be removed by your AI prompt
      gather.say({
        voice: 'alice',
        language: 'en-IN'
      }, 'Is there anything else I can help you with?');
    } else {
      twiml.say({
        voice: 'alice',
        language: 'en-IN'
      }, `Thank you for calling ${business.fields['Name']}. Have a great day!`);
    }
    
    res.type('text/xml').send(twiml.toString());
    
  } catch (error) {
    console.error('❌ Error in conversation:', error);
    console.error('Error details:', error.message);
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({
      voice: 'alice',
      language: 'en-IN'
    }, 'I apologize, but I\'m having trouble processing your request. Please try speaking slowly and clearly, or press 1 for menu.');
    
    // Give them another chance
    const gather = twiml.gather({
      input: 'speech dtmf',
      numDigits: 1,
      timeout: 10,
      speechTimeout: 'auto',
      language: 'en-IN',
      action: `/webhook/conversation?business_id=${req.query.business_id}`,
      method: 'POST'
    });
    
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