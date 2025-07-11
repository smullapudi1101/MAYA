require('dotenv').config();
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

console.log('Testing OpenAI connection...');

async function testOpenAI() {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are MAYA, a helpful AI assistant." },
        { role: "user", content: "Say hello and confirm you're working!" }
      ],
      max_tokens: 50
    });
    
    console.log('✅ OpenAI connected successfully!');
    console.log('AI Response:', completion.choices[0].message.content);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testOpenAI();