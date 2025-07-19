// api/webhooks/voice.js - Optimized for speed with minimal Airtable calls

const twilio = require('twilio');
const aiService = require('../services/groqAiService');
const airtableService = require('../services/airtableService');

// In-memory conversation storage for active calls
const activeConversations = new Map();

// This handles the initial incoming call
exports.handleIncomingCall = async (req, res) => {
  console.log('📞 Incoming call from:', req.body.From);
  
  try {
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Get business info (only Airtable call at start)
    const business = await airtableService.getBusinessByForwardingNumber(req.body.To);
    
    if (!business) {
      twiml.say({
        voice: 'Polly.Joanna',
        language: 'en-US'
      }, 'Sorry, I cannot find the business information. Please try again later.');
      
      return res.type('text/xml').send(twiml.toString());
    }
    
    // Initialize conversation in memory
    activeConversations.set(req.body.CallSid, {
      businessId: business.id,
      businessName: business.fields['Name'],
      callerNumber: req.body.From,
      startTime: new Date(),
      transcript: [],
      orderDetails: null,
      appointmentDetails: null
    });
    
    const gather = twiml.gather({
      input: 'speech dtmf',
      numDigits: 1,
      timeout: 10,
      speechTimeout: 'auto',
      language: 'en-UK',
      hints: 'menu, hours, order, biryani, chicken, yes, no, hello',
      speechModel: 'phone_call',
      enhanced: true,
      profanityFilter: false,
      action: `/webhook/conversation?business_id=${business.id}`,
      method: 'POST',
      actionOnEmptyResult: true
    });
    
    gather.say({
      voice: 'alice',
      language: 'en-UK'
    }, `Thank you for calling ${business.fields['Name']}. I'm Jennifer, your AI assistant. How can I help you today?`);
    
    twiml.say({
      voice: 'alice',
      language: 'en-UK'
    }, 'I didn\'t hear anything. Please tell me how I can help you or press a number.');
    
    res.type('text/xml').send(twiml.toString());
    
  } catch (error) {
    console.error('Error handling incoming call:', error);
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({
      voice: 'Polly.Joanna',
      language: 'en-US'
    }, 'I\'m sorry, I\'m having technical difficulties. Please try calling back in a few moments.');
    
    res.type('text/xml').send(twiml.toString());
  }
};

// This handles the conversation after the caller speaks
exports.handleConversation = async (req, res) => {
  console.log('\n========== CONVERSATION ==========');
  console.log('Speech:', req.body.SpeechResult);
  console.log('Digits:', req.body.Digits);
  console.log('=================================\n');
  
  try {
    const businessId = req.query.business_id;
    const callSid = req.body.CallSid;
    let userInput = req.body.SpeechResult || '';
    
    // Get conversation from memory
    const conversation = activeConversations.get(callSid);
    if (!conversation) {
      throw new Error('Conversation not found in memory');
    }
    
    // Handle DTMF input
    if (req.body.Digits) {
      const digit = req.body.Digits;
      if (digit === '1') userInput = 'What is your menu?';
      else if (digit === '2') userInput = 'What are your hours?';
      else userInput = `User pressed ${digit}`;
    }
    
    // Check for empty input
    if (!userInput || userInput.trim() === '') {
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say({
        voice: 'Polly.Joanna',
        language: 'en-US'
      }, 'I didn\'t catch that. Could you please repeat that?');
      
      const gather = twiml.gather({
        input: 'speech dtmf',
        numDigits: 1,
        timeout: 10,
        speechTimeout: 'auto',
        language: 'en-UK',
        hints: 'yes, no, menu, hours, order',
        speechModel: 'phone_call',
        enhanced: true,
        action: `/webhook/conversation?business_id=${businessId}`,
        method: 'POST',
        actionOnEmptyResult: true
      });
      
      return res.type('text/xml').send(twiml.toString());
    }
    
    // Add to transcript
    conversation.transcript.push(`Customer: ${userInput}`);
    
    // Get business details (from cache if possible)
    const business = await airtableService.getBusinessById(businessId);
    
    // Build conversation history from memory
    const conversationHistory = conversation.transcript.join('\n');
    
    // Generate AI response
    const aiResponse = await aiService.generateResponse(
      business,
      conversationHistory,
      userInput,
      callSid  // Pass callSid for state tracking
    );
    
    // Add AI response to transcript
    conversation.transcript.push(`AI: ${aiResponse.message}`);
    
    // Extract order/appointment details if present
    if (aiResponse.action) {
      if (aiResponse.action.type === 'order') {
        conversation.orderDetails = aiResponse.action.data;
      } else if (aiResponse.action.type === 'booking') {
        conversation.appointmentDetails = aiResponse.action.data;
      }
    }
    
    // Create TwiML response
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Check for confirmation or completion
    const isConfirmation = userInput.toLowerCase().includes('yes') || 
                          userInput.toLowerCase().includes('confirm') ||
                          userInput.toLowerCase().includes('correct') ||
                          userInput.toLowerCase().includes('that\'s right');
    
    const hasOrderInConversation = conversation.transcript.some(line => 
      line.toLowerCase().includes('biryani') || 
      line.toLowerCase().includes('order') ||
      line.toLowerCase().includes('samosa')
    );
    
    const isOrderComplete = (conversation.orderDetails && isConfirmation) || 
                           (aiResponse.intent === 'order' && isConfirmation);
    const isBookingComplete = conversation.appointmentDetails && isConfirmation;
    
    // Force end if conversation is too long
    const conversationTurns = Math.floor(conversation.transcript.length / 2);
    const shouldForceEnd = conversationTurns >= 5;
    
    // Say the AI response with natural voice and SSML enhancements
    const enhancedMessage = addNaturalSSML(aiResponse.message);
    twiml.say({
      voice: 'Polly.Joanna',
      language: 'en-US'
    }, enhancedMessage);
    
    // Continue conversation or end call
    if (aiResponse.continueConversation && !isOrderComplete && !isBookingComplete && !shouldForceEnd) {
      const gather = twiml.gather({
        input: 'speech dtmf',
        numDigits: 1,
        timeout: 10,
        speechTimeout: 'auto',
        language: 'en-UK',
        hints: 'yes, no, done, finished, bye, order, menu, confirm',
        speechModel: 'phone_call',
        enhanced: true,
        profanityFilter: false,
        action: `/webhook/conversation?business_id=${businessId}`,
        method: 'POST',
        actionOnEmptyResult: true
      });
    } else {
      // Log why conversation ended
      console.log(`📍 Ending conversation - Order complete: ${isOrderComplete}, Booking complete: ${isBookingComplete}, Force end: ${shouldForceEnd}, AI decision: ${!aiResponse.continueConversation}`);
      
      // End of conversation - now save everything to Airtable
      await saveConversationToAirtable(callSid, conversation, business);
      
      // Final goodbye message
      if (!aiResponse.message.toLowerCase().includes('thank you for calling')) {
        twiml.say({
          voice: 'Polly.Joanna',
          language: 'en-US'
        }, `Thank you for calling ${business.fields['Name']}. Have a wonderful day!`);
      }
      
      // Clean up memory
      activeConversations.delete(callSid);
    }
    
    res.type('text/xml').send(twiml.toString());
    
  } catch (error) {
    console.error('❌ Error in conversation:', error);
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({
      voice: 'Polly.Joanna',
      language: 'en-US'
    }, 'I apologize, but I\'m having trouble understanding. Let me try to help you.');
    
    res.type('text/xml').send(twiml.toString());
  }
};

