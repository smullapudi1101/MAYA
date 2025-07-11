// api/services/aiService.js - Improved conversation handling

const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Track conversation state
const conversationState = new Map();

// Generate AI response based on business context and user input
exports.generateResponse = async (business, conversationHistory, userInput) => {
  console.log('🤖 Generating AI response for:', userInput);
  
  try {
    // Build system prompt with business context
    const systemPrompt = buildSystemPrompt(business);
    
    // Build conversation messages
    const messages = [
      { role: 'system', content: systemPrompt },
      ...formatConversationHistory(conversationHistory),
      { role: 'user', content: userInput }
    ];
    
    // Call OpenAI API - simplified without functions for now
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
      max_tokens: 150
    });
    
    // Get the response
    const aiResponse = completion.choices[0].message.content;
    
    // Check if conversation should end
    const userWantsToEnd = userInput.toLowerCase().match(/\b(no|nothing|that'?s all|goodbye|bye|done|finished|thank you that'?s all|thanks|no thanks|that is all)\b/);
    const shouldEnd = userWantsToEnd || aiResponse.toLowerCase().includes('have a great day') || aiResponse.toLowerCase().includes('goodbye');
    
    return {
      message: aiResponse,
      intent: detectIntent(userInput),
      continueConversation: !shouldEnd,
      action: null
    };
    
  } catch (error) {
    console.error('❌ OpenAI API error:', error);
    console.error('Error details:', error.message);
    
    // Fallback response based on intent
    return getFallbackResponse(userInput);
  }
};

// Build better system prompt
function buildSystemPrompt(business) {
  const businessInfo = business.fields;
  
  return `You are Maya, an AI assistant for ${businessInfo['Name']}, a ${businessInfo['Business Type']}.

CRITICAL RULES:
1. NEVER ask "How can I help you?" more than once
2. Listen to what the customer says and respond accordingly
3. If they tell you their name, remember it and use it
4. Be conversational and natural, not robotic
5. Keep responses short and to the point (1-2 sentences max)
6. When they say they're done, say goodbye immediately

Business Details:
- Hours: ${businessInfo['Business Hours'] || 'Mon-Sun 11AM-10PM'}
- Type: ${businessInfo['Business Type']}
- Services: ${businessInfo['Services'] || 'Full menu available'}

Example good conversation:
Customer: "Hi, I'd like to order a pizza"
You: "Great! What size pizza would you like?"
Customer: "Large pepperoni"
You: "Perfect, one large pepperoni pizza. Would you like anything else?"
Customer: "No that's all"
You: "Your large pepperoni pizza will be ready in 20 minutes for pickup. Thank you for calling ${businessInfo['Name']}!"

Remember: Be helpful but brief. Don't repeat questions.`;
}

// Format conversation history
function formatConversationHistory(history) {
  if (!history) return [];
  
  const messages = [];
  const lines = history.split('\n');
  
  lines.forEach(line => {
    if (line.startsWith('Customer:')) {
      messages.push({ 
        role: 'user', 
        content: line.replace('Customer: ', '') 
      });
    } else if (line.startsWith('AI:')) {
      messages.push({ 
        role: 'assistant', 
        content: line.replace('AI: ', '') 
      });
    }
  });
  
  return messages;
}

// Simple intent detection
function detectIntent(userInput) {
  const input = userInput.toLowerCase();
  
  if (input.includes('order') || input.includes('pizza') || input.includes('food')) {
    return 'order';
  } else if (input.includes('hours') || input.includes('open') || input.includes('close')) {
    return 'info';
  } else if (input.includes('book') || input.includes('appointment') || input.includes('reservation')) {
    return 'booking';
  } else {
    return 'general';
  }
}

// Fallback responses when OpenAI fails
function getFallbackResponse(userInput) {
  const intent = detectIntent(userInput);
  
  const responses = {
    order: {
      message: "I'd be happy to take your order. What would you like?",
      intent: 'order',
      continueConversation: true,
      action: null
    },
    info: {
      message: "We're open Monday through Sunday, 11AM to 10PM. Is there anything else you'd like to know?",
      intent: 'info',
      continueConversation: true,
      action: null
    },
    booking: {
      message: "I can help you with a reservation. What date and time would you prefer?",
      intent: 'booking',
      continueConversation: true,
      action: null
    },
    general: {
      message: "I can help you with orders, hours, or reservations. What would you like?",
      intent: 'general',
      continueConversation: true,
      action: null
    }
  };
  
  return responses[intent] || responses.general;
}

// Placeholder for functions - not using them for now to improve stability
function getAvailableFunctions(business) {
  return [];
}

// Calculate order total
function calculateOrderTotal(items) {
  let total = 0;
  items.forEach(item => {
    total += item.quantity * 10;
  });
  return total;
}