require('dotenv').config();
const Airtable = require('airtable');

console.log('Testing Airtable...');
console.log('API Key exists:', !!process.env.AIRTABLE_API_KEY);
console.log('Base ID:', process.env.AIRTABLE_BASE_BUSINESSES);

try {
  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
    .base(process.env.AIRTABLE_BASE_BUSINESSES);
  
  base('Businesses').select({
    maxRecords: 1
  }).firstPage()
    .then(records => {
      console.log('✅ SUCCESS! Connected to Airtable');
      console.log('Found', records.length, 'records');
      if (records.length > 0) {
        console.log('Business Name:', records[0].get('Name'));
      }
    })
    .catch(err => {
      console.error('❌ Error:', err.message);
      if (err.statusCode === 404) {
        console.log('\nPossible issues:');
        console.log('1. Token needs "data.records:read" scope');
        console.log('2. Base not added to token access');
        console.log('3. Table not named exactly "Businesses"');
      }
    });
} catch (error) {
  console.error('Setup error:', error.message);
}