// Add SSML to make speech more natural
function addNaturalSSML(text) {
  // Add pauses and emphasis for more natural speech
  let enhanced = text;
  
  // Add slight pauses after punctuation
  enhanced = enhanced.replace(/\./g, '.<break time="300ms"/>');
  enhanced = enhanced.replace(/,/g, ',<break time="200ms"/>');
  enhanced = enhanced.replace(/\?/g, '?<break time="300ms"/>');
  
  // Add emphasis to certain words
  enhanced = enhanced.replace(/\btotal\b/gi, '<emphasis level="moderate">total</emphasis>');
  enhanced = enhanced.replace(/\bconfirm\b/gi, '<emphasis level="moderate">confirm</emphasis>');
  enhanced = enhanced.replace(/\bthank you\b/gi, '<prosody rate="95%">thank you</prosody>');
  
  // Wrap in speak tags for SSML
  return `<speak>${enhanced}</speak>`;
}

// Save everything to Airtable at the end
async function saveConversationToAirtable(callSid, conversation, business) {
  console.log('💾 Saving conversation to Airtable...');
  
  try {
    // Calculate call duration
    const duration = Math.round((new Date() - conversation.startTime) / 1000);
    
    // Determine intent from conversation
    let intent = 'general';
    if (conversation.orderDetails) intent = 'order';
    else if (conversation.appointmentDetails) intent = 'booking';
    
    // Create call log with full transcript
    await airtableService.createCallLog({
      business_id: business.id,
      caller_number: conversation.callerNumber,
      call_sid: callSid,
      status: 'Completed',
      transcript: conversation.transcript.join('\n'),
      intent: intent,
      duration: duration
    });
    
    // Create order if applicable
    if (conversation.orderDetails) {
      await airtableService.createOrder({
        business_id: business.id,
        ...conversation.orderDetails,
        customer_phone: conversation.callerNumber
      });
    }
    
    // Create appointment if applicable  
    if (conversation.appointmentDetails) {
      await airtableService.createAppointment({
        business_id: business.id,
        ...conversation.appointmentDetails,
        customer_phone: conversation.callerNumber
      });
    }
    
    console.log('✅ Conversation saved successfully');
    
  } catch (error) {
    console.error('❌ Error saving to Airtable:', error);
    // Don't throw - we don't want to break the call flow
  }
}

// Cleanup old conversations periodically (every hour)
setInterval(() => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  for (const [callSid, conversation] of activeConversations.entries()) {
    if (conversation.startTime < oneHourAgo) {
      console.log(`🧹 Cleaning up old conversation: ${callSid}`);
      activeConversations.delete(callSid);
    }
  }
}, 60 * 60 * 1000);