// ==========================================
// 🛡️ BULLETPROOF EVENT BINDER
// ==========================================
const safeBind = (id, event, callback) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, callback);
};

// ==========================================
// ✨ BEAUTIFUL CUSTOM ALERT
// ==========================================
window.originalAlert = window.alert;
window.alert = function(msg) {
    const existing = document.getElementById('custom-alert-modal');
    if (existing) existing.remove();
    const modalHtml = `
    <div class="modal fade" id="custom-alert-modal" tabindex="-1" aria-hidden="true" style="z-index: 1060;">
      <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content border-0 shadow-lg" style="background: #1e1e1e; border: 1px solid #333 !important; border-radius: 12px;">
          <div class="modal-body text-center p-4">
            <p class="text-white mb-4 mt-2" style="white-space: pre-wrap; font-size: 16px; font-weight: 500;">${msg}</p>
            <button type="button" class="btn btn-danger w-100 rounded-pill fw-bold py-2" data-bs-dismiss="modal">OK</button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('custom-alert-modal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
    modalEl.addEventListener('hidden.bs.modal', () => { modalEl.remove(); });
};

// Global State
let isLoginMode = true;
let currentEventId = null;
let currentEventPrice = 0; 
let currentEventType = null;
let currentSelectedDate = null; 
let currentSelectedTime = null; 
let allEvents = []; 
let currentCategoryFilter = 'All'; 
let pendingPaymentData = null;
let paymentModalInstance = null;
let finalCheckoutTotal = 0;
let cancelModalInstance = null; 

let currentLocationFilter = localStorage.getItem('userCity') || 'All Cities';

let initialEventsPromise = fetch(`/api/events?t=${new Date().getTime()}`)
    .then(res => res.ok ? res.json() : [])
    .catch(() => []);

function formatLocalYYYYMMDD(dateObj) {
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
}

// 🚨 4-Day Rolling Window Logic
function getNextFourDays() {
    const dates = [];
    let today = new Date();
    today.setHours(0,0,0,0);
    for(let i = 0; i < 4; i++) {
        let d = new Date(today);
        d.setDate(d.getDate() + i);
        dates.push(d);
    }
    return dates;
}

const socket = typeof io !== 'undefined' ? io() : null;
if (socket) {
    socket.on('seatUpdate', async (data) => {
        if (String(currentEventId) === String(data.eventId) && currentSelectedDate === data.date && currentSelectedTime === data.timeSlot) {
            if (data.seatId && data.status) {
                const seatMapEl = document.getElementById('seat-map');
                if (seatMapEl) {
                    const btn = seatMapEl.querySelector(`button[data-id="${data.seatId}"]`);
                    if (btn) {
                        if (data.status === 'Available') {
                            btn.classList.remove('booked', 'disabled', 'selected');
                            btn.classList.add('available');
                        } else if (data.status === 'Locked') {
                            if (!btn.classList.contains('selected')) {
                                btn.classList.remove('available', 'selected');
                                btn.classList.add('booked', 'disabled');
                            }
                        } else if (data.status === 'Booked') {
                            btn.classList.remove('available', 'selected');
                            btn.classList.add('booked', 'disabled');
                        }
                        updateOrderSummary();
                    }
                }
            } else {
                await loadEventDataForDateAndTime(currentSelectedDate, currentSelectedTime, true); 
            }
        }
    });
    socket.on('eventUpdate', async () => { await refreshGlobalEvents(); });
}

function handlePossibleForceLogout(data) {
    if (data.forceLogout) {
        alert("🚨 Session Terminated: " + data.message);
        document.getElementById('logout-btn')?.click();
        return true;
    }
    return false;
}

function checkEventExpirations() {
    const now = new Date();
    let needsRefresh = false;
    
    allEvents.forEach(e => {
        const isExpired = now > new Date(e.endDate);
        const cardRendered = document.querySelector(`.event-card[data-id="${e._id}"]`);
        
        if (isExpired && cardRendered) {
            needsRefresh = true; 
            if (currentEventId === String(e._id)) {
                alert("⏳ Time's up! This event has officially ended.");
                switchView('booking-section');
            }
        }
    });
    
    if (needsRefresh) applyFilters(); 
}
setInterval(checkEventExpirations, 10000);

async function refreshGlobalEvents() {
    try {
        const res = await fetch(`/api/events?t=${new Date().getTime()}`);
        if (res.ok) {
            allEvents = await res.json(); 
            renderLocationModal();
            checkEventExpirations(); 
            applyFilters();
        }
    } catch(err) { console.warn("Live sync failed", err); }
}

const switchView = (viewId) => {
    ['auth-section', 'booking-section', 'profile-section', 'tickets-section', 'action-section', 'ticket-detail-section'].forEach(id => {
        document.getElementById(id)?.classList.add('d-none');
    });
    document.getElementById(viewId)?.classList.remove('d-none');
    window.scrollTo({ top: 0, behavior: 'auto' });

    const navbarCollapse = document.getElementById('mobileNavbar');
    if (navbarCollapse && navbarCollapse.classList.contains('show')) {
        document.querySelector('.navbar-toggler')?.click();
    }

    const badge = document.getElementById('developer-portfolio-badge');
    if (badge) {
        if (viewId === 'auth-section') {
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
};

safeBind('home-logo', 'click', (e) => { e.preventDefault(); switchView('booking-section'); updateMobileNav('btn-nav-home'); });
safeBind('back-to-events-btn', 'click', (e) => { e.preventDefault(); switchView('booking-section'); updateMobileNav('btn-nav-home'); });

// Mobile Navigation
function updateMobileNav(activeId) {
    document.querySelectorAll('.nav-item-mobile').forEach(el => el.classList.remove('active'));
    document.getElementById(activeId)?.classList.add('active');
}
safeBind('btn-nav-home', 'click', (e) => { e.preventDefault(); switchView('booking-section'); updateMobileNav('btn-nav-home'); });
safeBind('btn-nav-search', 'click', (e) => { e.preventDefault(); updateMobileNav('btn-nav-search'); });
safeBind('btn-nav-tickets', 'click', (e) => { e.preventDefault(); document.getElementById('nav-bookings-link').click(); updateMobileNav('btn-nav-tickets'); });
safeBind('btn-nav-profile', 'click', (e) => { e.preventDefault(); document.getElementById('profile-link-btn').click(); updateMobileNav('btn-nav-profile'); });

const setupAuthMode = (isLogin) => {
    isLoginMode = isLogin;
    const title = document.getElementById('auth-title');
    const btn = document.getElementById('auth-submit-btn');
    
    if (title) title.innerText = isLogin ? 'Sign In' : 'Create Account';
    if (btn) btn.innerText = isLogin ? 'Sign In' : 'Sign Up';
    switchView('auth-section');
    
    const bottomNav = document.getElementById('bottom-navbar');
    if (bottomNav) bottomNav.classList.add('d-none');
};

safeBind('nav-signin-btn', 'click', (e) => { e.preventDefault(); setupAuthMode(true); });
safeBind('nav-signup-btn', 'click', (e) => { e.preventDefault(); setupAuthMode(false); });

safeBind('toggle-password', 'click', () => {
    const passEl = document.getElementById('password');
    const toggleBtn = document.getElementById('toggle-password');
    if (passEl.getAttribute('type') === 'password') {
        passEl.setAttribute('type', 'text');
        toggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-eye-slash" viewBox="0 0 16 16"><path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755l-.709-.708zm-1.89-1.89-1.4-1.4a2.5 2.5 0 0 0-3.5-3.5l-1.4-1.4a4.5 4.5 0 0 1 6.3 6.3zm1.18-1.18-.5.5A13.133 13.133 0 0 1 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8c.058-.087.122-.183.195-.288l1.41-1.41a7.028 7.028 0 0 0-.588 2.79 6 6 0 0 0 5.19 5.86 1.492 1.492 0 0 0 1.25.14c.2-.07.41-.16.63-.26l1.23 1.23a1.5 1.5 0 0 0 1.95-2.26l-1.41-1.41zm-6.07 1.07-1.4-1.4a2.5 2.5 0 0 0 3.5 3.5l-1.4-1.4a1.5 1.5 0 0 1-.7-.7z"/></svg>`;
    } else {
        passEl.setAttribute('type', 'password');
        toggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-eye" viewBox="0 0 16 16"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/></svg>`;
    }
});

