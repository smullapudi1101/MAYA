require('dotenv').config();
const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_BUSINESSES);

console.log('Testing Airtable connection...');
console.log('Base ID:', process.env.AIRTABLE_BASE_BUSINESSES);

// Add a timeout to see results
setTimeout(() => {
  base('Businesses').select({
    maxRecords: 3,
    view: "Grid view"
  }).eachPage(function page(records, fetchNextPage) {
    console.log(`\n✅ Connected! Found ${records.length} records:`);
    
    records.forEach(function(record) {
      console.log('\nRecord ID:', record.id);
      console.log('Business Name:', record.get('Name'));
      console.log('All fields:', record.fields);
    });
    
  }, function done(err) {
    if (err) { 
      console.error('❌ Error:', err); 
      return;
    }
    console.log('\n✅ Airtable test complete!');
    process.exit(0);
  });
}, 1000);