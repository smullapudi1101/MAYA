// api/services/groqAiService.js - Enhanced with order confirmation logic

const Groq = require('groq-sdk');

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Track conversation state for each call
const conversationStates = new Map();

// Generate AI response using Groq
exports.generateResponse = async (business, conversationHistory, userInput, callSid) => {
  console.log('🚀 Generating Groq AI response for:', userInput);
  
  try {
    // Get or create conversation state
    if (!conversationStates.has(callSid)) {
      conversationStates.set(callSid, {
        turnCount: 0,
        hasOrderDetails: false,
        hasConfirmed: false,
        conversationStage: 'greeting' // greeting, ordering, confirming, complete
      });
    }
    
    const state = conversationStates.get(callSid);
    state.turnCount++;
    
    // Update conversation stage based on content
    updateConversationStage(state, conversationHistory, userInput);
    
    // Check if we're in order confirmation stage
    const isOrderReady = state.conversationStage === 'confirming';
    const systemPrompt = buildSystemPrompt(business, isOrderReady, state);
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...formatConversationHistory(conversationHistory),
      { role: 'user', content: userInput }
    ];
    
    // Call Groq API with Llama 3
    const completion = await groq.chat.completions.create({
      model: 'llama3-70b-8192',
      messages: messages,
      temperature: 0.7,
      max_tokens: 200
    });
    
    let aiResponse = completion.choices[0].message.content;
    
    // Clean the response
    aiResponse = cleanResponse(aiResponse);
    
    // Extract order details if present
    const action = extractActionFromConversation(conversationHistory, userInput, aiResponse);
    if (action && action.type === 'order') {
      state.hasOrderDetails = true;
    }
    
    // Determine if conversation should end
    const shouldEnd = determineConversationEnd(state, userInput, aiResponse);
    
    // Clean up state if ending
    if (shouldEnd) {
      conversationStates.delete(callSid);
    }
    
    return {
      message: aiResponse,
      intent: detectIntent(userInput, conversationHistory),
      continueConversation: !shouldEnd,
      action: action
    };
    
  } catch (error) {
    console.error('❌ Groq API error:', error);
    return getFallbackResponse(userInput);
  }
};

function buildSystemPrompt(business, isOrderReady, state) {
  const businessInfo = business.fields;
  
  const basePrompt = `You are Maya, a HUMAN assistant for ${businessInfo['Name']}.

PERSONALITY: You are friendly, warm, and conversational. Speak naturally like a real person, not a robot.

IMPORTANT: Always respond in ENGLISH only, regardless of what language the customer uses.

Business: ${businessInfo['Name']}
Type: ${businessInfo['Business Type']}
Hours: ${businessInfo['Business Hours'] || 'Mon-Sun 11AM-10PM'}
Menu: ${businessInfo['Menu Items'] || 'Full menu available'}

CONVERSATION STATE: Turn ${state.turnCount}, Stage: ${state.conversationStage}

NATURAL SPEECH RULES:
1. Use contractions: "I'm", "you're", "that's", "we're", "it's"
2. Be conversational: "Sure!", "Alright", "Got it", "No problem"
3. Show personality: "That's a great choice!", "Mmm, that's our most popular item"
4. Use natural transitions: "So", "Well", "Actually", "By the way"
5. NEVER ask "Is there anything else I can help you with?"
6. Keep responses concise and natural
7. Sound enthusiastic about the food

GOOD EXAMPLES:
"Hi there! Thanks for calling. What can I get started for you today?"
"Oh, the chicken biryani? Great choice! That's actually our specialty. How many would you like?"
"Alright, so that's 2 chicken biryani... comes to $30. Sound good?"
"Perfect! We'll have that ready for you in about 30 minutes."`;

  // Stage-specific instructions
  let stagePrompt = '';
  
  if (state.conversationStage === 'confirming' || isOrderReady) {
    stagePrompt = `

CONFIRMATION STAGE: Now wrap up the order naturally:
1. Say something like "Alright, let me make sure I got everything..."
2. List their items conversationally
3. Give the total in a friendly way
4. Ask for confirmation casually: "Sound good?" or "Is that right?"`;
  } else if (state.turnCount >= 3 && state.hasOrderDetails) {
    stagePrompt = `

Time to confirm their order. Use natural language like:
"Okay, so I've got [items] for you. That'll be [total]. Sound good?"`;
  } else if (state.turnCount >= 5) {
    stagePrompt = `

This conversation is getting long. Help them finish up naturally without being pushy.`;
  }

  return basePrompt + stagePrompt;
}

function updateConversationStage(state, conversationHistory, userInput) {
  const fullText = (conversationHistory + ' ' + userInput).toLowerCase();
  
  // Check what stage we're in
  if (state.conversationStage === 'greeting' && 
      (fullText.includes('order') || fullText.includes('biryani') || fullText.includes('food'))) {
    state.conversationStage = 'ordering';
  } else if (state.conversationStage === 'ordering' && state.hasOrderDetails && state.turnCount >= 2) {
    state.conversationStage = 'confirming';
  } else if (state.conversationStage === 'confirming' && 
            (userInput.toLowerCase().includes('yes') || 
             userInput.toLowerCase().includes('confirm') || 
             userInput.toLowerCase().includes('correct'))) {
    state.conversationStage = 'complete';
    state.hasConfirmed = true;
  }
}

