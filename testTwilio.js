require('dotenv').config();
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

console.log('Testing Twilio connection...');
console.log('Account SID:', accountSid.substring(0, 10) + '...');
console.log('Twilio Number:', process.env.TWILIO_PHONE_NUMBER);

// Test by getting your number details
client.incomingPhoneNumbers
  .list({limit: 1})
  .then(numbers => {
    console.log('✅ Twilio connection successful!');
    console.log('Your Twilio number:', numbers[0].phoneNumber);
    console.log('Voice enabled:', numbers[0].capabilities.voice);
  })
  .catch(error => console.error('❌ Error:', error.message));