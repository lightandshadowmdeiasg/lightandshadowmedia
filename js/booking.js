// ===== CONFIG =====
// 🔁 Replaced Google Apps Script URL with Cloudflare Worker
const WORKER_URL = 'https://lsm-bookings.lightandshadowmdeiasg.workers.dev';

const EVENTS_SOURCE  = 'https://lsm-bookings.lightandshadowmdeiasg.workers.dev/events';
const SEATMAP_SOURCE = 'data/seatmap.json'; // fallback
const SEATMAP_WORKER = 'https://lsm-bookings.lightandshadowmdeiasg.workers.dev/seatmap';

let seatmap       = {};
let bookedSeats   = new Set();
let selectedSeats = new Set();

function setBookingStatus(message, type = 'info', title = null) {
  const modal   = document.getElementById('statusModal');
  const card    = modal?.querySelector('.status-card');
  const msgEl   = document.getElementById('statusMessage');
  const titleEl = document.getElementById('statusTitle');
  const iconEl  = document.getElementById('statusIcon');

  const closeBtn = modal?.querySelector('.status-close');
  const okBtn    = document.getElementById('statusOkBtn');
  const backdrop = modal?.querySelector('.status-backdrop');

  if (!modal || !card || !msgEl || !titleEl || !iconEl) return;

  msgEl.innerHTML = message;

  const map = {
    info:    { t: 'Please wait',          i: '⏳' },
    success: { t: 'Booking sent',         i: '✅' },
    error:   { t: 'Something went wrong', i: '⚠️' }
  };
  const meta = map[type] || map.info;

  titleEl.textContent = title || meta.t;
  iconEl.textContent  = meta.i;

  card.classList.remove('info', 'success', 'error');
  card.classList.add(type);

  const isBlocking = (type === 'info');
  if (closeBtn)  closeBtn.style.display       = isBlocking ? 'none' : '';
  if (okBtn)     okBtn.style.display          = isBlocking ? 'none' : '';
  if (backdrop)  backdrop.style.pointerEvents = isBlocking ? 'none' : '';

  modal.dataset.blockClose = isBlocking ? '1' : '0';
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
}


// ===== HELPERS =====

function closeStatusModal() {
  const modal = document.getElementById('statusModal');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
}

document.addEventListener('click', (e) => {
  const modal = document.getElementById('statusModal');
  if (!modal) return;
  if (modal.dataset.blockClose === '1') return;
  if (e.target && e.target.matches('[data-close]')) closeStatusModal();
});

document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('statusModal');
  if (!modal) return;
  if (modal.dataset.blockClose === '1') return;
  if (e.key === 'Escape') closeStatusModal();
});


function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' });
}


