// api/services/airtableService.js - Optimized for single write at conversation end

const Airtable = require('airtable');

// Configure Airtable
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_BUSINESSES);

// Cache for business data to avoid repeated lookups
const businessCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Get business by forwarding number with caching
exports.getBusinessByForwardingNumber = async (phoneNumber) => {
  console.log('🔍 Looking up business by forwarding number:', phoneNumber);
  
  // Check cache first
  const cacheKey = `phone_${phoneNumber}`;
  const cached = businessCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log('📦 Using cached business data');
    return cached.data;
  }
  
  try {
    const records = await base('Businesses')
      .select({
        filterByFormula: `{Forwarding Number} = "${phoneNumber}"`,
        maxRecords: 1
      })
      .firstPage();
    
    if (records.length > 0) {
      console.log('✅ Found business:', records[0].fields['Business Name']);
      
      // Cache the result
      businessCache.set(cacheKey, {
        data: records[0],
        timestamp: Date.now()
      });
      
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

// Get business by ID with caching
exports.getBusinessById = async (businessId) => {
  // Check cache first
  const cacheKey = `id_${businessId}`;
  const cached = businessCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log('📦 Using cached business data');
    return cached.data;
  }
  
  try {
    const record = await base('Businesses').find(businessId);
    
    // Cache the result
    businessCache.set(cacheKey, {
      data: record,
      timestamp: Date.now()
    });
    
    return record;
  } catch (error) {
    console.error('Error fetching business by ID:', error);
    return null;
  }
};

// Create a complete call log with all details at once
exports.createCallLog = async (callData) => {
  console.log('📝 Creating complete call log');
  
  try {
    // Map intent to valid Airtable options
    let mappedIntent = callData.intent;
    
    // Common intent mappings - adjust based on your Airtable setup
    const intentMapping = {
      'general': 'General Inquiry',
      'order': 'Order',
      'booking': 'Booking',
      'info': 'Information',
      'appointment': 'Booking',
      'reservation': 'Booking'
    };
    
    // Use mapped intent or default to 'General Inquiry'
    mappedIntent = intentMapping[callData.intent] || 'General Inquiry';
    
    const fields = {
      'Caller Number': callData.caller_number || 'Unknown',
      'Call Date': new Date().toISOString(),
      'Status': callData.status || 'Completed',
      'Call SID': callData.call_sid,
      'Transcript': callData.transcript || '',
      'Intent': mappedIntent,  // Use mapped intent
      'Duration': callData.duration || 0
    };
    
    // Add Business link if provided
    if (callData.business_id) {
      fields['Business'] = [callData.business_id];
    }
    
    const record = await base('Call Logs').create([{ fields }]);
    
    console.log('✅ Call log created successfully:', record[0].id);
    return record[0];
  } catch (error) {
    console.error('❌ Error creating call log:', error.message);
    
    // If intent field fails, try without it
    if (error.message.includes('Intent')) {
      console.log('🔄 Retrying without Intent field...');
      try {
        const fieldsWithoutIntent = { ...fields };
        delete fieldsWithoutIntent.Intent;
        
        const record = await base('Call Logs').create([{ fields: fieldsWithoutIntent }]);
        console.log('✅ Call log created without Intent field');
        return record[0];
      } catch (retryError) {
        console.error('❌ Retry failed:', retryError.message);
      }
    }
    
    return null;
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
          'Customer Name': appointmentData.customer_name || 'Phone Customer',
          'Customer Phone': appointmentData.customer_phone,
          'Service': appointmentData.service,
          'Date & Time': appointmentData.date_time,
          'Status': appointmentData.status || 'Confirmed',
          'Created Date': new Date().toISOString()
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

// Create order record with all items
exports.createOrder = async (orderData) => {
  console.log('🛒 Creating order with items:', orderData.items);
  
  try {
    // Build order summary
    const orderSummary = orderData.items.map(item => 
      `${item.quantity}x ${item.name}`
    ).join(', ');
    
    const record = await base('Orders').create([
      {
        fields: {
          'Business': [orderData.business_id],
          'Customer Name': orderData.customer_name || 'Phone Order',
          'Customer Phone': orderData.customer_phone,
          'Items': orderSummary,
          'Items JSON': JSON.stringify(orderData.items),
          'Total': orderData.total,
          'Pickup Time': orderData.pickup_time || '30 minutes',
          'Status': orderData.status || 'Confirmed',
          'Order Date': new Date().toISOString()
        }
      }
    ]);
    
    console.log('✅ Order created successfully:', record[0].id);
    return record[0];
  } catch (error) {
    console.error('Error creating order:', error);
    return null;
  }
};

// Batch create all records at once (for even more optimization)
exports.saveCompleteConversation = async (conversationData) => {
  console.log('💾 Saving complete conversation data');
  
  const promises = [];
  
  // Create call log
  promises.push(
    exports.createCallLog({
      business_id: conversationData.businessId,
      caller_number: conversationData.callerNumber,
      call_sid: conversationData.callSid,
      status: 'Completed',
      transcript: conversationData.transcript,
      intent: conversationData.intent,
      duration: conversationData.duration
    })
  );
  
  // Create order if applicable
  if (conversationData.orderDetails) {
    promises.push(
      exports.createOrder({
        business_id: conversationData.businessId,
        customer_phone: conversationData.callerNumber,
        ...conversationData.orderDetails
      })
    );
  }
  
  // Create appointment if applicable
  if (conversationData.appointmentDetails) {
    promises.push(
      exports.createAppointment({
        business_id: conversationData.businessId,
        customer_phone: conversationData.callerNumber,
        ...conversationData.appointmentDetails
      })
    );
  }
  
  try {
    const results = await Promise.all(promises);
    console.log('✅ All records saved successfully');
    return results;
  } catch (error) {
    console.error('❌ Error saving conversation data:', error);
    return null;
  }
};

// Clear cache periodically
setInterval(() => {
  console.log('🧹 Clearing business cache');
  businessCache.clear();
}, CACHE_TTL);