safeBind('auth-form', 'submit', async (e) => {
    e.preventDefault();
    const endpoint = isLoginMode ? '/api/login' : '/api/signup';
    const userEl = document.getElementById('username');
    const passEl = document.getElementById('password');
    if(!userEl || !passEl) return;

    try {
        const res = await fetch(endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: userEl.value.trim(), password: passEl.value })
        });
        const data = await res.json();
        
        if (data.success) {
            if (isLoginMode) showBookingScreen(data.username, data.isAdmin);
            else {
                alert(data.message); 
                setupAuthMode(true);
                passEl.value = '';
            }
        } else {
            if (data.notFound && isLoginMode) { if (confirm(data.message)) setupAuthMode(false); } 
            else alert(data.message || 'Error occurred');
        }
    } catch (err) { alert("Server error. Please try again."); }
});

function showBookingScreen(username, isAdmin = false) {
    switchView('booking-section');
    
    const guestDisplay = document.getElementById('guest-display');
    if(guestDisplay) {
        guestDisplay.classList.remove('d-flex');
        guestDisplay.classList.add('d-none');
    }
    
    const userDisplay = document.getElementById('user-display');
    if(userDisplay) {
        userDisplay.classList.remove('d-none');
        userDisplay.classList.add('d-flex');
    }
    
    const badge = document.getElementById('username-badge');
    if(badge) badge.innerText = username;

    const adminContainer = document.getElementById('admin-link-container');
    if (isAdmin && adminContainer) {
        adminContainer.innerHTML = `<li><a class="dropdown-item fw-bold text-warning" href="admin.html" id="nav-admin-link">Admin Panel</a></li>`;
    } else if (adminContainer) {
        adminContainer.innerHTML = '';
    }
    
    const locBtn = document.getElementById('nav-location-btn');
    if(locBtn) {
        locBtn.classList.remove('d-none');
        locBtn.classList.add('d-flex');
    }
    
    const bottomNav = document.getElementById('bottom-navbar');
    if (bottomNav) bottomNav.classList.remove('d-none');

    renderEvents().then(() => {
        if (!localStorage.getItem('userCity')) {
            setTimeout(() => {
                const btn = document.querySelector('[data-bs-target="#locationModal"]');
                if(btn) btn.click();
            }, 800);
        }
    });
}

safeBind('logout-btn', 'click', async (e) => {
    e.preventDefault(); 
    await fetch('/api/logout', { method: 'POST' });
    
    const guestDisplay = document.getElementById('guest-display');
    if(guestDisplay) {
        guestDisplay.classList.remove('d-none');
        guestDisplay.classList.add('d-flex');
    }
    
    const userDisplay = document.getElementById('user-display');
    if(userDisplay) {
        userDisplay.classList.remove('d-flex');
        userDisplay.classList.add('d-none');
    }
    
    const adminContainer = document.getElementById('admin-link-container');
    if(adminContainer) adminContainer.innerHTML = '';
    
    const u = document.getElementById('username'); if(u) u.value = '';
    const p = document.getElementById('password'); if(p) p.value = '';
    const s = document.getElementById('event-search-bar'); if(s) s.value = '';
    
    setupAuthMode(true);
});

document.querySelectorAll('.category-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.category-filter-btn').forEach(b => {
            b.classList.remove('btn-danger');
            b.classList.add('btn-outline-secondary', 'border-dark');
        });
        
        e.target.classList.remove('btn-outline-secondary', 'border-dark');
        e.target.classList.add('btn-danger');

        currentCategoryFilter = e.target.getAttribute('data-cat');
        applyFilters();
    });
});

safeBind('event-search-bar', 'input', () => { applyFilters(); });

function applyFilters() {
    const searchEl = document.getElementById('event-search-bar');
    const searchTerm = searchEl ? searchEl.value.toLowerCase() : '';
    const now = new Date();
    
    const filteredEvents = allEvents.filter(ev => {
        // Completely exclude expired events
        if (now > new Date(ev.endDate)) return false; 
        
        const safeTitle = ev.title ? ev.title.toLowerCase() : '';
        
        // Build a combined string of all venues and cities for search
        const allLocStrings = ev.locations ? ev.locations.map(l => `${l.venueName} ${l.city}`).join(' ').toLowerCase() : '';
        
        const matchesSearch = safeTitle.includes(searchTerm) || allLocStrings.includes(searchTerm);
        const matchesCategory = currentCategoryFilter === 'All' || ev.category === currentCategoryFilter;
        
        // Location Filter Logic
        let matchesLocation = false;
        if (currentLocationFilter === 'All Cities') {
            matchesLocation = true;
        } else if (ev.locations) {
            matchesLocation = ev.locations.some(l => l.city && l.city.toLowerCase().includes(currentLocationFilter.toLowerCase()));
        }

        return matchesSearch && matchesCategory && matchesLocation;
    });
    displayEvents(filteredEvents);
}

// ==========================================
// 📍 DYNAMIC LOCATION LOGIC
// ==========================================
function extractUniqueCities(events) {
    const cities = new Set();
    events.forEach(e => {
        if (e.locations) {
            e.locations.forEach(loc => {
                if (loc.city) cities.add(loc.city.trim());
            });
        }
    });
    return Array.from(cities).sort();
}

function renderLocationModal() {
    const cities = extractUniqueCities(allEvents);
    const container = document.getElementById('dynamic-location-pills');
    const displayEl = document.getElementById('nav-location-display');
    if (displayEl) displayEl.innerText = currentLocationFilter;
    
    if (!container) return;
    
    let html = `<button class="btn ${currentLocationFilter === 'All Cities' ? 'btn-danger border-danger text-white' : 'btn-outline-secondary border-dark text-white'} rounded-pill px-4 py-2 fw-bold location-pill" data-city="All Cities">All Cities</button>`;
    
    cities.forEach(city => {
        const isActive = currentLocationFilter === city;
        const classes = isActive ? 'btn-danger border-danger text-white' : 'btn-outline-secondary border-dark text-white';
        html += `<button class="btn ${classes} rounded-pill px-4 py-2 fw-bold location-pill" data-city="${city}">${city}</button>`;
    });
    
    container.innerHTML = html;
    
    // Attach to ALL location-pill elements (both dynamic and popular)
    document.querySelectorAll('.location-pill').forEach(btn => {
        // Highlight active popular city visually if needed
        if(btn.closest('#popular-cities-grid')) {
            if(btn.getAttribute('data-city') === currentLocationFilter) {
                btn.classList.replace('btn-outline-secondary', 'btn-danger');
            } else {
                btn.classList.replace('btn-danger', 'btn-outline-secondary');
            }
        }
        
        btn.addEventListener('click', (e) => {
            const clickedBtn = e.target.closest('.location-pill');
            if(!clickedBtn) return;
            
            currentLocationFilter = clickedBtn.getAttribute('data-city');
            localStorage.setItem('userCity', currentLocationFilter);
            if (displayEl) displayEl.innerText = currentLocationFilter;
            
            document.getElementById('close-location-modal')?.click();
            renderLocationModal();
            applyFilters();
            switchView('booking-section');
        });
    });
}

// 📍 Geolocation Integration
safeBind('use-geolocation-btn', 'click', () => {
    const geoText = document.getElementById('geolocation-text');
    if (!navigator.geolocation) {
        geoText.innerText = "Geolocation not supported";
        return;
    }
    
    geoText.innerText = "Locating...";
    
    navigator.geolocation.getCurrentPosition(async (position) => {
        try {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            // Free Reverse Geocoding API
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
            const data = await res.json();
            
            let city = data.address.city || data.address.town || data.address.village || data.address.county || "Unknown";
            
            // Set the detected city
            currentLocationFilter = city;
            localStorage.setItem('userCity', currentLocationFilter);
            const displayEl = document.getElementById('nav-location-display');
            if (displayEl) displayEl.innerText = currentLocationFilter;
            
            geoText.innerText = `Detected: ${city}`;
            
            setTimeout(() => {
                document.getElementById('close-location-modal')?.click();
                geoText.innerText = "Use Current Location";
                renderLocationModal();
                applyFilters();
            }, 800);
            
        } catch (err) {
            geoText.innerText = "Failed to detect location";
            setTimeout(() => geoText.innerText = "Use Current Location", 2000);
        }
    }, () => {
        geoText.innerText = "Permission Denied";
        setTimeout(() => geoText.innerText = "Use Current Location", 2000);
    });
});

