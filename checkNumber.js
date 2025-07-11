require('dotenv').config();
const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_BUSINESSES);

console.log('=== CHECKING PHONE NUMBER MATCH ===\n');
console.log('Your Twilio number from .env file:');
console.log(process.env.TWILIO_PHONE_NUMBER);
console.log('\nChecking Airtable...\n');

base('Businesses').select().firstPage((err, records) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  
  records.forEach(record => {
    console.log('Business:', record.get('Name'));
    console.log('Forwarding Number in Airtable:', record.get('Forwarding Number'));
    console.log('Do they match?', record.get('Forwarding Number') === process.env.TWILIO_PHONE_NUMBER);
    console.log('---');
  });
  
  console.log('\n💡 The Forwarding Number in Airtable must EXACTLY match your Twilio number!');
  console.log('   Including the country code (+1 for US)');
});