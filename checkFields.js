require('dotenv').config();
const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_BUSINESSES);

base('Businesses').select({ maxRecords: 1 }).firstPage((err, records) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  
  if (records.length > 0) {
    console.log('Available fields in your table:');
    console.log(Object.keys(records[0].fields));
    console.log('\nAll field values:');
    console.log(records[0].fields);
  }
});