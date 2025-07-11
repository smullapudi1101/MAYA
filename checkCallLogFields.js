require('dotenv').config();
const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_BUSINESSES);

console.log('Checking Call Logs table structure...\n');

// Get the schema info
base('Call Logs').select({ maxRecords: 1 }).firstPage((err, records) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  
  console.log('Call Logs table fields:');
  console.log('(Check your Airtable to see the exact field names)');
  
  // Try creating a minimal record
  base('Call Logs').create([{
    fields: {
      'Caller Number': '+1234567890',
      'Call Date': new Date().toISOString(),
      'Status': 'Completed'
    }
  }], (err, records) => {
    if (err) {
      console.error('\n❌ Error creating record:', err.message);
      console.log('\nThis error tells us what fields are missing or incorrect');
    } else {
      console.log('\n✅ Basic record created successfully!');
      // Clean up
      base('Call Logs').destroy(records[0].id, () => {
        console.log('Test record deleted');
      });
    }
  });
});