// City Search Bar Logic
let debounceTimeout;
safeBind('city-search-input', 'input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    const dropdown = document.getElementById('city-autocomplete-dropdown');
    const resultsContainer = document.getElementById('autocomplete-results');
    
    // Filter active event locations
    document.querySelectorAll('#dynamic-location-pills .location-pill').forEach(btn => {
        if(btn.innerText.toLowerCase().includes(term)) {
            btn.classList.remove('d-none');
        } else {
            btn.classList.add('d-none');
        }
    });

    if (term.length < 3) {
        if(dropdown) dropdown.classList.add('d-none');
        return;
    }

    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(async () => {
        if(!dropdown || !resultsContainer) return;
        try {
            dropdown.classList.remove('d-none');
            resultsContainer.innerHTML = `<div class="p-3 text-muted small text-center"><span class="spinner-border spinner-border-sm me-2"></span>Searching...</div>`;
            
            // Nominatim API: Search in India
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(term)}&countrycodes=in&format=json&addressdetails=1&limit=5`);
            const data = await res.json();
            
            if (data.length === 0) {
                resultsContainer.innerHTML = `<div class="p-3 text-muted small">No places found in India.</div>`;
                return;
            }

            let html = '';
            const seenCities = new Set();
            data.forEach(place => {
                const city = place.address.city || place.address.town || place.address.state_district || place.name;
                const state = place.address.state || "India";
                
                if (city && !seenCities.has(city)) {
                    seenCities.add(city);
                    html += `
                        <div class="autocomplete-item p-3 border-bottom border-secondary hover-bg-dark" style="cursor: pointer; transition: all 0.2s;" data-city="${city}" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.05)'" onmouseout="this.style.backgroundColor='transparent'">
                            <div class="fw-bold text-white d-flex align-items-center gap-2"><span>📍</span> ${city}</div>
                            <div class="small text-muted ms-4">${state}</div>
                        </div>
                    `;
                }
            });
            
            resultsContainer.innerHTML = html;
            
            document.querySelectorAll('.autocomplete-item').forEach(item => {
                item.addEventListener('click', (ev) => {
                    const selectedCity = ev.currentTarget.getAttribute('data-city');
                    currentLocationFilter = selectedCity;
                    localStorage.setItem('userCity', currentLocationFilter);
                    const displayEl = document.getElementById('nav-location-display');
                    if (displayEl) displayEl.innerText = currentLocationFilter;
                    
                    document.getElementById('close-location-modal')?.click();
                    renderLocationModal();
                    applyFilters();
                    switchView('booking-section');
                    
                    e.target.value = '';
                    dropdown.classList.add('d-none');
                });
            });
            
        } catch(err) {
            resultsContainer.innerHTML = `<div class="p-3 text-danger small">Error fetching locations.</div>`;
        }
    }, 600);
});

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('city-autocomplete-dropdown');
    const input = document.getElementById('city-search-input');
    if (dropdown && !dropdown.contains(e.target) && e.target !== input) {
        dropdown.classList.add('d-none');
    }
});

async function renderEvents() {
    const container = document.getElementById('events-container');
    if(!container) return;

    if (allEvents.length === 0) {
        container.innerHTML = Array(6).fill(`
            <div class="col-6 col-sm-4 col-md-3 col-lg-2">
                <div class="card event-card h-100 skeleton-card">
                    <div class="skeleton-img"></div>
                    <div class="card-body p-4 d-flex flex-column gap-3">
                        <div class="skeleton-text w-75"></div>
                        <div class="skeleton-text w-50"></div>
                        <div class="skeleton-text w-100 mt-auto" style="height: 40px; border-radius: 999px;"></div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    if (initialEventsPromise) {
        allEvents = await initialEventsPromise; 
        initialEventsPromise = null; 
        renderLocationModal();
        checkEventExpirations(); 
        applyFilters(); 
    } else {
        await refreshGlobalEvents(); 
    }
}

function displayEvents(events) {
    const container = document.getElementById('events-container');
    if(!container) return;
    if (events.length === 0) {
        container.innerHTML = '<div class="col-12"><p class="text-muted">No events found matching your search.</p></div>'; return;
    }

    const now = new Date();
    window.currentEvents = events;

    container.innerHTML = events.map(e => {
        const isExpired = e.locations && e.locations.length > 0 
            ? e.locations.every(l => now > new Date(l.endDate)) 
            : true;
        
        const btnState = isExpired ? 'btn-secondary disabled' : 'btn-danger';
        const btnText = isExpired ? 'Ended' : 'Book Now';
        const imgHtml = e.imageUrl ? `<img src="${e.imageUrl}" class="event-card-img" alt="${e.title}">` : '<div class="event-card-img bg-dark"></div>';
        
        let typeColor = e.eventType === 'Seated' ? 'text-info' : 'text-success';
        let typeIcon = e.eventType === 'Seated' ? '💺' : '🎫';
        let catBadge = e.category ? `<span class="badge bg-dark border border-secondary text-light">${e.category}</span>` : '';

        const minPrice = e.locations && e.locations.length > 0 
            ? Math.min(...e.locations.map(l => l.price)) 
            : 0;
        const displayPrice = Number(minPrice).toFixed(2);
        
        let dataAttrs = `data-id="${e._id}"`;
        let groupClass = (e.locations && e.locations.length > 1) ? 'grouped-movie-card' : '';

        return `
        <div class="col-6 col-sm-4 col-md-3 col-lg-2">
            <div class="card event-card h-100 ${groupClass} ${isExpired ? 'expired-card' : ''}" ${dataAttrs} style="display: flex; flex-direction: column;">
                <div class="position-relative">${imgHtml}</div>
                <div class="card-body d-flex flex-column p-4 flex-grow-1">
                    <h5 class="fw-bold mb-1 text-white">${e.title}</h5>
                    <p class="text-muted small mb-3" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 40px;">${e.description || 'Experience the ultimate event.'}</p>
                    <div class="d-flex gap-2 mb-3"><span class="badge bg-dark border border-secondary ${typeColor}">${typeIcon} ${e.eventType}</span>${catBadge}</div>
                    <p class="small text-muted mb-3">📍 ${e.locations && e.locations.length > 0 ? (e.locations.length === 1 ? e.locations[0].venueName : `${e.locations.length} Locations Available`) : 'Venue TBA'}</p>
                    <div class="d-flex justify-content-between align-items-end mt-auto pt-3 border-top" style="border-color: #262626 !important;">
                        <div><span class="text-muted d-block" style="font-size:11px;">Starting from</span><span class="fw-bold fs-5 text-white">₹${displayPrice}</span></div>
                        <button class="btn ${btnState} fw-bold px-4 rounded-3 book-now-btn">${btnText}</button>
                    </div>
                </div>
            </div>
        </div>`
    }).join('');
}

function showCinemaSelection(eventId) {
    const event = window.currentEvents?.find(e => e._id === eventId);
    if (!event || !event.locations) return;
    
    const titleEl = document.getElementById('selected-event-title');
    if(titleEl) titleEl.innerText = event.title; 
    
    switchView('action-section');
    document.getElementById('seated-view')?.classList.add('d-none');
    document.getElementById('general-view')?.classList.add('d-none');
    document.getElementById('date-selection-container')?.classList.add('d-none');
    
    const cinemaContainer = document.getElementById('cinema-selection-container');
    const cinemaPills = document.getElementById('cinema-pills');
    if(cinemaContainer) cinemaContainer.classList.remove('d-none');
    
    if(cinemaPills) {
        let displayLocations = event.locations;
        if (currentLocationFilter !== 'All Cities') {
            displayLocations = event.locations.filter(loc => loc.city && loc.city.toLowerCase().includes(currentLocationFilter.toLowerCase()));
        }

        cinemaPills.innerHTML = displayLocations.map(loc => {
            const locName = loc.venueName || 'Unknown Location';
            const locCity = loc.city || '';
            const gmapsQuery = encodeURIComponent(`${locName} ${locCity}`.trim());
            const gmapsLink = `<a href="https://www.google.com/maps/search/?api=1&query=${gmapsQuery}" target="_blank" class="btn btn-sm btn-outline-info ms-2" onclick="event.stopPropagation();">🧭 Directions</a>`;
            return `
            <div class="card cinema-hall-card border-secondary p-3 mb-2" style="cursor: pointer; background: rgba(255,255,255,0.03); border-radius: 16px; transition: all 0.3s var(--ease-smooth); backdrop-filter: blur(10px);" data-loc-id="${loc._id}" onmouseover="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='var(--brand-primary)';" onmouseout="this.style.background='rgba(255,255,255,0.03)'; this.style.borderColor='var(--border-color)';">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <h6 class="text-white fw-bold mb-1" style="font-size: 15px;">${locName} ${locCity ? `(${locCity})` : ''}</h6>
                        <span class="text-muted small">Select to view showtimes</span>
                        ${gmapsLink}
                    </div>
                    <span class="fs-4" style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));">📍</span>
                </div>
            </div>`;
        }).join('');
        
        document.querySelectorAll('.cinema-hall-card').forEach(cCard => {
            cCard.addEventListener('click', (ev) => {
                const locId = ev.currentTarget.getAttribute('data-loc-id');
                const location = event.locations.find(l => l._id === locId);
                if (location) {
                    cinemaContainer.classList.add('d-none');
                    triggerStandardEventSelection(event, location);
                }
            });
        });
    }
}

safeBind('events-container', 'click', async (e) => {
    const card = e.target.closest('.event-card');
    if (!card || card.classList.contains('expired-card')) return;
        
    const eventId = card.getAttribute('data-id');
    const event = window.currentEvents?.find(ev => ev._id === eventId);
    if (!event) return;

    if (card.classList.contains('grouped-movie-card')) {
        showCinemaSelection(eventId);
        return;
    }
    
    triggerStandardEventSelection(event, event.locations[0]);
});

async function triggerStandardEventSelection(eventData, locationData) {
    const requiredAge = parseInt(eventData.ageLimit || 0);
    currentEventType = eventData.eventType;
    currentEventPrice = parseFloat(locationData.price || 0); 
    currentLocationId = locationData._id;

    if (requiredAge > 0) {
        const res = await fetch(`/api/profile?t=${new Date().getTime()}`);
        const data = await res.json();
        if (handlePossibleForceLogout(data)) return; 
        if (!data.user.dob) {
            alert(`⚠️ Age Verification Required.\nYou must update your Profile with your Date of Birth before booking this event.`);
            document.getElementById('profile-link-btn')?.click(); return;
        }
        const userAge = Math.abs(new Date(Date.now() - new Date(data.user.dob).getTime()).getUTCFullYear() - 1970);
        if (userAge < requiredAge) { alert(`🛑 Access Denied!\nThis event requires age ${requiredAge}+.`); return; }
    }

    currentEventId = eventData._id;
    const titleEl = document.getElementById('selected-event-title');
    if(titleEl) titleEl.innerText = `${eventData.title} @ ${locationData.venueName}`; 
    
    switchView('action-section');
    document.getElementById('seated-view')?.classList.add('d-none');
    document.getElementById('general-view')?.classList.add('d-none');
    
    const dates = getNextFourDays();
    const datesContainer = document.getElementById('date-pills');
    document.getElementById('date-selection-container')?.classList.remove('d-none');
    
    let timeSlotContainer = document.getElementById('time-slot-container');
    if(timeSlotContainer) {
        timeSlotContainer.innerHTML = '';
    }
    
    if(datesContainer) {
        datesContainer.innerHTML = dates.map(d => {
            const dateStr = formatLocalYYYYMMDD(d);
            const isToday = d.getDate() === new Date().getDate();
            const line1 = isToday ? "Today" : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
            const line2 = d.toLocaleDateString('en-US', { weekday: 'short' });

            return `<button class="district-date-pill" data-date="${dateStr}" aria-label="${line1}, ${line2}">
                        <span class="d-block fw-bold mb-1 pe-none">${line1}</span>
                        <span class="d-block small pe-none" style="font-size:11px;">${line2}</span>
                    </button>`;
        }).join('');

        document.querySelectorAll('.district-date-pill').forEach(pill => {
            pill.addEventListener('click', async (btnEv) => {
                const targetBtn = btnEv.target.closest('.district-date-pill');
                document.querySelectorAll('.district-date-pill').forEach(p => p.classList.remove('active'));
                targetBtn.classList.add('active');
                
                currentSelectedDate = targetBtn.getAttribute('data-date');
                currentSelectedTime = null; 
                updateOrderSummary(true); 
                document.getElementById('seated-view')?.classList.add('d-none');
                document.getElementById('general-view')?.classList.add('d-none');
                
                await fetchAndRenderTimeSlots(currentSelectedDate);
                targetBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            });
        });

        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.querySelector('.district-date-pill')?.click(); 
    }
}

function getStatusClass(available, capacity) {
    const percentage = (available / capacity) * 100;
    if (available === 0) return 'status-sold-out';
    if (percentage >= 50) return 'status-green';
    if (percentage >= 10) return 'status-yellow';
    return 'status-red';
}

async function fetchAndRenderTimeSlots(dateStr) {
    const timeContainer = document.getElementById('time-slot-container');
    if(!timeContainer) return;
    
    timeContainer.innerHTML = '<span class="text-muted small">Loading showtimes...</span>';
    
    try {
        const res = await fetch(`/api/events/${currentEventId}/timeslots-availability?date=${dateStr}&locationId=${currentLocationId}&t=${new Date().getTime()}`);
        const slotsData = await res.json();
        
        if (slotsData.length === 0) {
            timeContainer.innerHTML = '<span class="text-muted small">No showtimes configured for this event.</span>';
            return;
        }

        timeContainer.innerHTML = slotsData.map(slot => {
            const statusClass = getStatusClass(slot.available, slot.capacity);
            let statusText = statusClass.includes('green') ? 'Plenty available' : statusClass.includes('yellow') ? 'Filling fast' : 'Almost full';
            if(slot.available === 0) statusText = 'Sold out';

            return `
            <button class="time-slot-pill ${statusClass}" data-time="${slot.time}">
                <span class="fw-bold">${slot.time}</span>
                <span class="sr-only">${statusText}. ${slot.available} seats left.</span>
            </button>`;
        }).join('');

        document.querySelectorAll('.time-slot-pill').forEach(pill => {
            pill.addEventListener('click', async (e) => {
                 if(e.target.closest('.time-slot-pill').classList.contains('status-sold-out')) return;
                 
                 document.querySelectorAll('.time-slot-pill').forEach(p => p.classList.remove('active'));
                 const btn = e.target.closest('.time-slot-pill');
                 btn.classList.add('active');
                 
                 currentSelectedTime = btn.getAttribute('data-time');
                 updateOrderSummary(true);
                 await loadEventDataForDateAndTime(currentSelectedDate, currentSelectedTime, false);
            });
        });
    } catch (err) {
        timeContainer.innerHTML = '<span class="text-danger small">Failed to load showtimes.</span>';
    }
}

async function loadEventDataForDateAndTime(date, time, isSoftUpdate = false) {
    try {
        const res = await fetch(`/api/events/${currentEventId}/availability?date=${date}&timeSlot=${time}&locationId=${currentLocationId}&t=${new Date().getTime()}`);
        const data = await res.json();
        
        const gView = document.getElementById('general-view');
        const sView = document.getElementById('seated-view');

        if (currentEventType === 'Seated') {
            if(gView) gView.classList.add('d-none'); 
            if(sView) sView.classList.remove('d-none');
            await renderSeatsForEvent(currentEventId, currentLocationId, date, time, isSoftUpdate);
        } else {
            if(sView) sView.classList.add('d-none'); 
            if(gView) gView.classList.remove('d-none');
            
            const qtyInput = document.getElementById('general-qty');
            const leftTxt = document.getElementById('tickets-left');
            if(leftTxt) leftTxt.innerText = data.available;
            
            if(qtyInput) {
                qtyInput.max = data.available;
                if (data.available <= 0) { qtyInput.value = 0; qtyInput.disabled = true; } 
                else { if(qtyInput.value == 0 || qtyInput.value > data.available) qtyInput.value = 1; qtyInput.disabled = false; }
            }
            updateOrderSummary();
        }
    } catch (err) { console.error("Data error."); }
}

async function renderSeatsForEvent(eventId, locationId, date, time, isSoftUpdate = false) {
    const seatMapEl = document.getElementById('seat-map');
    if(!seatMapEl) return;

    try {
        if (!isSoftUpdate) {
            seatMapEl.innerHTML = '<p class="text-muted text-center mt-3">Loading layout...</p>';
        }
        const res = await fetch(`/api/seats/${eventId}?locationId=${locationId}&date=${date}&timeSlot=${time}&t=${new Date().getTime()}`);
        let seats = await res.json();
        
        if (isSoftUpdate) {
            let selectionChanged = false;
            seats.forEach(seat => {
                const btn = seatMapEl.querySelector(`button[data-id="${seat.seatId}"]`);
                if (btn) {
                    if (seat.status === 'Available') {
                        btn.classList.remove('booked', 'disabled', 'selected');
                        btn.classList.add('available');
                    } else if (seat.status === 'LockedByMe') {
                        btn.classList.remove('booked', 'disabled');
                        btn.classList.add('available', 'selected');
                    } else {
                        btn.classList.remove('available', 'selected');
                        btn.classList.add('booked', 'disabled');
                        if (btn.classList.contains('selected')) {
                            btn.classList.remove('selected');
                            selectionChanged = true;
                        }
                    }
                }
            });
            if (selectionChanged) {
                updateOrderSummary();
            }
            return;
        }

        const seatsPerRow = 14; const halfRow = seatsPerRow / 2;
        const rowsHtmlArray = [];

        for (let i = 0; i < seats.length; i += seatsPerRow) {
            const rowSeats = seats.slice(i, i + seatsPerRow);
            const rowLetter = String.fromCharCode(65 + Math.floor(i / seatsPerRow)); 
            
            let rowHtml = `<div class="d-flex align-items-center justify-content-center w-100 mb-2">`;
            rowHtml += `<div class="text-end me-3 fw-bold text-muted" style="width: 15px; font-size: 11px;">${rowLetter}</div>`;
            
            const startIndex = Math.floor((seatsPerRow - rowSeats.length) / 2);
            let seatIdx = 0;

            for (let j = 0; j < seatsPerRow; j++) {
                if (j === halfRow) rowHtml += `<div style="width: 30px; flex-shrink: 0;"></div>`; 
                if (j >= startIndex && seatIdx < rowSeats.length) {
                    let seat = rowSeats[seatIdx];
                    let classes = 'bms-seat ';
                    if (seat.status === 'Available') classes += 'available';
                    else if (seat.status === 'LockedByMe') classes += 'available selected';
                    else classes += 'booked disabled';
                    let dNum = seat.seatId.replace(/\D/g, ''); 
                    if(dNum.length === 1) dNum = '0' + dNum;
                    rowHtml += `<button class="${classes}" data-id="${seat.seatId}">${dNum}</button>`;
                    seatIdx++;
                } else {
                    rowHtml += `<div style="width: 38px; height: 38px; margin: 0 5px; flex-shrink: 0;"></div>`;
                }
            }
            rowHtml += `</div>`;
            rowsHtmlArray.push(rowHtml);
        }
        
        seatMapEl.innerHTML = `<div class="d-flex flex-column align-items-center">${rowsHtmlArray.join('')}</div>`;
        updateOrderSummary();
    } catch (err) { 
        seatMapEl.innerHTML = '<p class="text-danger text-center">Failed to load layout.</p>';
    }
}

// 🎨 Dynamic Price Animation
function animatePrice(element, newValue) {
    if(!element) return;
    const startVal = parseFloat(element.innerText.replace(/,/g, '')) || 0;
    const endVal = parseFloat(newValue);
    if(startVal === endVal) return; 
    
    const duration = 400; 
    let startTimestamp = null;
    
    if(element.animationFrameId) cancelAnimationFrame(element.animationFrameId);
    
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        const currentVal = startVal + (endVal - startVal) * easeProgress;
        
        element.innerText = currentVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        
        if (progress < 1) {
            element.animationFrameId = window.requestAnimationFrame(step);
        } else {
            element.innerText = endVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
    };
    element.animationFrameId = window.requestAnimationFrame(step);
}

// 🚨 FIXED: Order Summary Calculation & Display Math
function updateOrderSummary(reset = false) {
    const checkoutBtn = document.getElementById('sidebar-checkout-btn');
    const seatsList = document.getElementById('summary-seats-list');
    const container = document.getElementById('summary-seats-container');
    const calcText = document.getElementById('summary-calc-text');
    const subtotalText = document.getElementById('summary-subtotal');
    const totalText = document.getElementById('summary-total');
    
    if(!checkoutBtn || !totalText) return; 

    if (reset) {
        if(seatsList) seatsList.innerHTML = ''; 
        if(container) container.classList.add('d-none');
        if(calcText) calcText.innerText = `Tickets (0)`; 
        if(subtotalText) animatePrice(subtotalText, 0); 
        animatePrice(totalText, 0); checkoutBtn.disabled = true; return;
    }

    let sub = 0; let count = 0;

    if (currentEventType === 'Seated') {
        const selectedSeats = Array.from(document.querySelectorAll('#seat-map .bms-seat.selected'))
            .map(el => el.getAttribute('data-id'))
            .filter(id => id != null && id !== 'null' && id !== '');
            
        count = selectedSeats.length;
        if(container) container.classList.toggle('d-none', count === 0);
        if(seatsList) seatsList.innerHTML = selectedSeats.map(s => `<span class="seat-pill">${s}</span>`).join('');
        if(calcText) calcText.innerText = `Regular (${count} x ₹${currentEventPrice.toFixed(2)})`;
        sub = count * currentEventPrice;
        checkoutBtn.disabled = count === 0;
    } else {
        const qtyEl = document.getElementById('general-qty');
        count = parseInt(qtyEl ? qtyEl.value : 0) || 0;
        if(container) container.classList.add('d-none');
        if(calcText) calcText.innerText = `General (${count} x ₹${currentEventPrice.toFixed(2)})`;
        sub = count * currentEventPrice;
        checkoutBtn.disabled = count === 0;
    }

    const finalTotal = parseFloat(sub.toFixed(2));
    finalCheckoutTotal = finalTotal; 
    
    if(subtotalText) animatePrice(subtotalText, finalTotal);
    animatePrice(totalText, finalTotal);
}

safeBind('seat-map', 'click', async (e) => {
    if (e.target.classList.contains('bms-seat')) {
        const btn = e.target;
        const seatId = btn.getAttribute('data-id');
        if (!seatId) return;

        if (btn.classList.contains('available') && !btn.classList.contains('selected')) {
            // Optimistic UI Update - Instant feedback
            btn.classList.add('selected');
            updateOrderSummary();
            
            try {
                const res = await fetch('/api/seats/lock', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ eventId: currentEventId, locationId: currentLocationId, seatId, date: currentSelectedDate, timeSlot: currentSelectedTime })
                });
                const data = await res.json();
                if (!data.success) {
                    // Revert on failure
                    btn.classList.remove('selected');
                    updateOrderSummary();
                    alert(data.message);
                    await loadEventDataForDateAndTime(currentSelectedDate, currentSelectedTime, true);
                }
            } catch (err) { 
                console.error(err); 
                btn.classList.remove('selected');
                updateOrderSummary();
            }
        } else if (btn.classList.contains('selected')) {
            // Optimistic UI Update - Instant feedback
            btn.classList.remove('selected');
            updateOrderSummary();
            
            try {
                const res = await fetch('/api/seats/unlock', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ eventId: currentEventId, locationId: currentLocationId, seatId, date: currentSelectedDate, timeSlot: currentSelectedTime })
                });
                const data = await res.json();
                if (!data.success) {
                    // Revert on failure
                    btn.classList.add('selected');
                    updateOrderSummary();
                }
            } catch (err) { 
                console.error(err);
                btn.classList.add('selected');
                updateOrderSummary();
            }
        }
    }
});

