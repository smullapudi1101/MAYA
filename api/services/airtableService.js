// api/services/airtableService.js - Handles all database operations with Airtable

const Airtable = require('airtable');

// Configure Airtable
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_BUSINESSES);

// Get business by forwarding number (the Twilio number that received the call)
exports.getBusinessByForwardingNumber = async (phoneNumber) => {
  console.log('🔍 Looking up business by forwarding number:', phoneNumber);
  
  try {
    const records = await base('Businesses')
      .select({
        filterByFormula: `{Forwarding Number} = "${phoneNumber}"`,
        maxRecords: 1
      })
      .firstPage();
    
    if (records.length > 0) {
      console.log('✅ Found business:', records[0].fields['Business Name']);
      return records[0];
    } else {
      console.log('❌ No business found for number:', phoneNumber);
      return null;
    }
  } catch (error) {
    console.error('Error fetching business:', error);
    return null;
  }
};

// Get business by ID
exports.getBusinessById = async (businessId) => {
  try {
    const record = await base('Businesses').find(businessId);
    return record;
  } catch (error) {
    console.error('Error fetching business by ID:', error);
    return null;
  }
};

// Create a new call log entry
exports.createCallLog = async (callData) => {
  console.log('📝 Creating call log');
  
  try {
    const fields = {
      'Caller Number': callData.caller_number || 'Unknown',
      'Call Date': new Date().toISOString(),
      'Status': callData.status || 'Started'
    };
    
    // Add Business link if provided
    if (callData.business_id) {
      fields['Business'] = [callData.business_id];  // Must be an array!
    }
    
    // Add Call SID if provided
    if (callData.call_sid) {
      fields['Call SID'] = callData.call_sid;
    }
    
    const record = await base('Call Logs').create([{ fields }]);
    
    console.log('✅ Call log created successfully:', record[0].id);
    return record[0];
  } catch (error) {
    console.error('❌ Error creating call log:', error.message);
    return null;
  }
};

// Update call log with transcript and other details
exports.updateCallLog = async (callSid, updates) => {
  console.log('📝 Updating call log for:', callSid);
  
  try {
    // First find the record by Call SID
    const records = await base('Call Logs')
      .select({
        filterByFormula: `{Call SID} = "${callSid}"`,
        maxRecords: 1
      })
      .firstPage();
    
    if (records.length > 0) {
      const recordId = records[0].id;
      
      // Map intents to valid options
      let intent = updates.intent;
      if (intent === 'order' || intent === 'Order') {
        intent = 'Other';  // Use 'Other' for now
      }
      
      // Update the record
      const updated = await base('Call Logs').update([
        {
          id: recordId,
          fields: {
            'Transcript': updates.transcript,
            'Intent': intent,
            'Status': 'Completed',
            'Duration': updates.duration || 0
          }
        }
      ]);
      
      return updated[0];
    }
  } catch (error) {
    console.error('Error updating call log:', error.message);
    return null;
  }
};

// Get call history for a specific call
exports.getCallHistory = async (callSid) => {
  try {
    const records = await base('Call Logs')
      .select({
        filterByFormula: `{Call SID} = "${callSid}"`,
        maxRecords: 1
      })
      .firstPage();
    
    if (records.length > 0 && records[0].fields['Transcript']) {
      return records[0].fields['Transcript'];
    }
    return '';
  } catch (error) {
    console.error('Error fetching call history:', error);
    return '';
  }
};

// Create appointment record
exports.createAppointment = async (appointmentData) => {
  console.log('📅 Creating appointment');
  
  try {
    const record = await base('Appointments').create([
      {
        fields: {
          'Business': [appointmentData.business_id],
          'Customer Name': appointmentData.customer_name,
          'Customer Phone': appointmentData.customer_phone,
          'Service': appointmentData.service,
          'Date & Time': appointmentData.date_time,
          'Status': appointmentData.status || 'Confirmed'
        }
      }
    ]);
    
    console.log('✅ Appointment created successfully');
    return record[0];
  } catch (error) {
    console.error('Error creating appointment:', error);
    return null;
  }
};

// Create order record (for restaurants/retail)
exports.createOrder = async (orderData) => {
  console.log('🛒 Creating order');
  
  try {
    // Note: You'll need to create an "Orders" table in Airtable with these fields
    const record = await base('Orders').create([
      {
        fields: {
          'Business': [orderData.business_id],
          'Customer Name': orderData.customer_name,
          'Customer Phone': orderData.customer_phone,
          'Items': JSON.stringify(orderData.items), // Store as JSON string
          'Total': orderData.total,
          'Pickup Time': orderData.pickup_time,
          'Status': orderData.status || 'Received',
          'Order Date': new Date().toISOString()
        }
      }
    ]);
    
    console.log('✅ Order created successfully');
    return record[0];
  } catch (error) {
    console.error('Error creating order:', error);
    return null;
  }
};

// Get business statistics (for dashboard)
exports.getBusinessStats = async (businessId) => {
  try {
    // Get total calls
    const calls = await base('Call Logs')
      .select({
        filterByFormula: `{Business} = "${businessId}"`
      })
      .all();
    
    // Get appointments
    const appointments = await base('Appointments')
      .select({
        filterByFormula: `{Business} = "${businessId}"`
      })
      .all();
    
    // Calculate stats
    const stats = {
      totalCalls: calls.length,
      successfulCalls: calls.filter(c => c.fields['Status'] === 'Completed').length,
      totalAppointments: appointments.length,
      confirmedAppointments: appointments.filter(a => a.fields['Status'] === 'Confirmed').length
    };
    
    return stats;
  } catch (error) {
    console.error('Error fetching business stats:', error);
    return null;
  }
};