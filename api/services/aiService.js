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
      model: 'gpt-4o',
      messages: messages,
      temperature: 0.7,
      max_tokens: 150
    });
    
  // Get the response
const aiResponse = completion.choices[0].message.content;

// Aggressively remove any form of "anything else" questions
let cleanedMessage = aiResponse;

// List of phrases to remove
const annoyingPhrases = [
  /Is there anything else.*?\?/gi,
  /What else can.*?\?/gi,
  /Can I help you with anything else.*?\?/gi,
  /How else can I.*?\?/gi,
  /Do you need anything else.*?\?/gi,
  /Would you like anything else.*?\?/gi,
  /Anything else.*?\?/gi,
  /What else.*?\?/gi,
  /How can I.*help you.*?\?/gi,
  /Is there anything.*I can.*?\?/gi
];

// Remove all annoying phrases
annoyingPhrases.forEach(phrase => {
  cleanedMessage = cleanedMessage.replace(phrase, '');
});

// Also remove the sentences containing these phrases entirely
const sentences = cleanedMessage.split(/[.!?]+/);
const cleanSentences = sentences.filter(sentence => {
  const lower = sentence.toLowerCase();
  return !lower.includes('anything else') && 
         !lower.includes('help you with') &&
         !lower.includes('what else') &&
         !lower.includes('how else');
});

cleanedMessage = cleanSentences.join('. ').trim();
if (cleanedMessage && !cleanedMessage.endsWith('.')) {
  cleanedMessage += '.';
}
    
    // Check if conversation should end
    const userWantsToEnd = userInput.toLowerCase().match(/\b(no|nothing|that'?s all|goodbye|bye|done|finished|thank you that'?s all|thanks|no thanks|that is all)\b/);
    const shouldEnd = userWantsToEnd || cleanedMessage.toLowerCase().includes('have a great day') || cleanedMessage.toLowerCase().includes('goodbye');
    
    return {
      message: cleanedMessage,
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

RESTAURANT INFORMATION:
- Name: ${businessInfo['Name']}
- Type: Indian/Biryani Restaurant
- Specialty: Authentic Hyderabadi Biryani
- Hours: ${businessInfo['Business Hours'] || 'Mon-Sun 11AM-10PM'}

MENU KNOWLEDGE:
${businessInfo['Menu Items'] || 'Full menu available'}

CRITICAL RULES:
1. NEVER ask "Is there anything else I can help you with?"
2. When asked about menu, mention specific items
3. Recommend the Biryani as the specialty
4. For spice levels, mention mild/medium/hot available
5. Answer directly without asking if they need more help

GOOD RESPONSES:
Customer: "What do you serve?"
You: "We specialize in authentic Hyderabadi Biryani. We have chicken, mutton, vegetable, and shrimp biryani. We also serve appetizers like samosas and chicken 65, various curries, and fresh naan bread."

Customer: "Do you have vegetarian options?"
You: "Yes, we have vegetable biryani, paneer tikka, palak paneer, dal tadka, and vegetable samosas."

Remember: Be helpful about the menu but don't ask if they need anything else.`;
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
      message: "We're open Monday through Sunday, 11AM to 10PM.",
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