safeBind('unselect-all-btn', 'click', async (e) => {
    e.preventDefault();
    const selectedBtns = Array.from(document.querySelectorAll('#seat-map .bms-seat.selected'));
    if (selectedBtns.length === 0) return;

    // Optimistic UI clear
    selectedBtns.forEach(btn => btn.classList.remove('selected'));
    updateOrderSummary();

    // Call unlock API for each seat
    const unlockPromises = selectedBtns.map(btn => {
        const seatId = btn.getAttribute('data-id');
        return fetch('/api/seats/unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId: currentEventId, locationId: currentLocationId, seatId, date: currentSelectedDate, timeSlot: currentSelectedTime })
        });
    });

    try {
        await Promise.all(unlockPromises);
    } catch (err) {
        console.error("Error clearing seats:", err);
    }
});

safeBind('general-qty', 'input', (e) => {
    if (e.target.value === '') { updateOrderSummary(true); return; }
    let qty = parseInt(e.target.value) || 0; const max = parseInt(e.target.max) || 0;
    if (qty > max) { qty = max; e.target.value = max; }
    updateOrderSummary();
});

safeBind('general-qty', 'blur', (e) => {
    const max = parseInt(e.target.max) || 0;
    if (max > 0 && (e.target.value === '' || parseInt(e.target.value) < 1)) { e.target.value = 1; updateOrderSummary(); }
});

