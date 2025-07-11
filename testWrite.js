require('dotenv').config();
const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_BUSINESSES);

// Test writing a call log with correct status
base('Call Logs').create([
  {
    fields: {
      'Caller Number': '+1234567890',
      'Call Date': new Date().toISOString(),
      'Status': 'Completed',  // Changed from 'Test' to valid option
      'Call SID': 'test123',
      'Intent': 'Info',  // Adding this as it might be required
      'Duration': 60,
      'Transcript': 'Test call transcript'
    }
  }
], (err, records) => {
  if (err) {
    console.error('❌ Error:', err.message);
    return;
  }
  console.log('✅ Successfully created call log!');
  console.log('Check your Airtable - you should see the record');
});