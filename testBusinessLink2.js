require('dotenv').config();
const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_BUSINESSES);

// Get a business record
base('Businesses').select({ maxRecords: 1 }).firstPage((err, businesses) => {
  if (err || businesses.length === 0) {
    console.error('Error getting business:', err);
    return;
  }
  
  const businessId = businesses[0].id;
  console.log('Found business:', businesses[0].fields['Name']);
  console.log('Business ID:', businessId);
  
  // Try creating a call log with this business
  base('Call Logs').create([{
    fields: {
      'Business': [businessId],
      'Caller Number': '+1234567890',
      'Call Date': new Date().toISOString(),
      'Status': 'Completed'
    }
  }], (err, records) => {
    if (err) {
      console.error('❌ Error:', err.message);
    } else {
      console.log('✅ Call log created successfully!');
      console.log('Record ID:', records[0].id);
      
      // Clean up
      base('Call Logs').destroy(records[0].id, () => {
        console.log('Test record deleted');
      });
    }
  });
});