safeBind('sidebar-checkout-btn', 'click', () => {
    if (!currentSelectedDate || !currentSelectedTime) return;
    if (currentEventType === 'Seated') {
        const selectedSeats = Array.from(document.querySelectorAll('#seat-map .bms-seat.selected'))
            .map(el => el.getAttribute('data-id'))
            .filter(id => id != null && id !== 'null' && id !== '');
            
        if (selectedSeats.length === 0) {
            alert("Please select at least one valid seat before checking out.");
            return;
        }    
            
        pendingPaymentData = { type: 'seated', eventId: currentEventId, locationId: currentLocationId, seats: selectedSeats, selectedDate: currentSelectedDate, timeSlot: currentSelectedTime };
    } else {
        const qty = parseInt(document.getElementById('general-qty').value);
        pendingPaymentData = { type: 'general', eventId: currentEventId, locationId: currentLocationId, qty: qty, selectedDate: currentSelectedDate, timeSlot: currentSelectedTime };
    }

    // 🚨 FIXED: Added toFixed(2) to secure checkout display pop up
    const amtDisplay = document.getElementById('payment-amount-display');
    if(amtDisplay) amtDisplay.innerText = finalCheckoutTotal.toFixed(2);

    if(!paymentModalInstance) {
        const pModal = document.getElementById('paymentModal');
        if(pModal && typeof bootstrap !== 'undefined') paymentModalInstance = new bootstrap.Modal(pModal);
    }
    if(paymentModalInstance) paymentModalInstance.show();
});

