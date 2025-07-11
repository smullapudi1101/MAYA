require('dotenv').config();
const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_BUSINESSES);

async function test() {
  try {
    // Get a business record
    const businesses = await base('Businesses').select({ maxRecords: 1 }).firstPage();
    const businessId = businesses[0].id;
    console.log('Business ID:', businessId);
    console.log('Business Name:', businesses[0].fields['Name']);
    
    // Test different formats
    console.log('\nTesting Business field format...');
    
    // Try format 1: Array with ID
    try {
      const record1 = await base('Call Logs').create([{
        fields: {
          'Business': [businessId],
          'Caller Number': '+1111111111',
          'Call Date': new Date().toISOString(),
          'Status': 'Test1'
        }
      }]);
      console.log('✅ Format 1 worked: [businessId]');
      await base('Call Logs').destroy(record1[0].id);
    } catch (e) {
      console.log('❌ Format 1 failed:', e.message);
    }
    
    // Try format 2: Just the ID
    try {
      const record2 = await base('Call Logs').create([{
        fields: {
          'Business': businessId,
          'Caller Number': '+2222222222',
          'Call Date': new Date().toISOString(),
          'Status': 'Test2'
        }
      }]);
      console.log('✅ Format 2 worked: businessId');
      await base('Call Logs').destroy(record2[0].id);
    } catch (e) {
      console.log('❌ Format 2 failed:', e.message);
    }
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

test();