// ===== MAIN =====
document.addEventListener('DOMContentLoaded', () => {

  const eventId            = getQueryParam('eventId');
  const titleEl            = document.getElementById('eventTitle');
  const metaEl             = document.getElementById('eventMeta');
  const eventIdInput       = document.getElementById('eventId');
  const eventDateInput     = document.getElementById('eventDate');
  const eventVenueInput    = document.getElementById('eventVenue');
  const eventTitleHidden   = document.getElementById('eventTitleHidden');
  const seatGrid           = document.getElementById('seatGrid');
  const selectedSeatsLabel = document.getElementById('selectedSeatsLabel');
  const selectedSeatsInput = document.getElementById('selectedSeats');
  const bookingForm        = document.getElementById('bookingForm');
  const submitBtn          = document.getElementById('submitBooking');

  let currentEvent = null;

  if (!eventId) {
    titleEl.textContent = 'Event not found';
    metaEl.textContent  = 'Missing event ID.';
    seatGrid.innerHTML  = '<tr><td colspan="100"><p style="color:#a0a0a8;">No event selected.</p></td></tr>';
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
        metaEl.textContent  = 'Please go back and choose an event again.';
        return;
      }

      titleEl.textContent    = currentEvent.title;
      metaEl.textContent     = `${currentEvent.venue} • ${formatDateLabel(currentEvent.date)}`;
      eventIdInput.value     = currentEvent.id;
      eventDateInput.value   = currentEvent.date;
      eventVenueInput.value  = currentEvent.venue;
      eventTitleHidden.value = currentEvent.title;

      loadSeatMap();
    })
    .catch(err => {
      console.error('Failed to load events.json:', err);
      titleEl.textContent = 'Error loading event';
      metaEl.textContent  = 'Please try again later.';
    });


  // ==========================================================
  // LOAD SEATMAP
  // ==========================================================
  function loadSeatMap() {
    // Try worker seatmap first (has per-event zone/price/override config)
    fetch(`${SEATMAP_WORKER}?eventId=${encodeURIComponent(eventId)}`)
      .then(res => res.json())
      .then(workerData => {
        if (workerData.useDefault) {
          // No override — load from seatmap.json as before
          return fetch(SEATMAP_SOURCE).then(r => r.json()).then(data => {
            seatmap = data;
            loadBookedSeats();
          });
        }
        // Has override — load base seatmap.json then apply overrides
        return fetch(SEATMAP_SOURCE).then(r => r.json()).then(baseData => {
          seatmap = applySeatmapOverrides(baseData, workerData);
          loadBookedSeats();
        });
      })
      .catch(err => {
        console.error('Seatmap load failed, using default:', err);
        fetch(SEATMAP_SOURCE)
          .then(res => res.json())
          .then(data => { seatmap = data; loadBookedSeats(); })
          .catch(() => {
            seatGrid.innerHTML = '<tr><td colspan="100"><p style="color:#a0a0a8;">Unable to load seating layout.</p></td></tr>';
          });
      });
  }

  // Apply per-event zone/state overrides onto base seatmap.json
  function applySeatmapOverrides(base, config) {
    const result = JSON.parse(JSON.stringify(base));

    // Override zone definitions (price + color)
    if (config.zones && Object.keys(config.zones).length) {
      result.zones = config.zones;
    }

    // Apply individual seat overrides
    if (config.overrides && Object.keys(config.overrides).length) {
      Object.keys(result.SEATPLAN).forEach(rowKey => {
        if (!/^[A-Z]$/.test(rowKey.trim())) return;
        result.SEATPLAN[rowKey] = result.SEATPLAN[rowKey].map(cell => {
          if (!cell || cell === 'AISLE') return cell;
          if (typeof cell === 'object' && cell.type)  return cell;
          if (typeof cell === 'object' && cell.seat != null) {
            const code = `${rowKey.trim()}${cell.seat}`;
            const ov   = config.overrides[code];
            if (ov) return { ...cell, zone: ov.zone || cell.zone, state: ov.state || cell.state || 'AVAILABLE' };
          }
          return cell;
        });
      });
    }

    return result;
  }

  function getAllSeatCodesFromSeatmap() {
    const codes = new Set();
    const plan  = seatmap?.SEATPLAN;
    if (!plan) return codes;

    Object.keys(plan).forEach(rowKey => {
      if (!/^[A-Z]$/.test(rowKey)) return;
      const layout = plan[rowKey];
      if (!Array.isArray(layout)) return;
      layout.forEach(cell => {
        if (cell === null || cell === undefined || cell === '' || cell === 'AISLE') return;
        if (typeof cell === 'object' && cell && cell.type) return;
        if (typeof cell === 'object' && cell && cell.seat != null) {
          const seatNum = String(cell.seat).trim();
          if (seatNum) codes.add(`${rowKey}${seatNum}`);
          return;
        }
        if (typeof cell === 'number') {
          codes.add(`${rowKey}${String(cell).trim()}`);
        }
      });
    });
    return codes;
  }

  function updateSeatCountsUI() {
    const allSeats   = getAllSeatCodesFromSeatmap();
    let bookedCount  = 0;
    bookedSeats.forEach(code => { if (allSeats.has(code)) bookedCount++; });
    const available  = Math.max(0, allSeats.size - bookedCount);

    const bookedEl    = document.getElementById('bookedCount');
    const availableEl = document.getElementById('availableCount');
    if (bookedEl)    bookedEl.textContent    = String(bookedCount);
    if (availableEl) availableEl.textContent = String(available);
  }


  // ==========================================================
  // LOAD BOOKED SEATS — now from Cloudflare Worker
  // ==========================================================
  function loadBookedSeats() {
    const url = `${WORKER_URL}?eventId=${encodeURIComponent(eventId)}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.bookedSeats)) {
          bookedSeats = new Set(data.bookedSeats);
        }
        updateSeatCountsUI();
        buildSeatMap();
      })
      .catch(err => {
        console.error('Failed to load booked seats:', err);
        updateSeatCountsUI();
        buildSeatMap();
      });
  }


  // ==========================================================
  // BUILD SEAT MAP (unchanged)
  // ==========================================================
  function buildSeatMap() {
    seatGrid.innerHTML = '';
    const sections = [];
    if (seatmap.SEATPLAN) sections.push({ name: ' ', rows: seatmap.SEATPLAN });

    sections.forEach((section, sectionIndex) => {
      if (sectionIndex > 0) {
        ['', ''].forEach(() => {
          const s = document.createElement('tr');
          s.innerHTML = '<td>&nbsp;</td>';
          seatGrid.appendChild(s);
        });
      }

      const headerRow      = document.createElement('tr');
      headerRow.align      = 'center';
      const headerCell     = document.createElement('td');
      headerCell.className = 'MovieClass';
      headerCell.colSpan   = 250;
      headerCell.textContent = section.name;
      headerRow.appendChild(headerCell);
      seatGrid.appendChild(headerRow);
      seatGrid.appendChild(document.createElement('tr'));

      const rowKeys    = Object.keys(section.rows);
      const letterRows = rowKeys.filter(k => /^[A-Z]$/.test(k)).sort((a, b) => a.localeCompare(b));
      const specialRows= rowKeys.filter(k => !/^[A-Z]$/.test(k));

      const rowLetters = [];
      letterRows.forEach(r => {
        rowLetters.push(r);
        if (r === 'I' && specialRows.includes(' '))  rowLetters.push(' ');
        if (r === 'S' && specialRows.includes('  ')) rowLetters.push('  ');
      });
      specialRows.forEach(k => { if (!rowLetters.includes(k)) rowLetters.push(k); });

      function isLayoutEmpty(layout) {
        if (!Array.isArray(layout) || layout.length === 0) return true;
        return layout.every(c => c === null || c === undefined || c === '' || c === 'AISLE');
      }

      rowLetters.forEach(rowLetter => {
        const layout = section.rows[rowLetter];

        if (isLayoutEmpty(layout)) {
          const spacer = document.createElement('tr');
          spacer.innerHTML = `<td colspan="250">&nbsp;</td>`;
          seatGrid.appendChild(spacer);
          return;
        }

        const tr    = document.createElement('tr');
        tr.align    = 'center';
        const lTd   = document.createElement('td');
        lTd.className   = 'row-label';
        lTd.textContent = rowLetter;
        tr.appendChild(lTd);

        layout.forEach(cell => {
          const td = document.createElement('td');

          if (cell === null || cell === undefined || cell === '') {
            td.innerHTML = '&nbsp;'; tr.appendChild(td); return;
          }
          if (cell === 'AISLE') {
            td.innerHTML = '&nbsp;'; td.style.width = '18px'; tr.appendChild(td); return;
          }
          if (typeof cell === 'object' && cell && cell.type) {
            const itd    = document.createElement('td');
            itd.className = 'seat-icon-cell';
            const label   = (cell.label || cell.type).toUpperCase();
            if (cell.type === 'TOILET') {
              itd.innerHTML = `<div class="seat-sign seat-sign--toilet" title="${cell.label||'Toilet'}"><span class="seat-sign__icon">🚻</span><span class="seat-sign__text">${label==='TOILET'?'WC':label}</span></div>`;
            } else if (cell.type === 'EXIT') {
              itd.innerHTML = `<div class="seat-sign seat-sign--exit" title="${cell.label||'Exit'}"><span class="seat-sign__icon">⛔</span><span class="seat-sign__text">${label}</span></div>`;
            } else {
              itd.innerHTML = `<div class="seat-sign" title="${label}"><span class="seat-sign__text">${label}</span></div>`;
            }
            tr.appendChild(itd); return;
          }

          let seatNum, zoneKey, isUnavailable = false;
          if (typeof cell === 'number' || typeof cell === 'string') {
            seatNum = String(cell); zoneKey = null;
          } else if (typeof cell === 'object' && cell && cell.seat != null) {
            seatNum       = String(cell.seat);
            zoneKey       = cell.zone || null;
            isUnavailable = String(cell.state || '').toUpperCase() === 'UNAVAILABLE';
          } else {
            td.innerHTML = '&nbsp;'; tr.appendChild(td); return;
          }

          const seatCode = `${rowLetter}${seatNum}`;
          const wrapper  = document.createElement('div');
          wrapper.className = 'squaredCheckBoxStyle' + (isUnavailable ? ' is-unavailable' : '');
          if (zoneKey) wrapper.dataset.zone = zoneKey;

          const cb    = document.createElement('input');
          cb.type     = 'checkbox';
          cb.name     = 'SelectSeatCheckBoxGroup';
          cb.value    = seatCode;
          cb.id       = seatCode;
          if (zoneKey) cb.dataset.zone = zoneKey;
          cb.disabled = isUnavailable || bookedSeats.has(seatCode);

          const lbl    = document.createElement('label');
          lbl.htmlFor  = seatCode;
          lbl.title    = isUnavailable ? 'Unavailable' : '';
          lbl.innerHTML = `<span class="seat-num">${seatNum}</span>`;

          wrapper.appendChild(cb);
          wrapper.appendChild(lbl);
          td.appendChild(wrapper);
          tr.appendChild(td);
        });

        seatGrid.appendChild(tr);
      });
    });

    attachCheckboxListeners();
    applyZoneColors();
  }


  function attachCheckboxListeners() {
    document.querySelectorAll('.squaredCheckBoxStyle input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', updateSelectedSeats);
    });
  }

  function updateSelectedSeats() {
    const checked     = document.querySelectorAll('.squaredCheckBoxStyle input[type="checkbox"]:checked');
    selectedSeats     = new Set(Array.from(checked).map(cb => cb.value));
    const sorted      = Array.from(selectedSeats).sort();
    selectedSeatsInput.value = sorted.join(', ');

    selectedSeatsLabel.innerHTML = sorted.length === 0
      ? '<span style="color:#888;">No seats selected</span>'
      : sorted.map(s => `<span class="seat-tag">${s}</span>`).join('');

    const zones = seatmap.zones || {};
    let total   = 0;
    checked.forEach(cb => {
      const zk = cb.dataset.zone;
      if (zk && zones[zk] && typeof zones[zk].price === 'number') total += zones[zk].price;
    });
    const totalEl = document.getElementById('totalPriceLabel');
    if (totalEl) totalEl.textContent = `$${total}`;
  }


  // ==========================================================
  // FORM SUBMIT — POST to Cloudflare Worker
  // ==========================================================
  bookingForm.addEventListener('submit', e => {
    e.preventDefault();

    const name  = bookingForm.name.value.trim();
    const email = bookingForm.email.value.trim();
    const phone = bookingForm.phone.value.trim();
    const seats = selectedSeatsInput.value.trim();

    if (!seats) { setBookingStatus('Please select at least one seat.', 'error'); return; }
    if (!name || !email || !phone) { setBookingStatus('Please fill in all details.', 'error'); return; }

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Submitting...';
    setBookingStatus('Submitting your booking… please wait.', 'info');

    const zones        = seatmap.zones || {};
    const checkedBoxes = document.querySelectorAll('.squaredCheckBoxStyle input[type="checkbox"]:checked');

    const seatDetails = Array.from(checkedBoxes).map(cb => {
      const zone  = cb.dataset.zone || null;
      const price = zone && zones[zone] && typeof zones[zone].price === 'number' ? zones[zone].price : 0;
      return { seat: cb.value, zone, price };
    });

    const totalPrice = seatDetails.reduce((sum, s) => sum + (s.price || 0), 0);

    const payload = {
      eventId:    eventIdInput.value,
      eventTitle: eventTitleHidden.value,
      eventDate:  eventDateInput.value,
      venue:      eventVenueInput.value,
      seats:      seatDetails.map(s => s.seat).join(', '),
      seatDetails,
      totalPrice,
      name,
      email,
      phone
    };

    const formData = new FormData();
    formData.append('data', JSON.stringify(payload));

    fetch(WORKER_URL, { method: 'POST', body: formData })
      .then(res => res.json().catch(() => null))
      .then(data => {
        if (!data) {
          setBookingStatus('❌ Something went wrong. Please try again.', 'error');
          submitBtn.disabled    = false;
          submitBtn.textContent = 'Confirm Booking';
          return;
        }

        if (data.conflict) {
          const taken = (data.conflictSeats || []).join(', ');
          setBookingStatus(`❌ These seats were just booked: ${taken}. Please choose others.`, 'error');
          submitBtn.disabled    = false;
          submitBtn.textContent = 'Confirm Booking';
          selectedSeats.clear();
          selectedSeatsInput.value = '';
          bookingForm.reset();
          loadSeatMap();
          return;
        }

        if (data.success && data.paynow) {
          // PayNow flow — show QR + instructions, confirmation email already sent
          const ref      = data.bookingRef || '';
          const UEN      = '53384102W';
          // Generate PayNow QR via api.qrserver.com
          // PayNow QR string format per ABS spec
          const paynowStr = `00020101021226370009SG.PAYNOW010120210${UEN.length}${UEN}52040000530370254${String(totalPrice.toFixed(2)).length}${totalPrice.toFixed(2)}5802SG5920LIGHT AND SHADOW MEDIA6009Singapore62${(4 + ref.length).toString().padStart(2,'0')}0508${ref.slice(0,20)}6304`;
          const qrUrl    = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paynowStr)}`;

          setBookingStatus(
            `<div style="text-align:center;margin-bottom:16px;">` +
            `<img src="${qrUrl}" alt="PayNow QR" style="width:180px;height:180px;border:4px solid #c9a227;border-radius:8px;display:block;margin:0 auto 8px;">` +
            `<div style="font-size:0.75rem;color:#888;">Scan with your banking app</div>` +
            `</div>` +
            `<b>UEN: 53384102W</b> &nbsp;(LIGHT AND SHADOW MEDIA)<br>` +
            `<b>Amount: SGD $${totalPrice.toFixed(2)}</b><br>` +
            `<b>Reference: ${ref}</b><br><br>` +
            `Booking လက်ခံရှိပါသည်။ Email စစ်ဆေးပါ။<br>` +
            `Screenshot ကို <b>ShweTV Messenger</b> ပို့ပါ။<br>` +
            `<span style="font-size:0.85rem;color:#888;">၂၄ နာရီအတွင်း E-ticket ပို့မည်။</span>`,
            'success',
            'Pay via PayNow'
          );
          selectedSeats.clear();
          selectedSeatsInput.value = '';
          bookingForm.reset();
          loadSeatMap();
          return;
        }

        // Error
        setBookingStatus(data.error || '❌ Booking failed. Please try again.', 'error');
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Confirm Booking';
      })
      .catch(err => {
        console.error('Booking error:', err);
        setBookingStatus('Network error. Please try again.', 'error');
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Confirm Booking';
      });
  });

  function applyZoneColors() {
    const zones = seatmap.zones || {};
    document.querySelectorAll('.squaredCheckBoxStyle[data-zone]').forEach(el => {
      const z = zones[el.dataset.zone];
      if (z?.color) el.style.setProperty('--zone-color', z.color);
    });
  }

});