safeBind('confirm-payment-btn', 'click', async (e) => {
    if(!pendingPaymentData) return;
    const btn = e.target;
    if (btn.dataset.processing === "true") return;
    btn.dataset.processing = "true";

    const originalText = "Pay Securely Now";
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Processing...';
    btn.disabled = true;
    // Instant processing instead of artificial timeout
    setTimeout(async () => {
        try {
            const endpoint = pendingPaymentData.type === 'seated' ? '/api/events/book-seats' : '/api/events/book-general';
            const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pendingPaymentData) });
            const data = await res.json();
            
            if (handlePossibleForceLogout(data)) { if(paymentModalInstance) paymentModalInstance.hide(); return; }

            if (data.success) {
                if(paymentModalInstance) paymentModalInstance.hide();
                if(pendingPaymentData.type === 'seated') { 
                    selectedSeats = [];
                    lockedSeatsData = [];
                    await renderSeatsForEvent(pendingPaymentData.eventId, pendingPaymentData.locationId, pendingPaymentData.selectedDate, pendingPaymentData.timeSlot, true); 
                    updateOrderSummary(true); 
                } 
                else { const q = document.getElementById('general-qty'); if(q) q.value = 1; await loadEventDataForDateAndTime(pendingPaymentData.selectedDate, pendingPaymentData.timeSlot, true); }
                setTimeout(() => alert("✅ Payment Successful!\n\n" + data.message), 400);
            } else {
                if(paymentModalInstance) paymentModalInstance.hide();
                await loadEventDataForDateAndTime(pendingPaymentData.selectedDate, pendingPaymentData.timeSlot, true); 
                setTimeout(() => alert("❌ Booking Failed: " + data.message), 400);
            }
        } catch (err) { if(paymentModalInstance) paymentModalInstance.hide(); alert("Network error during payment processing.");
        } finally { btn.innerText = originalText; btn.disabled = false; btn.dataset.processing = "false"; pendingPaymentData = null; }
    }, 0); 
});

// ==========================================
// 📋 MY BOOKINGS & PROFILE
// ==========================================
safeBind('nav-bookings-link', 'click', async (e) => {
    e.preventDefault(); switchView('tickets-section');
    const container = document.getElementById('my-tickets-container');
    if(!container) return;
    container.innerHTML = '<p class="text-muted">Loading your tickets...</p>';

    try {
        const res = await fetch(`/api/my-tickets?t=${new Date().getTime()}`);
        const tickets = await res.json();
        if (handlePossibleForceLogout(tickets)) return;

        if (tickets.length === 0) { 
            container.innerHTML = '<p class="text-muted p-4 border border-secondary rounded">You have no booked tickets yet.</p>'; 
            return; 
        }

        const grouped = tickets.reduce((acc, t) => {
            const key = `${t.eventId}-${t.locationId}-${t.bookingDate}-${t.timeSlot}`;
            if(!acc[key]) { 
                const hash = Math.abs(key.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)).toString(16).toUpperCase().substring(0, 8);
                
                acc[key] = { 
                    eventTitle: t.eventTitle, 
                    date: t.bookingDate, 
                    time: t.timeSlot, 
                    location: t.location,
                    type: t.eventType, 
                    price: t.price || 0,
                    count: 0, 
                    seats: [], 
                    ids: [],
                    bookingRef: `BKM${hash}D1`,
                    endDate: t.endDate 
                }; 
            }
            acc[key].count++; 
            acc[key].seats.push(t.seatId); 
            acc[key].ids.push({ eventId: t.eventId, locationId: t.locationId, seatId: t.seatId, bookingDate: t.bookingDate, timeSlot: t.timeSlot }); 
            return acc;
        }, {});

        container.innerHTML = Object.values(grouped).map(g => {
            const totalAmount = g.price * g.count;
            const dateStr = new Date(g.date).toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'});
            
            const isExpired = new Date() > new Date(g.endDate); 
            
            const statusBadge = isExpired 
                ? `<span class="badge bg-secondary text-light" style="font-size: 10px; border-radius: 6px; padding: 4px 8px; letter-spacing: 1px;">EXPIRED</span>`
                : `<span class="badge" style="background-color: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); font-size: 10px; border-radius: 6px; padding: 4px 8px;">confirmed</span>`;
            
            const cancelBtnHtml = isExpired 
                ? `` 
                : `<button class="btn btn-link text-danger p-0 mt-2 small text-decoration-none cancel-ticket-btn" data-json="${encodeURIComponent(JSON.stringify(g.ids))}" style="font-size: 12px; opacity: 0.8;">Cancel</button>`;

            let seatPills = '';
            if (g.seats.length > 15) {
                seatPills = g.seats.slice(0, 15).map(s => `<span class="seat-pill-sm">${s.replace('GA-', '')}</span>`).join(' ') +
                            ` <span class="seat-pill-sm" style="background: var(--brand-primary); border-color: var(--brand-primary);">+${g.seats.length - 15} more</span>`;
            } else {
                seatPills = g.seats.map(s => `<span class="seat-pill-sm">${s.replace('GA-', '')}</span>`).join(' ');
            }

            // 🚨 FIXED: Formatting the total price perfectly with commas and exactly 2 decimals
            const formattedTotal = totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            return `
            <div class="card bg-transparent border mb-4 ticket-card-ui">
                <div class="d-flex flex-column flex-md-row">
                    <div class="d-flex flex-column align-items-center justify-content-center p-4 ticket-qr-section">
                        <div class="bg-white p-2 rounded mb-3" style="aspect-ratio: 1; width: 110px;">
                            <div class="qr-code-target" data-ref="${g.bookingRef}" style="width: 100%; height: 100%;"></div>
                        </div>
                        <span class="text-muted fw-bold" style="font-size: 11px; letter-spacing: 0.5px;">${g.bookingRef}</span>
                    </div>
                    <div class="p-4 flex-grow-1 position-relative" style="background-color: #0a0a0a;">
                        <div class="d-flex justify-content-between align-items-start mb-3">
                            <div class="d-flex align-items-center flex-wrap gap-2">
                                <h5 class="fw-bold mb-0 text-white">${g.eventTitle}</h5>
                                ${statusBadge}
                            </div>
                            <div class="d-flex flex-column align-items-end">
                                <button class="btn btn-link text-white fw-bold p-0 m-0 text-decoration-none view-ticket-btn" data-ticket="${encodeURIComponent(JSON.stringify(g))}">View Ticket &gt;</button>
                                ${cancelBtnHtml}
                            </div>
                        </div>
                        <div class="text-muted small mb-4 d-flex flex-column gap-2" style="font-size: 13px;">
                            <div class="d-flex align-items-center"><span class="me-3 fs-6">📅</span> ${dateStr}</div>
                            <div class="d-flex align-items-center"><span class="me-3 fs-6">🕒</span> ${g.time}</div>
                            <div class="d-flex align-items-center"><span class="me-3 fs-6">📍</span> ${g.location}</div>
                        </div>
                        <div class="d-flex gap-5">
                            <div>
                                <div class="text-muted mb-2" style="font-size: 12px;">Seats</div>
                                <div class="d-flex flex-wrap gap-2">${seatPills}</div>
                            </div>
                            <div>
                                <div class="text-muted mb-2" style="font-size: 12px;">Amount</div>
                                <div class="fw-bold text-danger fs-5">₹${formattedTotal}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`
        }).join('');

        setTimeout(() => {
            const qrObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const el = entry.target;
                        if (el.innerHTML === "") {
                            new QRCode(el, { text: el.getAttribute('data-ref'), width: 94, height: 94, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.L });
                        }
                        observer.unobserve(el); 
                    }
                });
            }, { rootMargin: "100px" }); 

            document.querySelectorAll('.qr-code-target').forEach(el => qrObserver.observe(el));
        }, 50);

    } catch (err) { container.innerHTML = '<p class="text-danger">Failed to load tickets.</p>'; }
});