function determineConversationEnd(state, userInput, aiResponse) {
  // Explicit end conditions
  const explicitEnd = checkIfUserWantsToEnd(userInput);
  
  // Order confirmed
  const orderConfirmed = state.conversationStage === 'complete' || state.hasConfirmed;
  
  // Conversation too long
  const tooLong = state.turnCount >= 6;
  
  // AI said goodbye
  const aiSaidGoodbye = aiResponse.toLowerCase().includes('thank you for calling') || 
                       aiResponse.toLowerCase().includes('have a great day');
  
  // No meaningful progress after multiple turns
  const noProgress = state.turnCount >= 4 && !state.hasOrderDetails;
  
  if (explicitEnd || orderConfirmed || tooLong || aiSaidGoodbye || noProgress) {
    console.log(`📍 Ending conversation - Reason: ${
      explicitEnd ? 'User wants to end' :
      orderConfirmed ? 'Order confirmed' :
      tooLong ? 'Too many turns' :
      aiSaidGoodbye ? 'AI said goodbye' :
      noProgress ? 'No progress' : 'Unknown'
    }`);
    return true;
  }
  
  return false;
}

function checkIfOrderReady(conversationHistory) {
  // Check if customer has ordered items and we haven't confirmed yet
  const hasOrdered = conversationHistory.toLowerCase().includes('biryani') ||
                    conversationHistory.toLowerCase().includes('order') ||
                    conversationHistory.toLowerCase().includes('samosa') ||
                    conversationHistory.toLowerCase().includes('curry');
  
  const hasConfirmed = conversationHistory.toLowerCase().includes('is this correct') ||
                      conversationHistory.toLowerCase().includes('confirm your order');
  
  return hasOrdered && !hasConfirmed;
}

function extractActionFromConversation(history, userInput, aiResponse) {
  // Extract order details from conversation
  const fullConversation = history + '\n' + userInput + '\n' + aiResponse;
  
  // Simple pattern matching for orders
  const orderPattern = /(\d+)\s*(chicken|mutton|vegetable|veg|paneer)\s*biryani/gi;
  const samosaPattern = /(\d+)\s*(vegetable|veg|chicken)?\s*samosa/gi;
  
  const items = [];
  let match;
  
  while ((match = orderPattern.exec(fullConversation)) !== null) {
    items.push({
      name: `${match[2]} biryani`,
      quantity: parseInt(match[1]) || 1,
      price: 15
    });
  }
  
  while ((match = samosaPattern.exec(fullConversation)) !== null) {
    items.push({
      name: `${match[2] || 'vegetable'} samosa`,
      quantity: parseInt(match[1]) || 1,
      price: 5
    });
  }
  
  if (items.length > 0) {
    const total = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    
    return {
      type: 'order',
      data: {
        items: items,
        total: total,
        pickup_time: '30 minutes',
        customer_name: 'Phone Order'
      }
    };
  }
  
  return null;
}

function cleanResponse(response) {
  // Remove annoying phrases
  const annoyingPhrases = [
    /Is there anything else.*?\?/gi,
    /What else can.*?\?/gi,
    /Can I help you with anything else.*?\?/gi,
    /How else can I.*?\?/gi,
    /Anything else.*?\?/gi
  ];
  
  let cleaned = response;
  annoyingPhrases.forEach(phrase => {
    cleaned = cleaned.replace(phrase, '');
  });
  
  return cleaned.trim();
}

function checkIfUserWantsToEnd(userInput) {
  const input = userInput.toLowerCase().trim();
  
  // Exact match phrases
  const exactEndPhrases = ['no', 'nope', 'done', 'bye', 'goodbye', 'thanks', 'thank you'];
  if (exactEndPhrases.includes(input)) {
    return true;
  }
  
  // Contextual end phrases (must be more specific)
  const contextualEndPhrases = [
    "that's all",
    "nothing else", 
    "no thanks",
    "i'm done",
    "i'm good",
    "all set",
    "that is all",
    "finished",
    "no more"
  ];
  
  // Check for contextual phrases
  if (contextualEndPhrases.some(phrase => input.includes(phrase))) {
    return true;
  }
  
  // Make sure "no" is standalone, not part of "know" or "another"
  const words = input.split(/\s+/);
  if (words.includes('no') && !input.includes('know') && !input.includes('another')) {
    return true;
  }
  
  return false;
}

function formatConversationHistory(history) {
  if (!history) return [];
  const messages = [];
  const lines = history.split('\n');
  
  lines.forEach(line => {
    if (line.startsWith('Customer:')) {
      messages.push({ role: 'user', content: line.replace('Customer: ', '') });
    } else if (line.startsWith('AI:')) {
      messages.push({ role: 'assistant', content: line.replace('AI: ', '') });
    }
  });
  
  return messages;
}

function detectIntent(userInput, conversationHistory) {
  const input = userInput.toLowerCase();
  const history = conversationHistory.toLowerCase();
  
  // Look for specific keywords in current input and history
  if (input.includes('order') || input.includes('biryani') || input.includes('samosa') || 
      input.includes('chicken') || input.includes('food') || input.includes('menu') ||
      history.includes('order') || history.includes('biryani')) {
    return 'order';
  } else if (input.includes('hours') || input.includes('open') || input.includes('close') || 
             input.includes('timing')) {
    return 'info';
  } else if (input.includes('book') || input.includes('appointment') || input.includes('reservation') ||
             input.includes('table')) {
    return 'booking';
  } else {
    return 'general';
  }
}

function getFallbackResponse(userInput) {
  const intent = detectIntent(userInput, '');
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
      message: "I can help you with a reservation. What date and time?", 
      intent: 'booking', 
      continueConversation: true, 
      action: null 
    },
    general: { 
      message: "I can help you with orders, hours, or reservations.", 
      intent: 'general', 
      continueConversation: true, 
      action: null 
    }
  };
  return responses[intent] || responses.general;
}