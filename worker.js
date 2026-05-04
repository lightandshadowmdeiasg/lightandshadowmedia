/* ============================================================
   LIGHT & SHADOW MEDIA — Cloudflare Worker v4
   Payment: UOB PayNow Corporate (direct bank, no third-party gateway)

   Endpoints:
     GET  /?eventId=xxx        — return booked seats
     POST /                    — reserve seats + send PayNow confirmation email
     POST /webhook             — UOB payment notification → Sheets + ticket email
     PATCH /payment-status     — manual status update (admin)
     POST /admin-confirm       — admin confirm payment + send ticket
     POST /admin-resend        — admin resend ticket email
     GET  /admin-bookings      — all bookings (admin)
     GET  /admin-events        — events list (admin)
     POST /admin-events        — add event (admin)
     PATCH /admin-events       — update event (admin)
     GET  /events              — public events list
     GET  /seatmap             — seatmap for event
     POST /admin-seatmap       — save seatmap config (admin)
     GET  /admin-seatmap       — get seatmap config (admin)
     GET  /scan                — door scanner QR verification

   Flow:
     1. Customer selects seats → POST /
        → Seats reserved (Pending Payment) in Sheets
        → PayNow confirmation email sent (UEN + booking ref)
     2. Customer pays via PayNow to UOB account
     3. UOB sends webhook to POST /webhook (when UOB API is live)
        → Worker verifies UOB signature
        → Updates booking to Paid → sends QR ticket email
        (Manual fallback: admin confirms via /admin-confirm)

   Auth: Google OAuth2 refresh token
   UOB API: Pending integration — webhook stub ready
   ============================================================ */

   const CORS_ORIGIN     = 'https://lightandshadow.media';
   const ALLOWED_ORIGINS = [
     'https://lightandshadow.media',
     'https://www.lightandshadow.media'
   ];
   const EVENTS_TAB   = 'Events';
   const SITE_URL     = 'https://lightandshadow.media';
   
   const BOOKING_HEADERS = [
     'Timestamp', 'Name', 'Email', 'Phone', 'Seats',
     'Zone', 'Total Payable', 'Payment Status', 'Booking Ref'
   ];
   
   const EVENTS_HEADERS = [
     'Event ID', 'Event Title', 'Date', 'Venue', 'Capacity',
     'Zones / Prices', 'Status', 'Booking Status', 'Thumbnail', 'Video URL', 'Category', 'Description'
   ];
   
   
   // ============================================================
   // ENTRY POINT
   // ============================================================
   export default {
     async fetch(request, env) {
       const requestOrigin = (request.headers.get('origin') || '').replace(/\/$/, '');
       const url      = new URL(request.url);
       const pathname = url.pathname.replace(/\/$/, '');
   
       // ── ALL OPTIONS PREFLIGHTS — must be first, before any origin checks ──
       if (request.method === 'OPTIONS') {
         const allowOrigin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : CORS_ORIGIN;
         return new Response('', {
           status: 204,
           headers: {
             'Access-Control-Allow-Origin':  allowOrigin,
             'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
             'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
             'Access-Control-Max-Age':       '86400'
           }
         });
       }
   
       // Webhook does NOT need CORS — UOB calls it server-to-server
       if (request.method === 'POST' && pathname === '/webhook') {
         return await handleWebhook(request, env);
       }
   
       // /scan — open CORS, scanner app can be hosted on any origin
       if (request.method === 'POST' && pathname === '/scan') {
         return await handleScan(request, env);
       }
   
       // Strict CORS — only allow whitelisted origins
       const origin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : CORS_ORIGIN;
   
       // Block non-whitelisted origins (but not empty origin — server-to-server calls have no origin)
       if (requestOrigin && !ALLOWED_ORIGINS.includes(requestOrigin)) {
         return corsResponse(JSON.stringify({ error: 'Forbidden' }), 403, origin);
       }
   
       try {
         if (request.method === 'GET'   && pathname === '')                      return await handleGet(request, env, origin);
         if (request.method === 'POST'  && pathname === '')                      return await handlePost(request, env, origin);
         if (request.method === 'PATCH' && pathname === '/payment-status')       return await handlePatchStatus(request, env, origin);
         if (request.method === 'GET'   && pathname === '/admin-bookings')       return await handleAdminBookings(request, env, origin);
         if (request.method === 'POST'  && pathname === '/admin-confirm')        return await handleAdminConfirm(request, env, origin);
         if (request.method === 'POST'  && pathname === '/admin-resend')         return await handleAdminResend(request, env, origin);
         if (request.method === 'GET'   && pathname === '/admin-events')         return await handleAdminGetEvents(request, env, origin);
         if (request.method === 'POST'  && pathname === '/admin-events')         return await handleAdminAddEvent(request, env, origin);
         if (request.method === 'PATCH' && pathname === '/admin-events')         return await handleAdminUpdateEvent(request, env, origin);
         if (request.method === 'GET'   && pathname === '/events')               return await handlePublicEvents(request, env, origin);
         if (request.method === 'GET'   && pathname === '/seatmap')              return await handlePublicSeatmap(request, env, origin);
         if (request.method === 'POST'  && pathname === '/admin-seatmap')        return await handleAdminSaveSeatmap(request, env, origin);
         if (request.method === 'GET'   && pathname === '/admin-seatmap')        return await handleAdminGetSeatmap(request, env, origin);
         return corsResponse(JSON.stringify({ error: 'Not found' }), 404, origin);
       } catch (err) {
         console.error('Worker error:', err);
         return corsResponse(JSON.stringify({ success: false, error: String(err) }), 500, origin);
       }
     }
   };
   
   
   // ============================================================
   // GET — return booked seats for an event
   // ============================================================
   async function handleGet(request, env, origin) {
     const url     = new URL(request.url);
     const eventId = (url.searchParams.get('eventId') || '').trim();
   
     if (!eventId) return corsResponse(JSON.stringify({ bookedSeats: [] }), 200, origin);
   
     // Validate eventId format — alphanumeric, hyphens, underscores only
     if (!/^[a-zA-Z0-9_-]{1,50}$/.test(eventId)) {
       return corsResponse(JSON.stringify({ bookedSeats: [], error: 'Invalid event ID.' }), 400, origin);
     }
   
     const token     = await getAccessToken(env);
     const sheetMeta = await getSheetMeta(env, token);
     const tabExists = sheetMeta.sheets.some(s => s.properties.title === eventId);
   
     if (!tabExists) return corsResponse(JSON.stringify({ bookedSeats: [], closed: false }), 200, origin);
   
     // Check if bookings are open for this event
     try {
       const evValues = await sheetsRead(env, token, EVENTS_TAB, 'A:L');
       if (evValues && evValues.length > 1) {
         const evH        = evValues[0];
         const evIdCol    = evH.indexOf('Event ID');
         const bookingCol = evH.indexOf('Booking Status');
         const evRow      = evValues.slice(1).find(r => String(r[evIdCol] || '').trim() === eventId);
         if (evRow && bookingCol !== -1) {
           const bookingStatus = String(evRow[bookingCol] || '').trim().toLowerCase();
           if (bookingStatus === 'closed') {
             return corsResponse(JSON.stringify({ bookedSeats: [], closed: true }), 200, origin);
           }
         }
       }
     } catch (e) { /* non-critical — allow booking to proceed */ }
   
     const values = await sheetsRead(env, token, eventId, 'A:I');
     if (!values || values.length <= 1) return corsResponse(JSON.stringify({ bookedSeats: [] }), 200, origin);
   
     const header    = values[0];
     const seatsCol  = header.indexOf('Seats');
     const tsCol     = header.indexOf('Timestamp');
     const statusCol2= header.indexOf('Payment Status');
     if (seatsCol === -1) return corsResponse(JSON.stringify({ bookedSeats: [] }), 200, origin);
   
     const bookedSet = new Set();
     const now       = Date.now();
     const EXPIRE_MS = 30 * 60 * 1000; // 30 minutes
   
     for (let i = 1; i < values.length; i++) {
       const rowSeats  = String(values[i][seatsCol] || '').trim();
       const rowStatus = statusCol2 !== -1 ? String(values[i][statusCol2] || '').trim() : '';
       const rowTs     = tsCol !== -1 ? String(values[i][tsCol] || '').trim() : '';
   
       // Skip expired pending — treat as available
       if (rowStatus === 'Pending Payment' && rowTs) {
         const created = new Date(rowTs).getTime();
         if (!isNaN(created) && (now - created) > EXPIRE_MS) continue;
       }
   
       if (rowSeats) rowSeats.split(',').map(s => s.trim()).filter(Boolean).forEach(s => bookedSet.add(s));
     }
   
     return corsResponse(JSON.stringify({ bookedSeats: Array.from(bookedSet) }), 200, origin);
   }
   
   
   // ============================================================
   // POST / — reserve seats + send PayNow confirmation email
   // Returns { success: true, paynow: true, bookingRef } to frontend
   // ============================================================
   async function handlePost(request, env, origin) {
     let data = {};
     const ct = request.headers.get('content-type') || '';
   
     if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
       const formData = await request.formData();
       const raw = formData.get('data');
       if (!raw) throw new Error('No data field in FormData');
       data = JSON.parse(raw);
     } else {
       data = await request.json();
     }
   
     if (!data.eventId || !data.name || !data.email || !data.seats) {
       return corsResponse(JSON.stringify({ success: false, error: 'Missing required fields.' }), 400, origin);
     }
   
     // Input length limits
     if (
       String(data.name).length  > 100 ||
       String(data.email).length > 200 ||
       String(data.phone).length > 30  ||
       String(data.seats).length > 500 ||
       String(data.eventId).length > 50
     ) {
       return corsResponse(JSON.stringify({ success: false, error: 'Invalid input.' }), 400, origin);
     }
   
     // Validate eventId format
     const eventId = String(data.eventId).trim();
     if (!/^[a-zA-Z0-9_-]{1,50}$/.test(eventId)) {
       return corsResponse(JSON.stringify({ success: false, error: 'Invalid event ID.' }), 400, origin);
     }
   
     // Validate email format
     if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email).trim())) {
       return corsResponse(JSON.stringify({ success: false, error: 'Invalid email address.' }), 400, origin);
     }
   
     // Validate seats — only alphanumeric seat codes
     const seatsRaw = String(data.seats).trim();
     if (!/^[A-Za-z0-9,\s]{1,500}$/.test(seatsRaw)) {
       return corsResponse(JSON.stringify({ success: false, error: 'Invalid seat format.' }), 400, origin);
     }
   
     const seatsToBook  = seatsRaw.split(',').map(s => s.trim()).filter(Boolean);
     const seatDetails  = Array.isArray(data.seatDetails) ? data.seatDetails : [];
     const totalPayable = Number(data.totalPrice || 0);
   
     // Sanity check — max 10 seats per booking
     if (seatsToBook.length === 0 || seatsToBook.length > 10) {
       return corsResponse(JSON.stringify({ success: false, error: 'Invalid seat selection.' }), 400, origin);
     }
   
     // Sanity check — price must be non-negative
     if (isNaN(totalPayable) || totalPayable < 0 || totalPayable > 10000) {
       return corsResponse(JSON.stringify({ success: false, error: 'Invalid price.' }), 400, origin);
     }
   
     const token     = await getAccessToken(env);
     const sheetMeta = await getSheetMeta(env, token);
     const tabExists = sheetMeta.sheets.some(s => s.properties.title === eventId);
   
     if (!tabExists) {
       await createTab(env, token, eventId);
       await sheetsAppend(env, token, eventId, [BOOKING_HEADERS]);
     }
   
     // Check seat conflicts
     const values    = await sheetsRead(env, token, eventId, 'A:I');
     const bookedSet = new Set();
   
     if (values && values.length > 1) {
       const header    = values[0];
       const seatsCol2 = header.indexOf('Seats');
       const tsCol2    = header.indexOf('Timestamp');
       const stCol2    = header.indexOf('Payment Status');
       const nowMs     = Date.now();
       const EXPIRE    = 30 * 60 * 1000;
       if (seatsCol2 !== -1) {
         for (let i = 1; i < values.length; i++) {
           const rowSeats  = String(values[i][seatsCol2] || '').trim();
           const rowStatus = stCol2  !== -1 ? String(values[i][stCol2]  || '').trim() : '';
           const rowTs     = tsCol2  !== -1 ? String(values[i][tsCol2]  || '').trim() : '';
           // Skip expired pending bookings
           if (rowStatus === 'Pending Payment' && rowTs) {
             const created = new Date(rowTs).getTime();
             if (!isNaN(created) && (nowMs - created) > EXPIRE) continue;
           }
           if (rowSeats) rowSeats.split(',').map(s => s.trim()).filter(Boolean).forEach(s => bookedSet.add(s));
         }
       }
     }
   
     const conflictSeats = seatsToBook.filter(s => bookedSet.has(s));
     if (conflictSeats.length > 0) {
       return corsResponse(JSON.stringify({
         success: false, conflict: true, conflictSeats,
         message: 'Some seats have just been booked by someone else.'
       }), 200, origin);
     }
   
     // Generate a unique booking reference
     const bookingRef = `LSM-${eventId}-${Date.now()}`;
   
     const zoneText = seatDetails.length
       ? seatDetails.map(s => `${s.seat}(${String(s.zone || '-').trim() || '-'})`).join(', ')
       : '';
   
     // Write booking row — status starts as Pending Payment
     const row = [
       new Date().toISOString(),
       data.name  || '',
       data.email || '',
       data.phone || '',
       seatsToBook.join(', '),
       zoneText,
       totalPayable,
       'Pending Payment',
       bookingRef       // Booking Ref — used to match payment to booking
     ];
   
     await sheetsAppend(env, token, eventId, [row]);
     await ensureEventRegistered(env, token, data, sheetMeta);
   
     // Send PayNow confirmation email — customer pays directly to UOB account
     try {
       await sendPayNowEmail(env, token, {
         to:          data.email,
         name:        data.name,
         eventTitle:  data.eventTitle || '',
         eventDate:   data.eventDate  || '',
         venue:       data.venue      || '',
         seats:       seatsToBook,
         totalPayable,
         bookingRef
       });
       console.log('PayNow confirmation email sent to', data.email);
     } catch (emailErr) {
       console.error('PayNow email failed:', emailErr);
       // Non-fatal — booking is saved, admin can resend
     }
   
     return corsResponse(JSON.stringify({
       success:   true,
       paynow:    true,
       bookingRef
     }), 200, origin);
   }
   
   
   // ============================================================
   // POST /webhook — UOB PayNow payment notification
   // ============================================================
   // STATUS: Stub ready for UOB API integration
   //
   // When UOB API is approved and active, this endpoint receives
   // a payment notification from UOB when a PayNow payment lands.
   //
   // UOB will send a signed JSON payload. Integration steps:
   //   1. Add UOB_WEBHOOK_SECRET as a Cloudflare Worker secret
   //   2. Verify UOB signature using env.UOB_WEBHOOK_SECRET
   //   3. Parse referenceNum from payload (matches our bookingRef)
   //   4. Call processConfirmedPayment(referenceNum, env)
   //
   // UOB Developer Portal: https://developers.uobgroup.com/en/
   // ============================================================
   async function handleWebhook(request, env) {
     const body = await request.text();
     let payload;
   
     try {
       payload = JSON.parse(body);
     } catch {
       console.error('Webhook: invalid JSON body');
       return new Response('Bad Request', { status: 400 });
     }
   
     console.log('Webhook received:', JSON.stringify(payload));
   
     // ── UOB SIGNATURE VERIFICATION ──────────────────────────────
     // TODO: Replace this block with UOB-specific HMAC/signature verification
     // once UOB API credentials are issued.
     //
     // Example structure (confirm with UOB docs):
     //   const signature    = request.headers.get('X-UOB-Signature') || '';
     //   const isValid      = await verifyUOBSignature(body, signature, env.UOB_WEBHOOK_SECRET);
     //   if (!isValid) return new Response('Unauthorized', { status: 401 });
     //
     const isValid = typeof env.UOB_WEBHOOK_SECRET !== 'undefined'
       ? false   // Reject all until UOB verification is implemented
       : false;  // Also reject in dev — use /admin-confirm for manual flow
   
     if (!isValid) {
       console.log('Webhook: UOB verification pending — use admin confirm for now');
       return new Response('OK', { status: 200 });
     }
   
     // ── PARSE UOB PAYLOAD ────────────────────────────────────────
     // TODO: Adjust field names to match UOB's actual payload structure
     // UOB docs: https://developers.uobgroup.com/en/apis-documentation
     //
     // Expected fields (confirm with UOB):
     //   payload.status         — e.g. "SUCCESS"
     //   payload.referenceNo    — our bookingRef (LSM-event-xxx-timestamp)
     //   payload.amount         — amount paid
     //   payload.currency       — "SGD"
     //   payload.transactionId  — UOB transaction ID
     //
     const status       = String(payload.status      || '').toUpperCase();
     const referenceNum = String(payload.referenceNo || payload.reference_number || '').trim();
   
     if (status !== 'SUCCESS' && status !== 'COMPLETED') {
       console.log('Webhook: non-success status:', status);
       return new Response('OK', { status: 200 });
     }
   
     if (!referenceNum) {
       console.error('Webhook: no reference number in payload');
       return new Response('OK', { status: 200 });
     }
   
     // ── PROCESS CONFIRMED PAYMENT ────────────────────────────────
     await processConfirmedPayment(referenceNum, env);
   
     return new Response('OK', { status: 200 });
   }
   
   
   // ============================================================
   // SHARED — Process a confirmed payment by booking reference
   // Called by: handleWebhook (UOB) and handleAdminConfirm
   // ============================================================
   async function processConfirmedPayment(referenceNum, env) {
     // Parse eventId from bookingRef: LSM-event-001-1234567890
     const parts   = referenceNum.split('-');
     const eventId = parts.slice(1, -1).join('-'); // e.g. "event-001"
   
     if (!eventId) {
       console.error('processConfirmedPayment: could not parse eventId from', referenceNum);
       return;
     }
   
     const token  = await getAccessToken(env);
     const values = await sheetsRead(env, token, eventId, 'A:J');
   
     if (!values || values.length <= 1) {
       console.error('processConfirmedPayment: no bookings for event', eventId);
       return;
     }
   
     const header    = values[0];
     const refCol    = Math.max(header.indexOf('Booking Ref'), header.indexOf('HitPay Ref'));
     const statusCol = header.indexOf('Payment Status');
     const nameCol   = header.indexOf('Name');
     const emailCol  = header.indexOf('Email');
     const seatsCol  = header.indexOf('Seats');
     const totalCol  = header.indexOf('Total Payable');
   
     if (refCol === -1 || statusCol === -1) {
       console.error('processConfirmedPayment: header mismatch');
       return;
     }
   
     let targetRow   = -1;
     let bookingData = {};
   
     for (let i = 1; i < values.length; i++) {
       if (String(values[i][refCol] || '').trim() === referenceNum) {
         targetRow   = i + 1;
         bookingData = {
           name:  String(values[i][nameCol]  || '').trim(),
           email: String(values[i][emailCol] || '').trim(),
           seats: String(values[i][seatsCol] || '').trim().split(',').map(s => s.trim()).filter(Boolean),
           total: String(values[i][totalCol] || '').trim()
         };
         break;
       }
     }
   
     if (targetRow === -1) {
       console.error('processConfirmedPayment: booking not found for ref', referenceNum);
       return;
     }
   
     const sheetId      = env.GOOGLE_SHEET_ID;
     const statusLetter = columnToLetter(statusCol + 1);
     const rangeParam   = encodeURIComponent(`${eventId}!${statusLetter}${targetRow}`);
   
     // Update status → Paid
     await fetch(
       `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${rangeParam}?valueInputOption=RAW`,
       {
         method:  'PUT',
         headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
         body:    JSON.stringify({ values: [['Paid']] })
       }
     );
   
     // Fetch event details
     let eventTitle = eventId, eventDate = '', venue = '';
     try {
       const evValues = await sheetsRead(env, token, EVENTS_TAB, 'A:L');
       if (evValues && evValues.length > 1) {
         const evH   = evValues[0];
         const evRow = evValues.slice(1).find(r => String(r[evH.indexOf('Event ID')] || '').trim() === eventId);
         if (evRow) {
           eventTitle = String(evRow[evH.indexOf('Event Title')] || '').trim() || eventId;
           eventDate  = String(evRow[evH.indexOf('Date')]        || '').trim();
           venue      = String(evRow[evH.indexOf('Venue')]       || '').trim();
         }
       }
     } catch (e) { console.error('Event details fetch failed:', e); }
   
     // Send QR ticket email
     try {
       await sendTicketEmail(env, token, {
         to: bookingData.email, name: bookingData.name,
         eventTitle, eventDate, venue,
         seats: bookingData.seats, bookingRef: referenceNum,
         eventId, total: bookingData.total
       });
   
       // Update status → Ticket Sent
       await fetch(
         `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${rangeParam}?valueInputOption=RAW`,
         {
           method:  'PUT',
           headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
           body:    JSON.stringify({ values: [['Ticket Sent']] })
         }
       );
       console.log('Ticket sent for', referenceNum);
     } catch (emailErr) {
       console.error('Ticket email failed:', emailErr);
     }
   }
   
   
   // ============================================================
   // PATCH /payment-status — manual status update
   // ============================================================
   async function handlePatchStatus(request, env, origin) {
     // Require admin token header — set ADMIN_SECRET as a Worker secret
     const adminToken = request.headers.get('X-Admin-Token');
     if (!adminToken || adminToken !== env.ADMIN_SECRET) {
       return corsResponse(JSON.stringify({ success: false, error: 'Unauthorized.' }), 401, origin);
     }
   
     const data = await request.json();
     const { eventId, email, seats, status } = data;
   
     const validStatuses = ['Pending Payment', 'Paid', 'Ticket Sent'];
     if (!eventId || !email || !seats || !validStatuses.includes(status)) {
       return corsResponse(JSON.stringify({ success: false, error: 'Invalid payload.' }), 400, origin);
     }
   
     // Validate eventId format
     if (!/^[a-zA-Z0-9_-]{1,50}$/.test(String(eventId).trim())) {
       return corsResponse(JSON.stringify({ success: false, error: 'Invalid event ID.' }), 400, origin);
     }
   
     const token  = await getAccessToken(env);
     const values = await sheetsRead(env, token, eventId, 'A:I');
   
     if (!values || values.length <= 1) {
       return corsResponse(JSON.stringify({ success: false, error: 'No bookings found.' }), 200, origin);
     }
   
     const header    = values[0];
     const emailCol  = header.indexOf('Email');
     const seatsCol  = header.indexOf('Seats');
     const statusCol = header.indexOf('Payment Status');
   
     if (emailCol === -1 || seatsCol === -1 || statusCol === -1) {
       return corsResponse(JSON.stringify({ success: false, error: 'Sheet header mismatch.' }), 200, origin);
     }
   
     let targetRow = -1;
     for (let i = 1; i < values.length; i++) {
       const rowEmail = String(values[i][emailCol] || '').trim().toLowerCase();
       const rowSeats = String(values[i][seatsCol] || '').trim();
       if (rowEmail === email.trim().toLowerCase() && rowSeats === seats.trim()) {
         targetRow = i + 1;
         break;
       }
     }
   
     if (targetRow === -1) {
       return corsResponse(JSON.stringify({ success: false, error: 'Booking not found.' }), 200, origin);
     }
   
     const colLetter  = columnToLetter(statusCol + 1);
     const rangeParam = encodeURIComponent(`${eventId}!${colLetter}${targetRow}`);
     const sheetId    = env.GOOGLE_SHEET_ID;
   
     const res = await fetch(
       `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${rangeParam}?valueInputOption=RAW`,
       {
         method:  'PUT',
         headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
         body:    JSON.stringify({ values: [[status]] })
       }
     );
   
     if (!res.ok) throw new Error(`Sheets update failed: ${await res.text()}`);
     return corsResponse(JSON.stringify({ success: true, updatedStatus: status }), 200, origin);
   }
   
   
   // ============================================================
   // GET /admin-bookings — returns all Pending Payment bookings across all events
   // Requires X-Admin-Token header
   // ============================================================
   async function handleAdminBookings(request, env, origin) {
     const adminToken = request.headers.get('X-Admin-Token');
     if (!adminToken || adminToken !== env.ADMIN_SECRET) {
       return corsResponse(JSON.stringify({ success: false, error: 'Unauthorized.' }), 401, origin);
     }
   
     const token     = await getAccessToken(env);
     const sheetMeta = await getSheetMeta(env, token);
   
     // Get all event tabs (exclude Events tab and any non-event tabs)
     const eventTabs = sheetMeta.sheets
       .map(s => s.properties.title)
       .filter(t => t !== EVENTS_TAB && /^event-/i.test(t));
   
     const url3 = new URL(request.url);
     const statusFilter = (url3.searchParams.get('status') || 'pending').toLowerCase();
     const pending = [];
   
     for (const tab of eventTabs) {
       try {
         const values = await sheetsRead(env, token, tab, 'A:J');
         if (!values || values.length <= 1) continue;
   
         const header    = values[0];
         const tsCol     = header.indexOf('Timestamp');
         const nameCol   = header.indexOf('Name');
         const emailCol  = header.indexOf('Email');
         const phoneCol  = header.indexOf('Phone');
         const seatsCol  = header.indexOf('Seats');
         const zoneCol   = header.indexOf('Zone');
         const totalCol  = header.indexOf('Total Payable');
         const statusCol = header.indexOf('Payment Status');
         const refCol    = Math.max(header.indexOf('Booking Ref'), header.indexOf('HitPay Ref'));
   
         for (let i = 1; i < values.length; i++) {
           const status = String(values[i][statusCol] || '').trim();
           if (statusFilter !== 'all' && status !== 'Pending Payment') continue;
   
           pending.push({
             eventId:   tab,
             row:       i + 1,
             timestamp: String(values[i][tsCol]    || '').trim(),
             name:      String(values[i][nameCol]  || '').trim(),
             email:     String(values[i][emailCol] || '').trim(),
             phone:     String(values[i][phoneCol] || '').trim(),
             seats:     String(values[i][seatsCol] || '').trim(),
             zone:      String(values[i][zoneCol]  || '').trim(),
             total:     String(values[i][totalCol] || '').trim(),
             ref:       String(values[i][refCol]   || '').trim(),
             status
           });
         }
       } catch (e) {
         console.error(`Error reading tab ${tab}:`, e);
       }
     }
   
     // Also get event titles from Events tab for display
     const eventTitles = {};
     try {
       const evValues = await sheetsRead(env, token, EVENTS_TAB, 'A:G');
       if (evValues && evValues.length > 1) {
         const evHeader  = evValues[0];
         const evIdCol   = evHeader.indexOf('Event ID');
         const evTitleCol= evHeader.indexOf('Event Title');
         const evDateCol = evHeader.indexOf('Date');
         evValues.slice(1).forEach(row => {
           const id = String(row[evIdCol] || '').trim();
           if (id) eventTitles[id] = {
             title: String(row[evTitleCol] || '').trim(),
             date:  String(row[evDateCol]  || '').trim()
           };
         });
       }
     } catch (e) { /* non-critical */ }
   
     return corsResponse(JSON.stringify({ success: true, pending, eventTitles }), 200, origin);
   }
   
   
   // ============================================================
   // POST /admin-confirm — mark booking as Paid + send ticket email
   // Body: { eventId, ref, adminToken }
   // ============================================================
   async function handleAdminConfirm(request, env, origin) {
     const adminToken = request.headers.get('X-Admin-Token');
     if (!adminToken || adminToken !== env.ADMIN_SECRET) {
       return corsResponse(JSON.stringify({ success: false, error: 'Unauthorized.' }), 401, origin);
     }
   
     const data = await request.json();
     const { eventId, ref } = data;
   
     if (!eventId || !ref) {
       console.error('admin-confirm missing fields:', { eventId, ref, receivedKeys: Object.keys(data) });
       return corsResponse(JSON.stringify({ success: false, error: `Missing fields: eventId=${eventId}, ref=${ref}` }), 400, origin);
     }
   
     const token  = await getAccessToken(env);
     const values = await sheetsRead(env, token, eventId, 'A:J');
   
     if (!values || values.length <= 1) {
       return corsResponse(JSON.stringify({ success: false, error: 'No bookings found.' }), 200, origin);
     }
   
     const header    = values[0];
     const refCol    = Math.max(header.indexOf('Booking Ref'), header.indexOf('HitPay Ref'));
     const statusCol = header.indexOf('Payment Status');
     const nameCol   = header.indexOf('Name');
     const emailCol  = header.indexOf('Email');
     const seatsCol  = header.indexOf('Seats');
     const totalCol  = header.indexOf('Total Payable');
   
     let targetRow = -1;
     let booking   = {};
   
     for (let i = 1; i < values.length; i++) {
       if (String(values[i][refCol] || '').trim() === ref) {
         targetRow = i + 1;
         booking = {
           name:  String(values[i][nameCol]  || '').trim(),
           email: String(values[i][emailCol] || '').trim(),
           seats: String(values[i][seatsCol] || '').trim().split(',').map(s => s.trim()).filter(Boolean),
           total: String(values[i][totalCol] || '').trim()
         };
         break;
       }
     }
   
     if (targetRow === -1) {
       return corsResponse(JSON.stringify({ success: false, error: 'Booking not found.' }), 200, origin);
     }
   
     // Delegate to shared processConfirmedPayment — same logic as UOB webhook
     try {
       await processConfirmedPayment(ref, env);
     } catch (e) {
       console.error('Admin confirm failed:', e);
       return corsResponse(JSON.stringify({
         success: false,
         error:   'Failed to process confirmation. Check logs.',
       }), 200, origin);
     }
   
     return corsResponse(JSON.stringify({
       success: true,
       message: 'Ticket sent.',
       name:    booking.name,
       email:   booking.email,
       seats:   booking.seats
     }), 200, origin);
   }
   
   
   // ============================================================
   // POST /scan — QR code verification at the door
   // Body JSON: { qrData, pin }
   // QR format: bookingRef|eventId|seatCode|name
   // Valid entry: status is "Paid" or "Ticket Sent"
   // On valid scan: updates status to "Checked In" + records timestamp
   // On duplicate scan: returns already_checked_in with first scan time
   // Auth: STAFF_PIN Worker secret
   // ============================================================
   async function handleScan(request, env) {
     const scanOrigin = '*'; // open — scanner app can be on any device
   
     let body = {};
     try {
       body = await request.json();
     } catch {
       return scanResponse({ success: false, result: 'error', message: 'Invalid request.' });
     }
   
     const { qrData, pin } = body;
   
     // Verify staff PIN
     if (!pin || pin.trim() !== env.STAFF_PIN) {
       return scanResponse({ success: false, result: 'invalid_pin', message: 'Wrong PIN.' });
     }
   
     if (!qrData || typeof qrData !== 'string') {
       return scanResponse({ success: false, result: 'error', message: 'No QR data received.' });
     }
   
     // Parse QR: bookingRef|eventId|seatCode|name
     const parts = qrData.trim().split('|');
     if (parts.length < 4) {
       return scanResponse({ success: false, result: 'invalid_qr', message: 'Invalid QR code format.' });
     }
   
     const [ bookingRef, eventId, seatCode, guestName ] = parts;
   
     if (!bookingRef || !eventId || !seatCode) {
       return scanResponse({ success: false, result: 'invalid_qr', message: 'Incomplete QR data.' });
     }
   
     if (!/^[a-zA-Z0-9_-]{1,50}$/.test(eventId)) {
       return scanResponse({ success: false, result: 'invalid_qr', message: 'Invalid event ID in QR.' });
     }
   
     const token  = await getAccessToken(env);
     const values = await sheetsRead(env, token, eventId, 'A:L');
   
     if (!values || values.length <= 1) {
       return scanResponse({ success: false, result: 'not_found', message: 'Event not found.' });
     }
   
     const header         = values[0];
     const refCol         = Math.max(header.indexOf('Booking Ref'), header.indexOf('HitPay Ref'));
     const seatsCol       = header.indexOf('Seats');
     const statusCol      = header.indexOf('Payment Status');
     const nameCol        = header.indexOf('Name');
     const checkedInCol   = header.indexOf('Checked In At');
     const seatStatusCol  = header.indexOf('Seat Status');
   
     if (refCol === -1 || seatsCol === -1 || statusCol === -1) {
       return scanResponse({ success: false, result: 'error', message: 'Sheet header mismatch.' });
     }
   
     // Find matching booking row by bookingRef + seatCode
     let targetRow = -1;
     let rowData   = {};
   
     for (let i = 1; i < values.length; i++) {
       const rowRef   = String(values[i][refCol]   || '').trim();
       const rowSeats = String(values[i][seatsCol] || '').trim();
       const rowName  = String(values[i][nameCol]  || '').trim();
       const rowStatus= String(values[i][statusCol]|| '').trim();
       const rowSeatStatus = seatStatusCol !== -1 ? String(values[i][seatStatusCol] || '').trim() : '';
   
       if (rowRef === bookingRef && rowSeats.split(',').map(s => s.trim()).includes(seatCode)) {
         targetRow = i + 1;
         const rowCheckedInAt = checkedInCol !== -1 ? String(values[i][checkedInCol] || '').trim() : '';
         rowData   = { status: rowStatus, name: rowName, seatStatus: rowSeatStatus, checkedInAtRaw: rowCheckedInAt };
         break;
       }
     }
   
     if (targetRow === -1) {
       return scanResponse({
         success: false, result: 'not_found',
         message: 'Ticket not found. QR may be invalid or from a different event.',
         seat: seatCode, name: guestName
       });
     }
   
     const { status, name, seatStatus, checkedInAtRaw } = rowData;
   
     // Check per-seat status first — parse "I37:Checked In|I36:|I35:" format
     // seatStatus is a pipe-separated list of seat:status pairs
     const seatMap = {};
     if (seatStatus) {
       seatStatus.split('|').forEach(entry => {
         const [s, ...rest] = entry.split(':');
         if (s.trim()) seatMap[s.trim()] = rest.join(':').trim();
       });
     }
   
     // If this specific seat is already checked in — block
     if (seatMap[seatCode] === 'Checked In') {
       return scanResponse({
         success: false, result: 'already_checked_in',
         message: 'This seat has already been scanned. Entry denied.',
         seat: seatCode, name: name || guestName
       });
     }
   
     // Payment not completed — block
     if (status === 'Pending Payment') {
       return scanResponse({
         success: false, result: 'not_paid',
         message: 'Payment not completed for this ticket.',
         seat: seatCode, name: name || guestName
       });
     }
   
     // Valid: Paid or Ticket Sent — mark this specific seat as Checked In
     if (status === 'Paid' || status === 'Ticket Sent' || status === 'Checked In') {
       const checkedInAt = new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore' });
       const sheetId     = env.GOOGLE_SHEET_ID;
   
       // Update seatMap for this seat
       seatMap[seatCode] = 'Checked In';
   
       // Rebuild all seats from the booking row to ensure all are represented
       const allSeats    = rowData ? String(rowData.name ? '' : '').trim() : '';
       // Re-read seats from the row
       const bookingSeats = values
         .slice(1)
         .find((r, i) => (i + 2) === targetRow);
       const allSeatCodes = bookingSeats
         ? String(bookingSeats[seatsCol] || '').split(',').map(s => s.trim()).filter(Boolean)
         : [seatCode];
   
       // Ensure all seats are in the map (unscanned ones stay empty)
       allSeatCodes.forEach(s => {
         if (!(s in seatMap)) seatMap[s] = '';
       });
   
       // Serialize: "I37:Checked In|I36:|I35:"
       const newSeatStatus = allSeatCodes.map(s => `${s}:${seatMap[s] || ''}`).join('|');
   
       // Write Seat Status column
       if (seatStatusCol !== -1) {
         const seatStatusLetter = columnToLetter(seatStatusCol + 1);
         const seatStatusRange  = encodeURIComponent(`${eventId}!${seatStatusLetter}${targetRow}`);
         await fetch(
           `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${seatStatusRange}?valueInputOption=RAW`,
           {
             method:  'PUT',
             headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
             body:    JSON.stringify({ values: [[newSeatStatus]] })
           }
         );
       }
   
       // Check if ALL seats in this booking are now checked in
       const allCheckedIn = allSeatCodes.every(s => seatMap[s] === 'Checked In');
   
       // Update Payment Status to Checked In only when every seat is scanned
       if (allCheckedIn) {
         const statusLetter = columnToLetter(statusCol + 1);
         const statusRange  = encodeURIComponent(`${eventId}!${statusLetter}${targetRow}`);
         await fetch(
           `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${statusRange}?valueInputOption=RAW`,
           {
             method:  'PUT',
             headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
             body:    JSON.stringify({ values: [['Checked In']] })
           }
         );
       }
   
       // Write per-seat timestamp to Checked In At column
       if (checkedInCol !== -1) {
         // Parse existing per-seat timestamps from the Checked In At column
         const existingCheckedAt = checkedInAtRaw
           ? (() => {
               const m = {};
               checkedInAtRaw.split('|').forEach(entry => {
                 const [s, ...rest] = entry.split(':');
                 if (s.trim()) m[s.trim()] = rest.join(':').trim();
               });
               return m;
             })()
           : {};
   
         // Set timestamp for this seat
         existingCheckedAt[seatCode] = checkedInAt;
   
         // Ensure all seats are represented
         allSeatCodes.forEach(s => {
           if (!(s in existingCheckedAt)) existingCheckedAt[s] = '';
         });
   
         const newCheckedAtStr = allSeatCodes.map(s => `${s}:${existingCheckedAt[s] || ''}`).join('|');
   
         const checkedLetter = columnToLetter(checkedInCol + 1);
         const checkedRange  = encodeURIComponent(`${eventId}!${checkedLetter}${targetRow}`);
         await fetch(
           `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${checkedRange}?valueInputOption=RAW`,
           {
             method:  'PUT',
             headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
             body:    JSON.stringify({ values: [[newCheckedAtStr]] })
           }
         );
       }
   
       return scanResponse({
         success:     true,
         result:      'valid',
         message:     'Welcome! Entry approved.',
         seat:        seatCode,
         name:        name || guestName,
         bookingRef,
         checkedInAt,
         remaining:   allSeatCodes.filter(s => seatMap[s] !== 'Checked In').length
       });
     }
   
     // Any other status
     return scanResponse({
       success: false, result: 'invalid_status',
       message: `Cannot admit. Status: ${status}`,
       seat: seatCode, name: name || guestName
     });
   }
   
   function scanResponse(data) {
     return new Response(JSON.stringify(data), {
       status: 200,
       headers: {
         'Content-Type':                'application/json',
         'Access-Control-Allow-Origin': '*'
       }
     });
   }
   
   // ============================================================
   // UOB WEBHOOK SIGNATURE VERIFICATION
   // ============================================================
   // TODO: Implement once UOB API credentials and documentation
   // confirm the exact signature scheme used.
   //
   // UOB Developer Portal: https://developers.uobgroup.com/en/
   // Contact: TB Cash Sales team for API onboarding
   //
   async function verifyUOBSignature(body, signature, secret) {
     if (!secret || !signature) return false;
     const keyData   = new TextEncoder().encode(secret);
     const msgData   = new TextEncoder().encode(body);
     const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
     const sigBytes  = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
     const computed  = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
     return computed === signature;
   }
   
   
   // ============================================================
   // ============================================================
   // PAYNOW FALLBACK EMAIL
   // Sent when HitPay is unavailable
   // ============================================================
   async function sendPayNowEmail(env, token, { to, name, eventTitle, eventDate, venue, seats, totalPayable, bookingRef }) {
     const fromEmail     = env.FROM_EMAIL;
     const seatList      = seats.join(', ');
     const formattedDate = eventDate
       ? new Date(eventDate).toLocaleDateString('en-SG', { day: '2-digit', month: 'long', year: 'numeric' })
       : eventDate;
   
     const subjectEncoded = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(`Booking Confirmed | ${eventTitle}`)))}?=`;
   
     const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"></head>
   <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
   <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
   <tr><td align="center">
   <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:8px;overflow:hidden;">
     <tr><td style="background:#0a0a0c;padding:28px 32px;text-align:center;">
       <div style="font-size:1.4rem;letter-spacing:0.15em;color:#c9a227;font-weight:bold;">LIGHT &amp; SHADOW MEDIA</div>
       <div style="color:#888;font-size:0.8rem;margin-top:4px;">lightandshadow.media</div>
     </td></tr>
     <tr><td style="background:#1a472a;padding:20px 32px;text-align:center;">
       <div style="font-size:1.3rem;color:#fff;font-weight:bold;">&#10003; Booking Confirmed</div>
       <div style="color:#a8d5b5;font-size:0.9rem;margin-top:6px;">Thank you, <strong style="color:#fff;">${name}</strong>. Your seat reservation has been received.</div>
     </td></tr>
     <tr><td style="padding:32px;">
       <div style="margin-bottom:16px;">
         <div style="font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:#c9a227;font-weight:bold;margin-bottom:4px;">Event</div>
         <div style="font-size:1rem;color:#111;font-weight:bold;">${eventTitle}</div>
       </div>
       <div style="margin-bottom:16px;">
         <div style="font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:#c9a227;font-weight:bold;margin-bottom:4px;">Date &amp; Venue</div>
         <div style="font-size:0.95rem;color:#333;">${formattedDate} &mdash; ${venue}</div>
       </div>
       <div style="margin-bottom:16px;">
         <div style="font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:#c9a227;font-weight:bold;margin-bottom:8px;">Seats</div>
         <div>${seats.map(s => `<span style="display:inline-block;background:#0a0a0c;color:#c9a227;border-radius:4px;padding:6px 14px;margin:3px;font-weight:bold;">${s}</span>`).join(' ')}</div>
       </div>
       <div style="background:#f9f5e7;border-left:4px solid #c9a227;padding:16px 20px;border-radius:4px;margin-bottom:24px;">
         <div style="font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:#c9a227;font-weight:bold;margin-bottom:4px;">Total Payable</div>
         <div style="font-size:1.6rem;color:#0a0a0c;font-weight:bold;">SGD $${totalPayable}</div>
       </div>
       <hr style="border:none;border-top:1px solid #e5e5e5;margin:0 0 24px;">
       <div style="font-weight:bold;color:#111;margin-bottom:12px;">&#128179; Payment Instructions</div>
       <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:8px;">
         <tr><td style="padding:20px;">
           <p style="margin:0 0 8px;color:#333;"><strong>(1)</strong> PayNow to UEN: <strong style="color:#c9a227;font-size:1.3rem;">53384102W</strong><br><span style="color:#888;font-size:0.8rem;">LIGHT AND SHADOW MEDIA</span></p>
           <p style="margin:12px 0 8px;color:#333;"><strong>(2)</strong> Add reference / မှတ်ချက်: <strong style="color:#c9a227;font-size:1.1rem;">${bookingRef}</strong></p>
           <p style="margin:0 0 12px;color:#333;"><strong>(3)</strong> Send payment screenshot to <strong>ShweTV Messenger</strong>.</p>
           <p style="color:#555;font-size:0.85rem;border-top:1px solid #e5e5e5;padding-top:12px;">&#128233; Your e-ticket will be sent within <strong>24 hours</strong> after payment is confirmed.</p>
         </td></tr>
       </table>
       <div style="margin-top:16px;padding:10px 14px;background:#f0f0f0;border-radius:6px;font-size:0.8rem;color:#888;">Booking Ref: ${bookingRef}</div>
     </td></tr>
     <tr><td style="background:#0a0a0c;padding:24px 32px;">
       <p style="color:#c9a227;font-weight:bold;margin:0 0 8px;">&#10003; Booking လက်ခံရှိပါသည်။</p>
       <p style="color:#ccc;font-size:0.85rem;margin:0 0 6px;"><strong style="color:#c9a227;">ပွဲ:</strong> ${eventTitle} &nbsp;|&nbsp; <strong style="color:#c9a227;">ခုံ:</strong> ${seatList}</p>
       <p style="color:#ccc;font-size:0.85rem;margin:0 0 6px;"><strong style="color:#c9a227;">(1)</strong> PayNow UEN <strong style="color:#c9a227;">53384102W</strong> သို့ SGD $${totalPayable} လွှဲပါ</p>
       <p style="color:#ccc;font-size:0.85rem;margin:0 0 6px;"><strong style="color:#c9a227;">(2)</strong> Reference: <strong style="color:#c9a227;">${bookingRef}</strong></p>
       <p style="color:#ccc;font-size:0.85rem;margin:0;"><strong style="color:#c9a227;">(3)</strong> Screenshot ကို ShweTV Messenger ပို့ပါ။ ၂၄ နာရီအတွင်း E-ticket ပို့မည်။</p>
     </td></tr>
     <tr><td style="background:#f4f4f5;padding:16px;text-align:center;"><p style="font-size:0.75rem;color:#999;margin:0;">&copy; 2026 Light and Shadow Media. All rights reserved.</p></td></tr>
   </table></td></tr></table></body></html>`;
   
     const rawEmail = [
       `From: Light and Shadow Media <${fromEmail}>`,
       `To: ${to}`,
       `Subject: ${subjectEncoded}`,
       `MIME-Version: 1.0`,
       `Content-Type: text/html; charset=UTF-8`,
       `Content-Transfer-Encoding: base64`,
       '',
       btoa(unescape(encodeURIComponent(html)))
     ].join('\r\n');
   
     const encoded = btoa(unescape(encodeURIComponent(rawEmail)))
       .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
   
     const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
       method:  'POST',
       headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
       body:    JSON.stringify({ raw: encoded })
     });
   
     if (!res.ok) throw new Error(`PayNow email failed: ${JSON.stringify(await res.json())}`);
   }
   
   
   // ============================================================
   // TICKET EMAIL WITH QR CODES
   // QR data per seat: bookingRef|eventId|seatCode|name
   // Uses QR Server API (free, no key needed) to generate QR images
   // ============================================================
   async function sendTicketEmail(env, token, { to, name, eventTitle, eventDate, venue, seats, bookingRef, eventId, total }) {
     const fromEmail     = env.FROM_EMAIL;
     const formattedDate = eventDate
       ? new Date(eventDate).toLocaleDateString('en-SG', { day: '2-digit', month: 'long', year: 'numeric' })
       : eventDate;
   
     const subjectText    = `Your Tickets — ${eventTitle}`;
     const subjectEncoded = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subjectText)))}?=`;
   
     // Generate one QR image URL per seat
     // QR encodes: bookingRef|eventId|seat|name  — enough to verify at the door
     const seatTickets = seats.map(seat => {
       const qrData = `${bookingRef}|${eventId}|${seat}|${name}`;
       const qrUrl  = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`;
       return { seat, qrUrl, qrData };
     });
   
     const ticketBlocks = seatTickets.map(({ seat, qrUrl }) => `
       <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e5e5e5;border-radius:8px;margin-bottom:16px;overflow:hidden;">
         <tr>
           <!-- Left: QR -->
           <td width="160" style="padding:20px;background:#0a0a0c;text-align:center;vertical-align:middle;">
             <img src="${qrUrl}" width="140" height="140" alt="QR for seat ${seat}" style="display:block;margin:0 auto;">
             <div style="color:#c9a227;font-size:0.7rem;margin-top:8px;letter-spacing:0.08em;">SCAN AT DOOR</div>
           </td>
           <!-- Right: Details -->
           <td style="padding:20px;vertical-align:middle;">
             <div style="font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:#c9a227;margin-bottom:4px;font-weight:bold;">Seat</div>
             <div style="font-size:2rem;font-weight:bold;color:#0a0a0c;letter-spacing:0.05em;">${seat}</div>
             <div style="margin-top:12px;font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:#c9a227;margin-bottom:4px;font-weight:bold;">Event</div>
             <div style="font-size:0.85rem;color:#333;">${eventTitle}</div>
             <div style="margin-top:8px;font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:#c9a227;margin-bottom:4px;font-weight:bold;">Date &amp; Venue</div>
             <div style="font-size:0.8rem;color:#555;">${formattedDate}<br>${venue}</div>
           </td>
         </tr>
         <tr>
           <td colspan="2" style="background:#f9f5e7;padding:10px 20px;border-top:1px solid #e5e5e5;">
             <span style="font-size:0.75rem;color:#888;">Ref: ${bookingRef}</span>
           </td>
         </tr>
       </table>
     `).join('');
   
     const html = `<!DOCTYPE html>
   <html lang="en">
   <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
   <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
   <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
   <tr><td align="center">
   <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
   
     <!-- Header -->
     <tr>
       <td style="background:#0a0a0c;padding:28px 32px;text-align:center;">
         <div style="font-size:1.5rem;letter-spacing:0.15em;color:#c9a227;font-weight:bold;">LIGHT &amp; SHADOW MEDIA</div>
         <div style="color:#888;font-size:0.8rem;margin-top:4px;letter-spacing:0.05em;">lightandshadow.media</div>
       </td>
     </tr>
   
     <!-- Banner -->
     <tr>
       <td style="background:#1a3a5c;padding:20px 32px;text-align:center;">
         <div style="font-size:1.4rem;color:#ffffff;font-weight:bold;">🎟️ Your Tickets Are Here</div>
         <div style="color:#a8c5e0;font-size:0.9rem;margin-top:6px;">
           Hi <strong style="color:#fff;">${name}</strong>, your payment is confirmed. Present the QR code(s) below at the door.
         </div>
       </td>
     </tr>
   
     <!-- Event summary -->
     <tr>
       <td style="padding:24px 32px 8px;">
         <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f5e7;border-left:4px solid #c9a227;border-radius:4px;padding:16px;">
           <tr>
             <td style="padding:12px 16px;">
               <div style="font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:#c9a227;font-weight:bold;margin-bottom:4px;">Event</div>
               <div style="font-size:1rem;color:#111;font-weight:bold;margin-bottom:12px;">${eventTitle}</div>
               <div style="font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:#c9a227;font-weight:bold;margin-bottom:4px;">Date &amp; Venue</div>
               <div style="font-size:0.9rem;color:#333;">${formattedDate} &nbsp;|&nbsp; ${venue}</div>
             </td>
           </tr>
         </table>
       </td>
     </tr>
   
     <!-- Tickets -->
     <tr>
       <td style="padding:16px 32px 8px;">
         <div style="font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:#c9a227;font-weight:bold;margin-bottom:12px;">Your Tickets</div>
         ${ticketBlocks}
       </td>
     </tr>
   
     <!-- Instructions -->
     <tr>
       <td style="padding:8px 32px 24px;">
         <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:8px;">
           <tr><td style="padding:16px 20px;">
             <div style="font-size:0.85rem;color:#555;line-height:1.6;">
               <strong style="color:#111;">At the door:</strong> Show this email or screenshot the QR code(s). One QR code per seat. Do not share your QR codes.<br><br>
               <strong style="color:#111;">Need help?</strong> Contact us via ShweTV Messenger or email us at ${fromEmail}
             </div>
           </td></tr>
         </table>
       </td>
     </tr>
   
     <!-- Burmese -->
     <tr>
       <td style="background:#0a0a0c;padding:24px 32px;">
         <div style="color:#c9a227;font-weight:bold;margin-bottom:10px;">🎟️ သင်၏ E-Ticket များ လက်ခံရှိပါသည်။</div>
         <p style="color:#ccc;font-size:0.85rem;margin:0 0 8px;">
           <strong style="color:#fff;">${name}</strong> — ငွေပေးချေမှု အောင်မြင်ပြီးပါပြီ။ အထက်ပါ QR Code များကို တံခါးဝတွင် ပြသပေးပါ။
         </p>
         <p style="color:#aaa;font-size:0.8rem;margin:4px 0;"><strong style="color:#c9a227;">ပွဲ:</strong> ${eventTitle}</p>
         <p style="color:#aaa;font-size:0.8rem;margin:4px 0;"><strong style="color:#c9a227;">နေရာ / ရက်:</strong> ${formattedDate} | ${venue}</p>
         <p style="color:#aaa;font-size:0.8rem;margin:8px 0 0;"><strong style="color:#c9a227;">ခုံနံပါတ်:</strong> ${seats.join(', ')}</p>
         <hr style="border:none;border-top:1px solid #222;margin:16px 0;">
         <p style="color:#888;font-size:0.75rem;margin:0;">QR Code တစ်ခုသည် ခုံတစ်ခုအတွက်သာ ဖြစ်သည်။ မျှဝေခြင်း မပြုပါနှင့်။</p>
       </td>
     </tr>
   
     <!-- Footer -->
     <tr>
       <td style="background:#f4f4f5;padding:20px 32px;text-align:center;">
         <p style="font-size:0.75rem;color:#999;margin:0;">
           &copy; 2026 Light and Shadow Media. All rights reserved.<br>
           Booking Ref: ${bookingRef}
         </p>
       </td>
     </tr>
   
   </table>
   </td></tr>
   </table>
   </body>
   </html>`;
   
     const rawEmail = [
       `From: Light and Shadow Media <${fromEmail}>`,
       `To: ${to}`,
       `Subject: ${subjectEncoded}`,
       `MIME-Version: 1.0`,
       `Content-Type: text/html; charset=UTF-8`,
       `Content-Transfer-Encoding: base64`,
       '',
       btoa(unescape(encodeURIComponent(html)))
     ].join('\r\n');
   
     const encoded = btoa(unescape(encodeURIComponent(rawEmail)))
       .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
   
     const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
       method:  'POST',
       headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
       body:    JSON.stringify({ raw: encoded })
     });
   
     if (!res.ok) throw new Error(`Gmail ticket send failed: ${JSON.stringify(await res.json())}`);
   }
   
   
   // ============================================================
   // GOOGLE SHEETS HELPERS
   // ============================================================
   async function getSheetMeta(env, token) {
     const res = await fetch(
       `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}?fields=sheets.properties.title`,
       { headers: { Authorization: `Bearer ${token}` } }
     );
     if (!res.ok) throw new Error(`getSheetMeta failed: ${await res.text()}`);
     return res.json();
   }
   
   async function createTab(env, token, tabName) {
     const res = await fetch(
       `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}:batchUpdate`,
       {
         method:  'POST',
         headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
         body:    JSON.stringify({ requests: [{ addSheet: { properties: { title: tabName } } }] })
       }
     );
     if (!res.ok) throw new Error(`createTab "${tabName}" failed: ${await res.text()}`);
   }
   
   async function sheetsRead(env, token, tabName, range) {
     const rangeParam = encodeURIComponent(`${tabName}!${range}`);
     const res        = await fetch(
       `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values/${rangeParam}`,
       { headers: { Authorization: `Bearer ${token}` } }
     );
     const json = await res.json();
     if (!res.ok) throw new Error(`Sheets read failed: ${JSON.stringify(json)}`);
     return json.values || [];
   }
   
   async function sheetsAppend(env, token, tabName, rows) {
     const rangeParam = encodeURIComponent(`${tabName}!A:A`);
     const res        = await fetch(
       `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values/${rangeParam}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
       {
         method:  'POST',
         headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
         body:    JSON.stringify({ values: rows })
       }
     );
     if (!res.ok) throw new Error(`Sheets append failed: ${JSON.stringify(await res.json())}`);
   }
   
   async function ensureEventRegistered(env, token, data, sheetMeta) {
     try {
       const eventsTabExists = sheetMeta.sheets.some(s => s.properties.title === EVENTS_TAB);
       if (!eventsTabExists) {
         await createTab(env, token, EVENTS_TAB);
         await sheetsAppend(env, token, EVENTS_TAB, [EVENTS_HEADERS]);
       }
       const values     = await sheetsRead(env, token, EVENTS_TAB, 'A:G');
       const header     = values[0] || [];
       const eventIdCol = header.indexOf('Event ID');
       const exists     = eventIdCol !== -1 && values.slice(1).some(r => String(r[eventIdCol] || '').trim() === data.eventId);
       if (!exists) {
         await sheetsAppend(env, token, EVENTS_TAB, [[
           data.eventId || '', data.eventTitle || '', data.eventDate || '',
           data.venue || '', '', '', 'Upcoming'
         ]]);
       }
     } catch (err) {
       console.error('ensureEventRegistered error (non-critical):', err);
     }
   }
   
   function columnToLetter(col) {
     let letter = '';
     while (col > 0) {
       const rem = (col - 1) % 26;
       letter = String.fromCharCode(65 + rem) + letter;
       col    = Math.floor((col - 1) / 26);
     }
     return letter;
   }
   
   
   
   
   // ============================================================
   // GET /seatmap?eventId=xxx — public endpoint
   // Returns seatmap.json merged with per-event overrides from Sheets
   // If no override tab exists, returns raw seatmap.json
   // ============================================================
   async function handlePublicSeatmap(request, env, origin) {
     const url     = new URL(request.url);
     const eventId = (url.searchParams.get('eventId') || '').trim();
   
     if (!eventId || !/^[a-zA-Z0-9_-]{1,50}$/.test(eventId)) {
       return corsResponse(JSON.stringify({ error: 'Invalid event ID.' }), 400, origin);
     }
   
     const token     = await getAccessToken(env);
     const sheetMeta = await getSheetMeta(env, token);
     const tabName   = `seatmap-${eventId}`;
     const tabExists = sheetMeta.sheets.some(s => s.properties.title === tabName);
   
     if (!tabExists) {
       return corsResponse(JSON.stringify({ useDefault: true }), 200, origin);
     }
   
     const values = await sheetsRead(env, token, tabName, 'A:C');
     if (!values || values.length < 2) {
       return corsResponse(JSON.stringify({ useDefault: true }), 200, origin);
     }
   
     // Two sections separated by blank row:
     // Section 1: ZONES header → Zone | Color | Price
     // Section 2: OVERRIDES header → Seat | Zone | State
     const zones = {};
     const overrides = {};
     let section = null;
   
     for (const row of values) {
       const first = String(row[0] || '').trim().toUpperCase();
       if (!first) { section = null; continue; }
       if (first === 'ZONES')     { section = 'zones';     continue; }
       if (first === 'OVERRIDES') { section = 'overrides'; continue; }
   
       if (section === 'zones') {
         const color = String(row[1] || '').trim();
         const price = Number(row[2] || 0);
         zones[first] = { color, price };
       }
       if (section === 'overrides') {
         const zone  = String(row[1] || '').trim().toUpperCase() || null;
         const state = String(row[2] || '').trim().toUpperCase() || 'AVAILABLE';
         overrides[first] = { zone, state };
       }
     }
   
     return corsResponse(JSON.stringify({ useDefault: false, zones, overrides }), 200, origin);
   }
   
   
   // ============================================================
   // GET /admin-seatmap?eventId=xxx — get seatmap config for admin
   // ============================================================
   async function handleAdminGetSeatmap(request, env, origin) {
     const adminToken = request.headers.get('X-Admin-Token');
     if (!adminToken || adminToken !== env.ADMIN_SECRET) {
       return corsResponse(JSON.stringify({ success: false, error: 'Unauthorized.' }), 401, origin);
     }
   
     const url     = new URL(request.url);
     const eventId = (url.searchParams.get('eventId') || '').trim();
     if (!eventId) return corsResponse(JSON.stringify({ success: false, error: 'Missing eventId.' }), 400, origin);
   
     const token     = await getAccessToken(env);
     const sheetMeta = await getSheetMeta(env, token);
     const tabName   = `seatmap-${eventId}`;
     const tabExists = sheetMeta.sheets.some(s => s.properties.title === tabName);
   
     if (!tabExists) {
       return corsResponse(JSON.stringify({ success: true, exists: false, eventId }), 200, origin);
     }
   
     const values = await sheetsRead(env, token, tabName, 'A:D');
     return corsResponse(JSON.stringify({ success: true, exists: true, eventId, values }), 200, origin);
   }
   
   
   // ============================================================
   // POST /admin-seatmap — save seatmap config for an event
   // Creates or overwrites seatmap-{eventId} tab
   // Body: { eventId, zones: [{name,color,price}], rowRanges: [{from,to,zone}], overrides: [{seat,zone,state}] }
   // ============================================================
   async function handleAdminSaveSeatmap(request, env, origin) {
     const adminToken = request.headers.get('X-Admin-Token');
     if (!adminToken || adminToken !== env.ADMIN_SECRET) {
       return corsResponse(JSON.stringify({ success: false, error: 'Unauthorized.' }), 401, origin);
     }
   
     const data = await request.json();
     const { eventId, zones, rowRanges, overrides } = data;
   
     if (!eventId) return corsResponse(JSON.stringify({ success: false, error: 'Missing eventId.' }), 400, origin);
     if (!/^[a-zA-Z0-9_-]{1,50}$/.test(eventId)) {
       return corsResponse(JSON.stringify({ success: false, error: 'Invalid event ID.' }), 400, origin);
     }
   
     const token     = await getAccessToken(env);
     const sheetMeta = await getSheetMeta(env, token);
     const tabName   = `seatmap-${eventId}`;
     const tabExists = sheetMeta.sheets.some(s => s.properties.title === tabName);
   
     if (!tabExists) {
       await createTab(env, token, tabName);
     } else {
       // Clear existing data
       const sheetId    = env.GOOGLE_SHEET_ID;
       const rangeParam = encodeURIComponent(`${tabName}!A:D`);
       await fetch(
         `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${rangeParam}:clear`,
         { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
       );
     }
   
     // Build rows to write — two sections: ZONES then OVERRIDES
     const rows = [];
   
     // Section 1: Zones
     rows.push(['ZONES', 'Color', 'Price']);
     (zones || []).forEach(z => {
       rows.push([String(z.name || '').toUpperCase(), z.color || '', String(z.price || '0')]);
     });
     rows.push(['', '', '']); // blank separator
   
     // Section 2: Seat Overrides
     rows.push(['OVERRIDES', 'Zone', 'State']);
     (overrides || []).forEach(o => {
       rows.push([
         String(o.seat  || '').toUpperCase(),
         String(o.zone  || '').toUpperCase(),
         String(o.state || 'AVAILABLE').toUpperCase()
       ]);
     });
   
     await sheetsAppend(env, token, tabName, rows);
     return corsResponse(JSON.stringify({ success: true, message: `Seatmap saved for ${eventId}.` }), 200, origin);
   }
   
   
   // ============================================================
   // GET /events — public endpoint, returns events for the frontend
   // Replaces live-events.json
   // ============================================================
   async function handlePublicEvents(request, env, origin) {
     const token  = await getAccessToken(env);
   
     // Ensure Events tab exists
     const sheetMeta = await getSheetMeta(env, token);
     const tabExists = sheetMeta.sheets.some(s => s.properties.title === EVENTS_TAB);
     if (!tabExists) return corsResponse(JSON.stringify({ events: [] }), 200, origin);
   
     const values = await sheetsRead(env, token, EVENTS_TAB, 'A:L');
     if (!values || values.length <= 1) return corsResponse(JSON.stringify({ events: [] }), 200, origin);
   
     const header          = values[0];
     const idCol           = header.indexOf('Event ID');
     const titleCol        = header.indexOf('Event Title');
     const dateCol         = header.indexOf('Date');
     const venueCol        = header.indexOf('Venue');
     const capacityCol     = header.indexOf('Capacity');
     const zonesCol        = header.indexOf('Zones / Prices');
     const statusCol       = header.indexOf('Status');
     const bookingCol      = header.indexOf('Booking Status');
     const thumbCol        = header.indexOf('Thumbnail');
     const videoCol        = header.indexOf('Video URL');
     const categoryCol     = header.indexOf('Category');
     const descCol         = header.indexOf('Description');
   
     const events = values.slice(1)
       .filter(row => row[idCol] && String(row[idCol]).trim())
       .map(row => ({
         id:             String(row[idCol]       || '').trim(),
         title:          String(row[titleCol]    || '').trim(),
         date:           String(row[dateCol]     || '').trim(),
         venue:          String(row[venueCol]    || '').trim(),
         capacity:       String(row[capacityCol] || '').trim(),
         zones:          String(row[zonesCol]    || '').trim(),
         status:         String(row[statusCol]   || 'upcoming').trim().toLowerCase(),
         bookingStatus:  String(row[bookingCol]  || 'closed').trim().toLowerCase(),
         thumbnail:      String(row[thumbCol]    || '').trim(),
         videoUrl:       String(row[videoCol]    || '').trim(),
         category:       String(row[categoryCol] || 'special').trim().toLowerCase(),
         description:    String(row[descCol]     || '').trim(),
       }));
   
     return corsResponse(JSON.stringify({ events }), 200, origin);
   }
   
   
   // ============================================================
   // GET /admin-events — full events list for admin (requires auth)
   // ============================================================
   async function handleAdminGetEvents(request, env, origin) {
     const adminToken = request.headers.get('X-Admin-Token');
     if (!adminToken || adminToken !== env.ADMIN_SECRET) {
       return corsResponse(JSON.stringify({ success: false, error: 'Unauthorized.' }), 401, origin);
     }
   
     const token     = await getAccessToken(env);
     const sheetMeta = await getSheetMeta(env, token);
     const tabExists = sheetMeta.sheets.some(s => s.properties.title === EVENTS_TAB);
   
     if (!tabExists) return corsResponse(JSON.stringify({ success: true, events: [] }), 200, origin);
   
     const values = await sheetsRead(env, token, EVENTS_TAB, 'A:L');
     if (!values || values.length <= 1) return corsResponse(JSON.stringify({ success: true, events: [] }), 200, origin);
   
     const header      = values[0];
     const rows        = values.slice(1).map((row, i) => {
       const obj = {};
       header.forEach((h, j) => { if (h) obj[h] = String(row[j] || '').trim(); });
       obj._row = i + 2; // 1-indexed, +1 for header
       return obj;
     }).filter(r => r['Event ID']);
   
     return corsResponse(JSON.stringify({ success: true, events: rows, headers: header }), 200, origin);
   }
   
   
   // ============================================================
   // POST /admin-events — add a new event
   // ============================================================
   async function handleAdminAddEvent(request, env, origin) {
     const adminToken = request.headers.get('X-Admin-Token');
     if (!adminToken || adminToken !== env.ADMIN_SECRET) {
       return corsResponse(JSON.stringify({ success: false, error: 'Unauthorized.' }), 401, origin);
     }
   
     const data = await request.json();
     const { id, title, date, venue, capacity, zones, status, bookingStatus, thumbnail, videoUrl, category, description } = data;
   
     if (!id || !title) {
       return corsResponse(JSON.stringify({ success: false, error: 'Event ID and title are required.' }), 400, origin);
     }
   
     // Validate event ID format
     if (!/^[a-zA-Z0-9_-]{1,50}$/.test(id)) {
       return corsResponse(JSON.stringify({ success: false, error: 'Event ID must be alphanumeric with hyphens/underscores only.' }), 400, origin);
     }
   
     const token     = await getAccessToken(env);
     const sheetMeta = await getSheetMeta(env, token);
     const tabExists = sheetMeta.sheets.some(s => s.properties.title === EVENTS_TAB);
   
     // Create Events tab if needed
     if (!tabExists) {
       await createTab(env, token, EVENTS_TAB);
     }
   
     // Ensure headers exist with full column set
     const fullHeaders = [
       'Event ID', 'Event Title', 'Date', 'Venue', 'Capacity',
       'Zones / Prices', 'Status', 'Booking Status', 'Thumbnail', 'Video URL', 'Category', 'Description'
     ];
   
     const existing = await sheetsRead(env, token, EVENTS_TAB, 'A:L');
     if (!existing || existing.length === 0) {
       await sheetsAppend(env, token, EVENTS_TAB, [fullHeaders]);
     } else {
       // Check if event ID already exists
       const header  = existing[0];
       const idCol   = header.indexOf('Event ID');
       const exists  = idCol !== -1 && existing.slice(1).some(r => String(r[idCol] || '').trim() === id);
       if (exists) {
         return corsResponse(JSON.stringify({ success: false, error: `Event ID "${id}" already exists.` }), 400, origin);
       }
     }
   
     const row = [
       id, title, date || '', venue || '', capacity || '',
       zones || '', status || 'upcoming', bookingStatus || 'closed',
       thumbnail || '', videoUrl || '', category || 'special', description || ''
     ];
   
     await sheetsAppend(env, token, EVENTS_TAB, [row]);
   
     return corsResponse(JSON.stringify({ success: true, message: `Event "${title}" added.` }), 200, origin);
   }
   
   
   // ============================================================
   // PATCH /admin-events — update an existing event (any fields)
   // Body: { id, ...fields to update }
   // ============================================================
   async function handleAdminUpdateEvent(request, env, origin) {
     const adminToken = request.headers.get('X-Admin-Token');
     if (!adminToken || adminToken !== env.ADMIN_SECRET) {
       return corsResponse(JSON.stringify({ success: false, error: 'Unauthorized.' }), 401, origin);
     }
   
     const data = await request.json();
     const { id, ...updates } = data;
   
     if (!id) {
       return corsResponse(JSON.stringify({ success: false, error: 'Event ID required.' }), 400, origin);
     }
   
     const token  = await getAccessToken(env);
     const values = await sheetsRead(env, token, EVENTS_TAB, 'A:L');
   
     if (!values || values.length <= 1) {
       return corsResponse(JSON.stringify({ success: false, error: 'No events found.' }), 200, origin);
     }
   
     const header = values[0];
     const idCol  = header.indexOf('Event ID');
   
     let targetRow = -1;
     for (let i = 1; i < values.length; i++) {
       if (String(values[i][idCol] || '').trim() === id) {
         targetRow = i + 1;
         break;
       }
     }
   
     if (targetRow === -1) {
       return corsResponse(JSON.stringify({ success: false, error: `Event "${id}" not found.` }), 200, origin);
     }
   
     const sheetId  = env.GOOGLE_SHEET_ID;
   
     // Map field names to column headers
     const fieldMap = {
       title:         'Event Title',
       date:          'Date',
       venue:         'Venue',
       capacity:      'Capacity',
       zones:         'Zones / Prices',
       status:        'Status',
       bookingStatus: 'Booking Status',
       thumbnail:     'Thumbnail',
       videoUrl:      'Video URL',
       category:      'Category',
       description:   'Description'
     };
   
     // Update each changed field
     for (const [field, value] of Object.entries(updates)) {
       const colName = fieldMap[field];
       if (!colName) continue;
       const colIdx = header.indexOf(colName);
       if (colIdx === -1) continue;
   
       const colLetter  = columnToLetter(colIdx + 1);
       const rangeParam = encodeURIComponent(`${EVENTS_TAB}!${colLetter}${targetRow}`);
   
       await fetch(
         `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${rangeParam}?valueInputOption=RAW`,
         {
           method:  'PUT',
           headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
           body:    JSON.stringify({ values: [[String(value || '')]] })
         }
       );
     }
   
     return corsResponse(JSON.stringify({ success: true, message: `Event "${id}" updated.` }), 200, origin);
   }
   
   
   // ============================================================
   // POST /admin-resend — resend ticket email for a booking
   // Body: { eventId, ref }
   // ============================================================
   async function handleAdminResend(request, env, origin) {
     const adminToken = request.headers.get('X-Admin-Token');
     if (!adminToken || adminToken !== env.ADMIN_SECRET) {
       return corsResponse(JSON.stringify({ success: false, error: 'Unauthorized.' }), 401, origin);
     }
   
     const data = await request.json();
     const { eventId, ref } = data;
   
     if (!eventId || !ref) {
       return corsResponse(JSON.stringify({ success: false, error: 'Missing eventId or ref.' }), 400, origin);
     }
   
     const token  = await getAccessToken(env);
     const values = await sheetsRead(env, token, eventId, 'A:J');
   
     if (!values || values.length <= 1) {
       return corsResponse(JSON.stringify({ success: false, error: 'No bookings found.' }), 200, origin);
     }
   
     const header    = values[0];
     const refCol    = Math.max(header.indexOf('Booking Ref'), header.indexOf('HitPay Ref'));
     const nameCol   = header.indexOf('Name');
     const emailCol  = header.indexOf('Email');
     const seatsCol  = header.indexOf('Seats');
     const totalCol  = header.indexOf('Total Payable');
   
     let booking = null;
     for (let i = 1; i < values.length; i++) {
       if (String(values[i][refCol] || '').trim() === ref) {
         booking = {
           name:  String(values[i][nameCol]  || '').trim(),
           email: String(values[i][emailCol] || '').trim(),
           seats: String(values[i][seatsCol] || '').trim().split(',').map(s => s.trim()).filter(Boolean),
           total: String(values[i][totalCol] || '').trim()
         };
         break;
       }
     }
   
     if (!booking) {
       return corsResponse(JSON.stringify({ success: false, error: 'Booking not found.' }), 200, origin);
     }
   
     // Fetch event details
     let eventTitle = eventId, eventDate = '', venue = '';
     try {
       const evValues = await sheetsRead(env, token, EVENTS_TAB, 'A:L');
       if (evValues && evValues.length > 1) {
         const evH     = evValues[0];
         const evIdCol = evH.indexOf('Event ID');
         const evRow   = evValues.slice(1).find(r => String(r[evIdCol] || '').trim() === eventId);
         if (evRow) {
           eventTitle = String(evRow[evH.indexOf('Event Title')] || '').trim() || eventId;
           eventDate  = String(evRow[evH.indexOf('Date')]        || '').trim();
           venue      = String(evRow[evH.indexOf('Venue')]       || '').trim();
         }
       }
     } catch (e) { console.error('Event details fetch failed:', e); }
   
     await sendTicketEmail(env, token, {
       to: booking.email, name: booking.name,
       eventTitle, eventDate, venue,
       seats: booking.seats, bookingRef: ref,
       eventId, total: booking.total
     });
   
     return corsResponse(JSON.stringify({ success: true, message: `Ticket resent to ${booking.email}` }), 200, origin);
   }
   
   
   // ============================================================
   // OAUTH2
   // ============================================================
   async function getAccessToken(env) {
     const res = await fetch('https://oauth2.googleapis.com/token', {
       method:  'POST',
       headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
       body:    new URLSearchParams({
         client_id:     env.GOOGLE_CLIENT_ID,
         client_secret: env.GOOGLE_CLIENT_SECRET,
         refresh_token: env.GOOGLE_REFRESH_TOKEN,
         grant_type:    'refresh_token'
       })
     });
     const json = await res.json();
     if (!json.access_token) throw new Error(`OAuth2 failed: ${JSON.stringify(json)}`);
     return json.access_token;
   }
   
   
   // ============================================================
   // CORS
   // ============================================================
   function corsResponse(body, status = 200, origin = CORS_ORIGIN) {
     return new Response(body, {
       status,
       headers: {
         'Content-Type':                 'application/json',
         'Access-Control-Allow-Origin':  origin,
         'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
         'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token'
       }
     });
   }