// 🚨 MODAL CANCELLATION LOGIC WITH PILLS & SELECT ALL
safeBind('my-tickets-container', 'click', async (e) => {
    const cancelBtn = e.target.closest('.cancel-ticket-btn');
    if (cancelBtn) {
        const idsToCancel = JSON.parse(decodeURIComponent(cancelBtn.getAttribute('data-json')));
        
        const selectAllBtn = document.getElementById('select-all-cancel-btn');
        if (selectAllBtn) {
            selectAllBtn.innerText = 'Select All';
            selectAllBtn.dataset.state = 'none';
        }

        const seatListContainer = document.getElementById('cancel-seat-list');
        seatListContainer.innerHTML = idsToCancel.map((idObj) => `
            <button type="button" class="cancel-seat-pill" data-value='${JSON.stringify(idObj).replace(/'/g, "&#39;")}' >
                ${idObj.seatId.replace('GA-', '')}
            </button>
        `).join('');

        if(!cancelModalInstance) {
            cancelModalInstance = new bootstrap.Modal(document.getElementById('cancelSeatModal'));
        }
        cancelModalInstance.show();
        return; 
    }

    const viewBtn = e.target.closest('.view-ticket-btn');
    if (viewBtn) {
        const ticketData = JSON.parse(decodeURIComponent(viewBtn.getAttribute('data-ticket')));
        showTicketDetail(ticketData);
    }
});

safeBind('select-all-cancel-btn', 'click', (e) => {
    const btn = e.target;
    const pills = document.querySelectorAll('.cancel-seat-pill');
    
    if (btn.dataset.state === 'all') {
        pills.forEach(p => p.classList.remove('selected'));
        btn.innerText = 'Select All';
        btn.dataset.state = 'none';
    } else {
        pills.forEach(p => p.classList.add('selected'));
        btn.innerText = 'Deselect All';
        btn.dataset.state = 'all';
    }
});

safeBind('cancel-seat-list', 'click', (e) => {
    const pill = e.target.closest('.cancel-seat-pill');
    if (pill) {
        pill.classList.toggle('selected');
        
        const allPills = document.querySelectorAll('.cancel-seat-pill');
        const selectedPills = document.querySelectorAll('.cancel-seat-pill.selected');
        const selectAllBtn = document.getElementById('select-all-cancel-btn');
        
        if (selectAllBtn) {
            if (allPills.length > 0 && allPills.length === selectedPills.length) {
                selectAllBtn.innerText = 'Deselect All';
                selectAllBtn.dataset.state = 'all';
            } else {
                selectAllBtn.innerText = 'Select All';
                selectAllBtn.dataset.state = 'none';
            }
        }
    }
});

safeBind('confirm-partial-cancel-btn', 'click', async (e) => {
    const selectedPills = document.querySelectorAll('.cancel-seat-pill.selected');
    
    if (selectedPills.length === 0) {
        alert("Please select at least one seat to cancel.");
        return;
    }

    const btn = e.target;
    const originalText = btn.innerText;
    btn.disabled = true; 
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Cancelling...';

    try {
        for (let pill of selectedPills) {
            const idObj = JSON.parse(pill.getAttribute('data-value'));
            await fetch('/api/events/cancel-booking', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(idObj) 
            });
        }
        
        cancelModalInstance.hide();
        document.getElementById('nav-bookings-link')?.click(); 
    } catch (err) { 
        alert('Cancellation failed due to a network error.'); 
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
});

