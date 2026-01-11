// ===== CONFIG =====
const GOOGLE_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbyd6UkEWZAvwhMoo5pdnwu5UQRNMFGWcw45ykiRKZP3NUnzZ68kz0aNw1pA2hV2JgbW/exec';
  

const EVENTS_SOURCE = 'data/live-events.json';
const SEATMAP_SOURCE = 'data/seatmap.json';

let seatmap = {};
let bookedSeats = new Set();
let selectedSeats = new Set();


// ===== HELPERS =====
function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-SG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}


// ===== MAIN =====
document.addEventListener('DOMContentLoaded', () => {

  const eventId = getQueryParam('eventId');

  const titleEl = document.getElementById('eventTitle');
  const metaEl = document.getElementById('eventMeta');

  const eventIdInput = document.getElementById('eventId');
  const eventDateInput = document.getElementById('eventDate');
  const eventVenueInput = document.getElementById('eventVenue');
  const eventTitleHidden = document.getElementById('eventTitleHidden');

  const seatGrid = document.getElementById('seatGrid');
  const selectedSeatsLabel = document.getElementById('selectedSeatsLabel');
  const selectedSeatsInput = document.getElementById('selectedSeats');
  const bookingForm = document.getElementById('bookingForm');
  const bookingStatus = document.getElementById('bookingStatus');
  const submitBtn = document.getElementById('submitBooking');

  let currentEvent = null;


  // ---------------------------
  // If no eventId provided
  // ---------------------------
  if (!eventId) {
    titleEl.textContent = 'Event not found';
    metaEl.textContent = 'Missing event ID.';
    seatGrid.innerHTML = '<tr><td colspan="100"><p style="color:#a0a0a8;">No event selected.</p></td></tr>';
    return;
  }


  // ---------------------------
  // Load event details
  // ---------------------------
  fetch(EVENTS_SOURCE)
    .then(res => res.json())
    .then(data => {
      const events = data.events || [];
      currentEvent = events.find(e => e.id === eventId);

      if (!currentEvent) {
        titleEl.textContent = 'Event not found';
        metaEl.textContent = 'Please go back and choose an event again.';
        return;
      }

      // Fill UI
      titleEl.textContent = currentEvent.title;
      metaEl.textContent = `${currentEvent.venue} • ${formatDateLabel(currentEvent.date)}`;

      // Hidden fields
      eventIdInput.value = currentEvent.id;
      eventDateInput.value = currentEvent.date;
      eventVenueInput.value = currentEvent.venue;
      eventTitleHidden.value = currentEvent.title;

      // Now load seatmap.json
      loadSeatMap();
    })
    .catch(err => {
      console.error("Failed to load events.json:", err);
      titleEl.textContent = 'Error loading event';
      metaEl.textContent = 'Please try again later.';
    });



  // ==========================================================
  // LOAD SEATMAP
  // ==========================================================
  function loadSeatMap() {
    fetch(SEATMAP_SOURCE)
      .then(res => res.json())
      .then(data => {
        console.log("Loaded seatmap:", data);
        seatmap = data;
      

        // After loading layout, load booked seats
        loadBookedSeats();
      })
      .catch(err => {
        console.error("Failed to load seatmap.json:", err);
        seatGrid.innerHTML =
          '<tr><td colspan="100"><p style="color:#a0a0a8;">Unable to load seating layout.</p></td></tr>';
      });
  }



  // ==========================================================
  // LOAD BOOKED SEATS FROM GOOGLE SHEETS
  // ==========================================================
  function loadBookedSeats() {
    const url = `${GOOGLE_SCRIPT_URL}?eventId=${encodeURIComponent(eventId)}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        console.log("Booked seats:", data);

        if (Array.isArray(data.bookedSeats)) {
          bookedSeats = new Set(data.bookedSeats);
        }

        // Now build UI
        buildSeatMap();
      })
      .catch(err => {
        console.error("Failed to load booked seats:", err);
        buildSeatMap();
      });
  }



  // ==========================================================
  // BUILD EXACT CARNIVAL CINEMA SEAT MAP
  // ==========================================================
  function buildSeatMap() {
    seatGrid.innerHTML = '';

    // Get sections from seatmap
    const sections = [];
    
    // Add PREMIUM section if exists
    // if (seatmap.PREMIUM) {
    //   sections.push({ name: 'PREMIUM', rows: seatmap.PREMIUM });
    // }
    
    // Add PLATINUM section if exists
    if (seatmap.SEATPLAN) {
      sections.push({ name: ' ', rows: seatmap.SEATPLAN });
    }

    sections.forEach((section, sectionIndex) => {
      // Add spacing before section (except first)
      if (sectionIndex > 0) {
        const spacerRow = document.createElement('tr');
        spacerRow.innerHTML = '<td>&nbsp;</td>';
        seatGrid.appendChild(spacerRow);
        
        const spacerRow2 = document.createElement('tr');
        spacerRow2.innerHTML = '<td>&nbsp;</td>';
        seatGrid.appendChild(spacerRow2);
      }

      // Add section header
      const headerRow = document.createElement('tr');
      headerRow.align = 'center';
      const headerCell = document.createElement('td');
      headerCell.className = 'MovieClass';
      headerCell.colSpan = 250;
      headerCell.textContent = section.name;
      headerRow.appendChild(headerCell);
      seatGrid.appendChild(headerRow);

      // Empty row after header
      const emptyRow = document.createElement('tr');
      seatGrid.appendChild(emptyRow);

      // Build each row in the section
      // Build each row in the section
      const rowKeys = Object.keys(section.rows);

      // Helper: A–Z letter rows only
      const letterRows = rowKeys
        .filter(k => /^[A-Z]$/.test(k))
        .sort((a, b) => a.localeCompare(b));

      // Helper: non-letter rows (your " " and "  ")
      const specialRows = rowKeys.filter(k => !/^[A-Z]$/.test(k));

      // Choose where to insert your special rows:
      // - " " will be inserted AFTER row I (so it sits between I and J)
      // - "  " will be inserted AFTER row S (so it sits between S and T)
      const rowLetters = [];
      letterRows.forEach(r => {
        rowLetters.push(r);

        if (r === 'I' && specialRows.includes(' ')) rowLetters.push(' ');
        if (r === 'S' && specialRows.includes('  ')) rowLetters.push('  ');
      });

      // If any other special rows exist, append at end
      specialRows.forEach(k => {
        if (!rowLetters.includes(k)) rowLetters.push(k);
      });

      

    const COLSPAN = 250; // same as header colSpan (keep consistent)

    function isLayoutEmpty(layout) {
      if (!Array.isArray(layout) || layout.length === 0) return true;

      // empty row = only gaps/aisles
      return layout.every(cell =>
        cell === null ||
        cell === undefined ||
        cell === '' ||
        cell === 'AISLE'
      );
    }

    rowLetters.forEach(rowLetter => {
      const layout = section.rows[rowLetter]; // array like [1,2,null,'AISLE',5...]

      // ✅ If row is empty, render spacer row WITHOUT label (prevents "C D E" single lines)
      if (isLayoutEmpty(layout)) {
        const spacer = document.createElement('tr');
        spacer.innerHTML = `<td colspan="${COLSPAN}">&nbsp;</td>`;
        seatGrid.appendChild(spacer);
        return;
      }

      const tr = document.createElement('tr');
      tr.align = 'center';

      // Row label
      const labelTd = document.createElement('td');
      labelTd.className = 'row-label';
      labelTd.textContent = rowLetter;
      tr.appendChild(labelTd);

      // Render row cells exactly as your layout array
      layout.forEach(cell => {
        const td = document.createElement('td');

        // 1) Empty gap
        if (cell === null || cell === undefined || cell === '') {
          td.innerHTML = '&nbsp;';
          tr.appendChild(td);
          return;
        }

        // 2) Aisle
        if (cell === 'AISLE') {
          td.innerHTML = '&nbsp;';
          td.style.width = '18px'; // aisle width
          tr.appendChild(td);
          return;
        }
       // Custom tag objects (TOILET, EXIT, etc.)
if (typeof cell === 'object' && cell && cell.type) {
  const td = document.createElement('td');
  td.className = 'seat-icon-cell';

  const label = (cell.label || cell.type).toUpperCase();

  if (cell.type === 'TOILET') {
    td.innerHTML = `
      <div class="seat-sign seat-sign--toilet" title="${cell.label || 'Toilet'}">
        <span class="seat-sign__icon">🚻</span>
        <span class="seat-sign__text">${label === 'TOILET' ? 'WC' : label}</span>
      </div>
    `;
  } else if (cell.type === 'EXIT') {
    td.innerHTML = `
      <div class="seat-sign seat-sign--exit" title="${cell.label || 'Exit'}">
        <span class="seat-sign__icon">⛔</span>
        <span class="seat-sign__text">${label}</span>
      </div>
    `;
  } else {
    td.innerHTML = `
      <div class="seat-sign" title="${label}">
        <span class="seat-sign__text">${label}</span>
      </div>
    `;
  }

  tr.appendChild(td);
  return;
}

        // 3) Seat (supports number OR { seat, zone })
let seatNum, zoneKey;

if (typeof cell === 'number' || typeof cell === 'string') {
  seatNum = String(cell);
  zoneKey = null; // unknown
} else if (typeof cell === 'object' && cell && cell.seat != null) {
  seatNum = String(cell.seat);
  zoneKey = cell.zone || null;
} else {
  // fallback gap
  td.innerHTML = '&nbsp;';
  tr.appendChild(td);
  return;
}

const seatCode = `${rowLetter}${seatNum}`;

const checkboxWrapper = document.createElement('div');
checkboxWrapper.className = 'squaredCheckBoxStyle';

// Add zone styling if available
if (zoneKey) {
  checkboxWrapper.dataset.zone = zoneKey;
}

const checkbox = document.createElement('input');
checkbox.type = 'checkbox';
checkbox.name = 'SelectSeatCheckBoxGroup';
checkbox.value = seatCode;
checkbox.id = seatCode;

// Store zone on checkbox so we can price later
if (zoneKey) checkbox.dataset.zone = zoneKey;

if (bookedSeats.has(seatCode)) checkbox.disabled = true;

const label = document.createElement('label');
label.htmlFor = seatCode;

checkboxWrapper.appendChild(checkbox);
checkboxWrapper.appendChild(label);
td.appendChild(checkboxWrapper);

tr.appendChild(td);

      });

      seatGrid.appendChild(tr);
    });

    });

    // Attach event listeners to all checkboxes
    attachCheckboxListeners();
    applyZoneColors();

  }



  // ==========================================================
  // ATTACH CHECKBOX LISTENERS
  // ==========================================================
  function attachCheckboxListeners() {
    const checkboxes = document.querySelectorAll('.squaredCheckBoxStyle input[type="checkbox"]');
    
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', function() {
        updateSelectedSeats();
      });
    });
  }



  // ==========================================================
  // UPDATE SELECTED SEATS DISPLAY
  // ==========================================================
  function updateSelectedSeats() {
    const checkedBoxes = document.querySelectorAll('.squaredCheckBoxStyle input[type="checkbox"]:checked');
    selectedSeats = new Set(Array.from(checkedBoxes).map(cb => cb.value));
  
    const sortedSeats = Array.from(selectedSeats).sort();
  
    selectedSeatsInput.value = sortedSeats.join(', ');
  
    // tags display
    if (sortedSeats.length === 0) {
      selectedSeatsLabel.innerHTML = '<span style="color: #888;">No seats selected</span>';
    } else {
      selectedSeatsLabel.innerHTML = sortedSeats
        .map(seat => `<span class="seat-tag">${seat}</span>`)
        .join('');
    }
  
    // total price
    const zones = seatmap.zones || {};
    let total = 0;
  
    checkedBoxes.forEach(cb => {
      const zk = cb.dataset.zone;
      if (zk && zones[zk] && typeof zones[zk].price === 'number') {
        total += zones[zk].price;
      }
    });
  
    const totalEl = document.getElementById('totalPriceLabel');
    if (totalEl) totalEl.textContent = `$${total}`;
  }
  



  // ==========================================================
  // BOOKING FORM SUBMIT
  // ==========================================================
  bookingForm.addEventListener('submit', e => {
    e.preventDefault();

    const name = bookingForm.name.value.trim();
    const email = bookingForm.email.value.trim();
    const phone = bookingForm.phone.value.trim();
    const seats = selectedSeatsInput.value.trim();

    if (!seats) {
      bookingStatus.textContent = 'Please select at least one seat.';
      bookingStatus.style.color = '#ff6b6b';
      return;
    }
    if (!name || !email || !phone) {
      bookingStatus.textContent = 'Please fill in all details.';
      bookingStatus.style.color = '#ff6b6b';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    bookingStatus.textContent = '';
    bookingStatus.style.color = '#a0a0a8';

 
    const zones = seatmap.zones || {};
    const checkedBoxes = document.querySelectorAll('.squaredCheckBoxStyle input[type="checkbox"]:checked');

    const seatDetails = Array.from(checkedBoxes).map(cb => {
    const zone = cb.dataset.zone || null;
    const price = zone && zones[zone] && typeof zones[zone].price === 'number'
     ? zones[zone].price
     : 0;

    return { seat: cb.value, zone, price };
    });

    const totalPrice = seatDetails.reduce((sum, s) => sum + (s.price || 0), 0);


    const payload = {
      
      eventId: eventIdInput.value,
      eventTitle: eventTitleHidden.value,
      eventDate: eventDateInput.value,
      venue: eventVenueInput.value,
      seats: seatDetails.map(s => s.seat).join(', '),
      seatDetails,
      totalPrice,
      name,
      email,
      phone
    };

    const formData = new FormData();
    formData.append('data', JSON.stringify(payload));

    fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: formData })
      .then(res => res.json().catch(() => null))
      .then(data => {
        console.log("Booking response:", data);

        if (!data || typeof data.success === 'undefined') {
          bookingStatus.textContent = 'Booking submitted! We will contact you soon.';
          bookingStatus.style.color = '#c9a227';
        }
        else if (data.success) {
          bookingStatus.textContent = data.message || 'Booking confirm! Kindly Check Your Email for payment.';
          bookingStatus.style.color = '#c9a227';
        }
        else if (data.conflict) {
          const taken = (data.conflictSeats || []).join(', ');
          bookingStatus.textContent =
            `Sorry, these seats were just booked: ${taken}. Choose others.`;
          bookingStatus.style.color = '#ff6b6b';
        }
        else {
          bookingStatus.textContent = data.message || 'Booking failed.';
          bookingStatus.style.color = '#ff6b6b';
        }

        // Reset UI
        selectedSeats.clear();
        selectedSeatsInput.value = '';
        bookingForm.reset();

        // Reload everything cleanly
        loadSeatMap();
      })
      .catch(err => {
        console.error("Booking error:", err);
        bookingStatus.textContent = 'Network error. Please try again.';
        bookingStatus.style.color = '#ff6b6b';
      })
      .finally(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm Booking';
      });
  });

  function applyZoneColors() {
    const zones = seatmap.zones || {};
    document.querySelectorAll('.squaredCheckBoxStyle[data-zone]').forEach(el => {
      const zk = el.dataset.zone;
      const z = zones[zk];
      if (z?.color) el.style.setProperty('--zone-color', z.color);
    });
  }
  

});