function showTicketDetail(ticketData) {
    switchView('ticket-detail-section');
    const container = document.getElementById('ticket-detail-container');
    if (!container) return;
    
    const dateStr = new Date(ticketData.date).toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'});
    const totalAmount = ticketData.price * ticketData.count;
    
    // 🚨 FIXED: Price format clamping in receipt display view
    const formattedReceiptTotal = totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    const seatPills = ticketData.seats.map(s => `<span class="seat-pill-sm">${s.replace('GA-', '')}</span>`).join(' ');
    
    const usernameBadge = document.getElementById('username-badge');
    const username = usernameBadge ? usernameBadge.innerText : 'User';
    const bookedOnStr = new Date(ticketData.date).toLocaleDateString('en-GB');

    container.innerHTML = `
    <div class="ticket-receipt-wrapper" id="pdf-target-wrapper">
        <div class="ticket-receipt-main">
            <div class="d-flex justify-content-between align-items-start mb-4 pb-3 border-bottom border-secondary border-opacity-25">
                <div>
                    <h2 class="fw-bold text-white mb-2" style="letter-spacing: -0.5px;">${ticketData.eventTitle}</h2>
                    <span class="badge" style="background-color: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); padding: 6px 12px; font-weight: 700; letter-spacing: 1px;">✓ BOOKING CONFIRMED</span>
                </div>
            </div>
            
            <div class="row g-4 mb-4">
                <div class="col-sm-6">
                    <div class="d-flex align-items-center gap-3">
                        <div class="icon-circle">📅</div>
                        <div>
                            <div class="small text-muted text-uppercase fw-bold" style="font-size: 11px; letter-spacing: 1px;">Date</div>
                            <div class="fw-bold text-white fs-6">${dateStr}</div>
                        </div>
                    </div>
                </div>
                <div class="col-sm-6">
                    <div class="d-flex align-items-center gap-3">
                        <div class="icon-circle">🕒</div>
                        <div>
                            <div class="small text-muted text-uppercase fw-bold" style="font-size: 11px; letter-spacing: 1px;">Time</div>
                            <div class="fw-bold text-white fs-6">${ticketData.time}</div>
                        </div>
                    </div>
                </div>
                <div class="col-12">
                    <div class="d-flex align-items-center gap-3">
                        <div class="icon-circle">📍</div>
                        <div>
                            <div class="small text-muted text-uppercase fw-bold" style="font-size: 11px; letter-spacing: 1px;">Venue</div>
                            <div class="fw-bold text-white fs-6">${ticketData.location}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="mb-4 p-3 rounded" style="background-color: #0a0a0a; border: 1px solid #262626;">
                <div class="text-muted text-uppercase mb-2 fw-bold" style="font-size: 11px; letter-spacing: 1px;">Admit ${ticketData.count} - Selected Seats</div>
                <div class="d-flex flex-wrap gap-2">${seatPills}</div>
            </div>

            <div class="d-flex justify-content-between align-items-center mt-4 pt-3 border-top border-secondary border-opacity-25">
                <div>
                    <div class="text-muted text-uppercase fw-bold" style="font-size: 11px; letter-spacing: 1px;">Total Amount Paid</div>
                    <div class="fw-bold text-danger fs-3">₹${formattedReceiptTotal}</div>
                </div>
                <div class="text-end">
                    <div class="text-muted text-uppercase fw-bold" style="font-size: 11px; letter-spacing: 1px;">Transaction ID</div>
                    <div class="fw-bold font-monospace text-white">${ticketData.bookingRef}</div>
                </div>
            </div>
        </div>
        
        <div class="ticket-receipt-divider"></div>
        
        <div class="ticket-receipt-stub">
            <h5 class="fw-bold text-white mb-4 text-center text-uppercase" style="letter-spacing: 2px;">Entry Pass</h5>
            <div class="bg-white p-2 rounded mb-3 shadow" style="width: 140px; height: 140px; margin: 0 auto;">
                <div id="full-ticket-qr" style="width: 100%; height: 100%;"></div>
            </div>
            <p class="text-muted small text-center mb-0">Present this code at the venue gate.</p>
            <div class="mt-4 text-center w-100">
                <div class="badge bg-transparent border border-secondary text-muted font-monospace w-100 py-2 fs-6">${ticketData.bookingRef}</div>
            </div>
        </div>
    </div>
    
    <div class="d-flex justify-content-center gap-3 mb-5 pb-5 mt-4">
        <button id="download-pdf-btn" class="btn btn-outline-secondary text-white border-dark px-4 py-2 fw-bold d-flex align-items-center gap-2"><span class="fs-5">📥</span> Download PDF</button>
        <button id="detail-back-bookings-btn" class="btn btn-dark px-4 py-2 fw-bold border-secondary d-flex align-items-center gap-2"><span>🎫</span> Back to Bookings</button>
        <button id="detail-back-home-btn" class="btn btn-dark px-4 py-2 fw-bold border-secondary d-flex align-items-center gap-2"><span>🏠</span> Back to Home</button>
    </div>`;

    setTimeout(() => {
        const qrContainer = document.getElementById('full-ticket-qr');
        if (qrContainer) {
            qrContainer.innerHTML = "";
            new QRCode(qrContainer, { text: ticketData.bookingRef, width: 124, height: 124, colorDark : "#000000", colorLight : "#ffffff", correctLevel : QRCode.CorrectLevel.M });
        }
    }, 50);

    safeBind('download-pdf-btn', 'click', () => {
        if (!window.jspdf) {
            alert("PDF engine is still loading. Please wait a second and try again.");
            return;
        }

        const btn = document.getElementById('download-pdf-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '⏳ Generating PDF...';
        btn.disabled = true;

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: [200, 100] 
            });

            // TICKET BACKGROUND
            doc.setFillColor(255, 255, 255);
            doc.rect(0, 0, 200, 100, 'F');

            // LEFT BRAND EDGE
            doc.setFillColor(239, 68, 68); 
            doc.rect(0, 0, 8, 100, 'F');

            // TICKET TITLE
            doc.setTextColor(20, 20, 20);
            doc.setFontSize(22);
            doc.setFont("helvetica", "bold");
            let safeTitle = ticketData.eventTitle;
            if (safeTitle.length > 25) safeTitle = safeTitle.substring(0, 25) + "...";
            doc.text(safeTitle, 15, 20);

            // STATUS BADGE
            doc.setDrawColor(16, 185, 129);
            doc.setLineWidth(0.5);
            doc.rect(15, 25, 35, 7);
            doc.setTextColor(16, 185, 129);
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.text("CONFIRMED", 32.5, 30, { align: "center" });

            // DETAILS
            doc.setTextColor(120, 120, 120);
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.text("DATE", 15, 45);
            
            doc.setTextColor(20, 20, 20);
            doc.setFontSize(12);
            doc.text(dateStr, 15, 51);

            doc.setTextColor(120, 120, 120);
            doc.setFontSize(8);
            doc.text("TIME", 80, 45);

            doc.setTextColor(20, 20, 20);
            doc.setFontSize(12);
            doc.text(ticketData.time, 80, 51);

            // LOCATION
            doc.setTextColor(120, 120, 120);
            doc.setFontSize(8);
            doc.text("VENUE", 15, 62);

            doc.setTextColor(20, 20, 20);
            doc.setFontSize(11);
            let loc = ticketData.location;
            if (loc.length > 55) loc = loc.substring(0, 55) + "...";
            doc.text(loc, 15, 68);

            // SEATS
            doc.setTextColor(120, 120, 120);
            doc.setFontSize(8);
            doc.text(`ADMIT ${ticketData.count} - SELECTED SEATS`, 15, 79);

            doc.setTextColor(239, 68, 68);
            doc.setFontSize(12);
            let seatsStr = ticketData.seats.map(s => s.replace('GA-', '')).join(', ');
            if (seatsStr.length > 40) seatsStr = seatsStr.substring(0, 40) + "...";
            doc.text(seatsStr, 15, 85);

            // TOTAL PAID
            doc.setTextColor(120, 120, 120);
            doc.setFontSize(8);
            doc.text("TOTAL PAID", 135, 79, { align: "right" });

            doc.setTextColor(20, 20, 20);
            doc.setFontSize(14);
            
            // 🚨 FIXED: Exact formatting inside the PDF download logic
            doc.text(`INR ${formattedReceiptTotal}`, 135, 86, { align: "right" });

            // PERFORATED DIVIDER LINE
            doc.setDrawColor(180, 180, 180);
            doc.setLineWidth(0.5);
            doc.setLineDashPattern([2, 2], 0);
            doc.line(145, 5, 145, 95);

            // TICKET STUB
            doc.setTextColor(20, 20, 20);
            doc.setFontSize(14);
            doc.text("ENTRY PASS", 172.5, 20, { align: "center" });

            const qrCanvas = document.querySelector('#full-ticket-qr canvas');
            if (qrCanvas) {
                const qrData = qrCanvas.toDataURL('image/png');
                doc.addImage(qrData, 'PNG', 152.5, 26, 40, 40);
            }

            doc.setTextColor(120, 120, 120);
            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            doc.text("Scan at venue gate", 172.5, 72, { align: "center" });

            doc.setTextColor(20, 20, 20);
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.text(ticketData.bookingRef, 172.5, 85, { align: "center" });

            doc.save(`Vibe_${ticketData.bookingRef}.pdf`);

            btn.innerHTML = originalText;
            btn.disabled = false;
        } catch (err) {
            console.error("PDF Generation Error:", err);
            alert("Error generating PDF ticket.");
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });

    safeBind('detail-back-home-btn', 'click', () => { document.getElementById('home-logo')?.click(); });
    safeBind('detail-back-bookings-btn', 'click', () => { switchView('tickets-section'); });
}

safeBind('profile-link-btn', 'click', async (e) => {
    e.preventDefault(); switchView('profile-section');
    const alertBox = document.getElementById('profile-alert'); if(alertBox) alertBox.classList.add('d-none');
    try {
        const res = await fetch(`/api/profile?t=${new Date().getTime()}`);
        const data = await res.json();
        if (handlePossibleForceLogout(data)) return;

        if (data.success) {
            const u = document.getElementById('profile-username'); if(u) u.value = data.user.username; 
            const f = document.getElementById('profile-fullname'); if(f) f.value = data.user.fullName || ''; 
            const em = document.getElementById('profile-email'); if(em) em.value = data.user.email || ''; 
            const p = document.getElementById('profile-phone'); if(p) p.value = data.user.phone || ''; 
            const a = document.getElementById('profile-address'); if(a) a.value = data.user.address || '';
            const dob = document.getElementById('profile-dob'); const age = document.getElementById('profile-age');
            if (data.user.dob && age) {
                const dateString = new Date(data.user.dob).toISOString().split('T')[0];
                dob.value = dateString; age.value = Math.abs(new Date(Date.now() - new Date(dateString).getTime()).getUTCFullYear() - 1970);
            } else if (dob && age) { dob.value = ''; age.value = ''; }
        }
    } catch (err) {}
});

safeBind('profile-form', 'submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('profile-submit-btn'); const alertBox = document.getElementById('profile-alert');
    const userEl = document.getElementById('profile-username'); if(!userEl) return;
    if(submitBtn) { submitBtn.disabled = true; submitBtn.innerText = "Saving..."; }
    
    try {
        const payload = { username: userEl.value.trim(), fullName: document.getElementById('profile-fullname')?.value, email: document.getElementById('profile-email')?.value, phone: document.getElementById('profile-phone')?.value, dob: document.getElementById('profile-dob')?.value, address: document.getElementById('profile-address')?.value };
        const res = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (handlePossibleForceLogout(data)) return;
        
        if(alertBox) { alertBox.classList.remove('d-none', 'alert-danger', 'alert-success'); alertBox.classList.add(data.success ? 'alert-success' : 'alert-danger'); alertBox.innerText = data.message; }
        if(data.success) {
            const badge = document.getElementById('username-badge'); if(badge) badge.innerText = data.newUsername || userEl.value.trim();
            setTimeout(() => { switchView('booking-section'); if(submitBtn){submitBtn.disabled = false; submitBtn.innerText = "Save Changes";} }, 0);
        } else if(submitBtn) { submitBtn.disabled = false; submitBtn.innerText = "Save Changes"; }
    } catch (err) {}
});

safeBind('profile-dob', 'change', (e) => {
    const ageInput = document.getElementById('profile-age');
    if(ageInput && e.target.value) ageInput.value = Math.abs(new Date(Date.now() - new Date(e.target.value).getTime()).getUTCFullYear() - 1970);
});

(async function initializeApp() {
    const initLoader = document.getElementById('initial-loader');
    const hideLoader = () => { if (initLoader) { initLoader.style.display = 'none'; initLoader.classList.add('d-none'); } };

    try {
        const controller = new AbortController(); 
        const timeoutId = setTimeout(() => controller.abort(), 15000); 
        const res = await fetch(`/api/check-session?t=${new Date().getTime()}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error("Server error.");
        
        const data = await res.json();
        hideLoader();
        if (data.loggedIn) showBookingScreen(data.username, data.isAdmin);
        else { switchView('auth-section'); }
    } catch (err) {
        hideLoader(); switchView('auth-section');
    }
})();
