const eventForm = document.getElementById('event-form');
const eventIdInput = document.getElementById('event-id');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('event-submit-btn');
const cancelBtn = document.getElementById('event-cancel-btn');

// Global variable to hold our Chart instance
let revenueChartInstance = null;

// 🎨 Set Global Chart.js Typography to match the TicketHub Aesthetic
Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
Chart.defaults.color = '#a1a1aa';

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
            <button type="button" class="btn btn-warning w-100 rounded-pill fw-bold py-2" data-bs-dismiss="modal">OK</button>
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

window.addEventListener('DOMContentLoaded', async () => {
    const res = await fetch(`/api/check-session?t=${Date.now()}`);
    const data = await res.json();
    
    if (!data.loggedIn || !data.isAdmin) {
        alert("Access Denied. Please log in as an Admin.");
        window.location.href = 'admin-login.html';
        return;
    }

    loadAnalytics();
    loadEvents();
    loadUsers();
    
    if (document.getElementById('venues-container')) {
        createVenueBlock();
    }

    // --- NEW FEATURES: Role Toggle & View Tickets ---
    let currentRoleToggleUserId = null;

    window.openRoleModal = function(userId, username, isAdmin) {
        currentRoleToggleUserId = userId;
        const targetRole = isAdmin ? 'User' : 'Admin';
        const actionText = isAdmin ? 'demote' : 'promote';
        document.getElementById('roleToggleText').innerHTML = `You are about to <strong class="text-${isAdmin ? 'danger' : 'success'}">${actionText}</strong> <strong class="text-warning">${username}</strong> to <strong>${targetRole}</strong>.`;
        document.getElementById('adminSecretKeyInput').value = '';
        const modal = new bootstrap.Modal(document.getElementById('roleToggleModal'));
        modal.show();
    }

    document.getElementById('confirmRoleBtn')?.addEventListener('click', async () => {
        const secretKey = document.getElementById('adminSecretKeyInput').value;
        if (!secretKey) return alert("Please enter the Admin Secret Key.");

        try {
            const res = await fetch(`/api/admin/users/${currentRoleToggleUserId}/role`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secretKey })
            });
            const data = await res.json();
            if (data.success) {
                bootstrap.Modal.getInstance(document.getElementById('roleToggleModal')).hide();
                // dashboardUpdate socket will trigger reloadUsers
            } else {
                alert(data.message || "Failed to toggle role.");
            }
        } catch (err) {
            console.error("Error toggling role:", err);
            alert("An error occurred.");
        }
    });

    window.viewUserTickets = async function(userId, username) {
        document.getElementById('ticketsUsername').textContent = username;
        const listEl = document.getElementById('userTicketsList');
        listEl.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Loading...</td></tr>';
        
        const modal = new bootstrap.Modal(document.getElementById('userTicketsModal'));
        modal.show();

        try {
            const res = await fetch(`/api/admin/users/${userId}/tickets`);
            const data = await res.json();
            if (data.success) {
                if (data.tickets.length === 0) {
                    listEl.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No tickets found for this user.</td></tr>';
                } else {
                    listEl.innerHTML = data.tickets.map(t => `
                        <tr>
                            <td class="ps-3 fw-bold text-light">${t.eventTitle} <span class="badge bg-secondary ms-1">${t.eventType}</span></td>
                            <td>${new Date(t.bookingDate).toLocaleDateString()} <br> <small class="text-info">${t.timeSlot}</small></td>
                            <td><span class="badge bg-primary">${t.seatId}</span></td>
                            <td class="text-end pe-3 fw-bold text-success">₹${t.price}</td>
                        </tr>
                    `).join('');
                }
            } else {
                listEl.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Failed to load tickets.</td></tr>';
            }
        } catch (err) {
            console.error("Error fetching tickets:", err);
            listEl.innerHTML = '<tr><td colspan="4" class="text-center text-danger">An error occurred.</td></tr>';
        }
    }

    // --- CHEVRON ROTATION LOGIC ---
    document.querySelectorAll('.collapse').forEach(col => {
        col.addEventListener('show.bs.collapse', function() {
            const btn = document.querySelector(`[data-bs-target="#${this.id}"] svg`);
            if (btn) {
                btn.style.transition = 'transform 0.3s ease';
                btn.style.transform = 'rotate(180deg)';
            }
        });
        col.addEventListener('hide.bs.collapse', function() {
            const btn = document.querySelector(`[data-bs-target="#${this.id}"] svg`);
            if (btn) {
                btn.style.transition = 'transform 0.3s ease';
                btn.style.transform = 'rotate(0deg)';
            }
        });
    });
});

document.getElementById('event-poster-file').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800; 
            const MAX_HEIGHT = 800;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
            } else {
                if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
            document.getElementById('event-image').value = compressedBase64;
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});


async function loadAnalytics() {
    // 🚨 Inject Skeleton Loaders
    document.getElementById('stat-revenue').innerHTML = '<span class="spinner-border spinner-border-sm text-muted"></span>';
    document.getElementById('stat-tickets').innerHTML = '<span class="spinner-border spinner-border-sm text-muted"></span>';
    document.getElementById('stat-events').innerHTML = '<span class="spinner-border spinner-border-sm text-muted"></span>';
    document.getElementById('stat-users').innerHTML = '<span class="spinner-border spinner-border-sm text-muted"></span>';

    try {
        const res = await fetch(`/api/admin/analytics?t=${Date.now()}`);
        const data = await res.json();
        
        if(data.success) {
            animateCountUp(document.getElementById('stat-revenue'), 0, data.totalRevenue, 1500, true);
            animateCountUp(document.getElementById('stat-tickets'), 0, data.totalTicketsSold, 1500, false);
            animateCountUp(document.getElementById('stat-events'), 0, data.totalEvents, 1500, false);
            animateCountUp(document.getElementById('stat-users'), 0, data.totalUsers, 1500, false);

            renderChart(data.eventStats);
        }
    } catch (err) {
        console.error("Error loading analytics:", err);
    }
}

// 🎨 Count Up Animation for Stats
function animateCountUp(element, start, end, duration, isCurrency = false) {
    // Wait until element is visible (like useInView)
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                observer.unobserve(element);
                
                let startTimestamp = null;
                const step = (timestamp) => {
                    if (!startTimestamp) startTimestamp = timestamp;
                    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
                    
                    // Easing function (easeOutExpo)
                    const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
                    const currentVal = start + (end - start) * easeProgress;
                    
                    if (isCurrency) {
                        element.innerText = currentVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    } else {
                        element.innerText = Math.floor(currentVal).toLocaleString('en-IN');
                    }
                    
                    if (progress < 1) {
                        window.requestAnimationFrame(step);
                    } else {
                        if (isCurrency) {
                            element.innerText = end.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        } else {
                            element.innerText = end.toLocaleString('en-IN');
                        }
                    }
                };
                window.requestAnimationFrame(step);
            }
        });
    }, { threshold: 0.1 });
    
    // Set initial 0 value before animation starts
    if (isCurrency) {
        element.innerText = (0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else {
        element.innerText = "0";
    }
    
    observer.observe(element);
}

// 🚨 PREMIUM CHART UI OVERHAUL
function renderChart(eventStats) {
    const canvas = document.getElementById('revenueChart');
    const ctx = canvas.getContext('2d');

    if (revenueChartInstance) {
        revenueChartInstance.destroy();
    }

    const topEvents = eventStats.slice(0, 10);
    const labels = topEvents.map(e => e.title.length > 15 ? e.title.substring(0, 15) + '...' : e.title);
    const revenues = topEvents.map(e => e.revenue);

    // 🎨 Create a sleek vertical gradient for the bars
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight);
    gradient.addColorStop(0, 'rgba(239, 68, 68, 1)');     // Solid Brand Red
    gradient.addColorStop(0.8, 'rgba(239, 68, 68, 0.1)'); // Faded Red
    gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');     // Transparent at bottom

    revenueChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Gross Revenue (₹)',
                data: revenues,
                backgroundColor: gradient,
                borderColor: '#ef4444',
                borderWidth: { top: 2, right: 2, left: 2, bottom: 0 },
                borderRadius: 6, // Smooth rounded tops
                borderSkipped: 'bottom', // Keeps the bottom flat on the axis
                maxBarThickness: 45, // 🚨 STOPS THE CHUNKY BRICK EFFECT
                hoverBackgroundColor: '#ef4444', // Solid bright red on hover
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(18, 18, 18, 0.95)', // Glassy dark background
                    titleColor: '#a1a1aa', // Muted title
                    bodyColor: '#ffffff',  // White text
                    bodyFont: { weight: 'bold', size: 15 },
                    padding: 14,
                    borderColor: '#3f3f46',
                    borderWidth: 1,
                    displayColors: false, // Hides the little color square in the tooltip
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            // 🚨 FIXED: Formatting exact chart tooltip values
                            return 'Revenue: ₹' + context.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    border: { display: false }, // Hides the heavy solid axis line
                    grid: { 
                        color: 'rgba(255, 255, 255, 0.05)', 
                        borderDash: [5, 5] // Sleek dotted grid lines
                    },
                    ticks: { 
                        color: '#a1a1aa', 
                        padding: 10,
                        font: { size: 11, weight: '600' },
                        callback: function(value) { return '₹' + value; } 
                    } 
                },
                x: {
                    border: { display: false },
                    grid: { display: false }, // Removes vertical grid lines entirely
                    ticks: { 
                        color: '#a1a1aa', 
                        padding: 10, 
                        maxRotation: 45, 
                        minRotation: 45,
                        font: { size: 11, weight: '600' }
                    }
                }
            }
        }
    });
}

async function loadEvents() {
    const container = document.getElementById('event-list-container');
    
    // 🚨 Inject Event List Skeletons
    container.innerHTML = Array(3).fill(`
        <div class="admin-event-row rounded mb-2 skeleton-card" style="border-color: var(--border-color);">
            <div class="d-flex align-items-center flex-grow-1 w-100">
                <div class="skeleton-img" style="width: 64px; height: 64px; border-radius: 12px; border: none; flex-shrink: 0;"></div>
                <div class="ms-3 w-100">
                    <div class="skeleton-text w-50 mb-2"></div>
                    <div class="skeleton-text w-25"></div>
                </div>
            </div>
        </div>
    `).join('');

    try {
        const res = await fetch(`/api/admin/events?t=${Date.now()}`);
        const events = await res.json();

        if (events.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-5 border rounded" style="border-color: #262626 !important; background-color: var(--surface-card);">No events found.</div>';
            return;
        }

        container.innerHTML = events.map(e => {
            const firstLoc = e.locations && e.locations.length > 0 ? e.locations[0] : null;
            const d = firstLoc && firstLoc.startDate ? new Date(firstLoc.startDate) : new Date();
            const dateStr = d.toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'});
            
            const sold = e.ticketsSold || 0;
            const capacity = e.locations ? e.locations.reduce((sum, l) => sum + l.capacity, 0) : 0; 
            const available = Math.max(0, capacity - sold);
            const percent = capacity > 0 ? Math.min(100, Math.round((sold / capacity) * 100)) : 0;
            
            let imgHtml = '';
            if (e.imageUrl) {
                imgHtml = `<img src="${e.imageUrl}" class="admin-event-img border" style="border-color: #262626 !important;">`;
            } else {
                const icon = e.eventType === 'Seated' ? '💺' : '🎫';
                imgHtml = `<div class="admin-event-img border" style="border-color: #262626 !important; background-color: rgba(255,255,255,0.05);">${icon}</div>`;
            }

            let badgeClass = e.eventType === 'Seated' ? 'bg-info text-dark' : 'bg-warning text-dark';
            
            let ratingBadge = '';
            if(e.ageLimit === 0) ratingBadge = `<span class="badge bg-success ms-2">U</span>`;
            else if(e.ageLimit === 7) ratingBadge = `<span class="badge bg-info text-dark ms-2">UA 7+</span>`;
            else if(e.ageLimit === 13) ratingBadge = `<span class="badge bg-warning text-dark ms-2">UA 13+</span>`;
            else if(e.ageLimit === 16) ratingBadge = `<span class="badge bg-warning text-dark ms-2">UA 16+</span>`;
            else if(e.ageLimit === 18) ratingBadge = `<span class="badge bg-danger ms-2">A</span>`;
            else if(e.ageLimit === 99) ratingBadge = `<span class="badge bg-dark ms-2">S</span>`;

            let catColor = 'bg-secondary text-white';
            if (e.category === 'Movie') catColor = 'bg-primary bg-opacity-25 text-primary border border-primary border-opacity-25';
            else if (e.category === 'Concert') catColor = 'bg-danger bg-opacity-25 text-danger border border-danger border-opacity-25';
            else if (e.category === 'Theater' || e.category === 'Standup Comedy') catColor = 'bg-warning bg-opacity-25 text-warning border border-warning border-opacity-25';
            
            let catBadge = e.category ? `<span class="badge ${catColor} ms-3 rounded-pill" style="font-size: 10px; padding: 4px 10px; letter-spacing: 0.5px;">${e.category}</span>` : '';

            let locationNames = e.locations && e.locations.length > 0 ? Array.from(new Set(e.locations.map(l => l.venueName))).join(', ') : 'No Locations';
            let slotsDisplay = e.locations && e.locations.length > 0 ? `${e.locations.length} Venue(s)` : 'No slots';

            return `
            <div class="admin-event-row rounded mb-2">
                
                <div class="d-flex align-items-center flex-grow-1">
                    ${imgHtml}
                    <div class="ms-3">
                        <div class="d-flex align-items-center gap-2 mb-1">
                            <h6 class="fw-bold mb-0 text-white" style="font-size: 15px;">${e.title} ${ratingBadge} ${catBadge}</h6>
                            <span class="badge ${badgeClass} rounded-pill" style="font-size: 10px; padding: 4px 8px; letter-spacing: 0.5px;">${e.eventType}</span>
                        </div>
                        <div class="text-muted mb-1" style="font-size: 13px;">${locationNames}</div>
                        <div class="text-muted" style="font-size: 13px;">${dateStr} | Info: <span class="text-info">${slotsDisplay}</span></div>
                    </div>
                </div>
                
                <div class="d-flex align-items-center justify-content-end gap-4 pe-4 border-end border-secondary border-opacity-25" style="min-width: 250px;">
                    <div class="admin-event-stat">
                        <span class="admin-stat-num text-white">${sold}</span>
                        <span class="admin-stat-label">Sold (Total)</span>
                    </div>
                    <div class="admin-event-stat" style="width: 50px;">
                        <span class="fw-bold text-white mb-1" style="font-size: 11px;">${percent}%</span>
                        <div class="progress w-100" style="height: 4px; background-color: #262626;">
                            <div class="progress-bar bg-danger" role="progressbar" style="width: ${percent}%"></div>
                        </div>
                    </div>
                </div>
                
                <div class="ps-4 text-center" style="min-width: 50px;">
                    <div class="dropdown">
                        <button class="btn btn-link text-muted p-0 text-decoration-none fs-5" data-bs-toggle="dropdown" aria-expanded="false">⋮</button>
                        <ul class="dropdown-menu dropdown-menu-dark dropdown-menu-end shadow-lg" style="border-color: #262626;">
                            <li><button class="dropdown-item fw-bold text-white py-2" onclick='editEvent(${JSON.stringify(e).replace(/'/g, "&apos;")})'>✏️ Edit Event</button></li>
                            <li><hr class="dropdown-divider border-secondary opacity-25 my-1"></li>
                            <li><button class="dropdown-item text-danger fw-bold py-2" onclick="deleteEvent('${e._id}')">🗑️ Delete Event</button></li>
                        </ul>
                    </div>
                </div>
                
            </div>
            `
        }).join('');
    } catch (err) {
        console.error("Error loading events:", err);
    }
}

async function loadUsers() {
    const tbody = document.getElementById('user-table-body');
    
    // 🚨 Inject User List Skeletons
    tbody.innerHTML = Array(4).fill(`
        <tr>
            <td class="ps-4 py-3"><div class="skeleton-text w-50"></div></td>
            <td class="py-3"><div class="skeleton-text w-25"></div></td>
            <td class="text-end pe-4 py-3"><div class="skeleton-text w-25 ms-auto"></div></td>
        </tr>
    `).join('');

    try {
        const res = await fetch(`/api/admin/users?t=${Date.now()}`);
        window.allUsers = await res.json();
        renderUsers(window.allUsers);
    } catch (err) {
        console.error("Error loading users:", err);
    }
}

window.renderUsers = function(users) {
    const tbody = document.getElementById('user-table-body');
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No users found.</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(u => `
        <tr>
            <td class="ps-4">${u.username}</td>
            <td>${u.isAdmin ? '<span class="badge bg-warning text-dark">Admin</span>' : '<span class="badge bg-secondary">User</span>'}</td>
            <td class="text-center text-nowrap">
                <button class="btn btn-outline-info btn-sm fw-bold me-1" onclick="openRoleModal('${u._id}', '${u.username}', ${u.isAdmin})">Role</button>
                <button class="btn btn-outline-success btn-sm fw-bold me-1" onclick="viewUserTickets('${u._id}', '${u.username}')">Tickets</button>
                <button class="btn btn-outline-danger btn-sm fw-bold" onclick="deleteUser('${u._id}')">Remove</button>
            </td>
        </tr>
    `).join('');
}

document.getElementById('user-search-input')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    
    // Auto-expand the table if it is collapsed and we are searching
    if (query.length > 0) {
        const userCollapseEl = document.getElementById('userCollapse');
        if (userCollapseEl && !userCollapseEl.classList.contains('show')) {
            const bsCollapse = bootstrap.Collapse.getOrCreateInstance(userCollapseEl);
            bsCollapse.show();
        }
    }

    if (!window.allUsers) return;
    const filtered = window.allUsers.filter(u => u.username.toLowerCase().includes(query));
    renderUsers(filtered);
});

// DYNAMIC VENUES LOGIC
let venueCount = 0;
const venuesContainer = document.getElementById('venues-container');
const addVenueBtn = document.getElementById('add-venue-btn');

function createVenueBlock(data = null) {
    const vId = `venue-${venueCount++}`;
    const div = document.createElement('div');
    div.className = 'venue-block p-3 border rounded mb-2 position-relative';
    div.style.borderColor = 'var(--border-color)';
    div.style.backgroundColor = 'rgba(255,255,255,0.02)';
    div.id = vId;

    div.innerHTML = `
        <button type="button" class="btn btn-sm btn-danger position-absolute top-0 end-0 m-2" onclick="document.getElementById('${vId}').remove()">X</button>
        <div class="row g-2">
            <div class="col-12 col-md-6">
                <label class="form-label text-info small">Venue Search (OSM)</label>
                <div class="input-group input-group-sm">
                    <input type="text" class="form-control venue-search-input" placeholder="Search address...">
                    <button class="btn btn-outline-info search-osm-btn" type="button">Search</button>
                </div>
                <div class="form-text text-muted" style="font-size: 10px;">If not found, type the City and Venue Name manually.</div>
                <ul class="list-group mt-1 osm-results" style="position: absolute; z-index: 1000; width: 95%; display:none;"></ul>
            </div>
            <div class="col-12 col-md-3">
                <label class="form-label text-info small">Selected City</label>
                <input type="text" class="form-control form-control-sm venue-city" required value="${data?.city || ''}">
            </div>
            <div class="col-12 col-md-3">
                <label class="form-label text-info small">Venue Name</label>
                <input type="text" class="form-control form-control-sm venue-name" required value="${data?.venueName || ''}">
            </div>
            
            <input type="hidden" class="venue-lat" value="${data?.lat || ''}">
            <input type="hidden" class="venue-lon" value="${data?.lon || ''}">

            <div class="col-6 col-md-3">
                <label class="form-label text-success small">Capacity (per slot)</label>
                <input type="number" class="form-control form-control-sm venue-capacity" required value="${data?.capacity || ''}">
            </div>
            <div class="col-6 col-md-3">
                <label class="form-label text-success small">Price (₹)</label>
                <input type="number" step="0.01" class="form-control form-control-sm venue-price" required value="${data?.price || 0}">
            </div>
            <div class="col-6 col-md-3">
                <label class="form-label small">Start Date & Time</label>
                <input type="datetime-local" class="form-control form-control-sm venue-start" required value="${data?.startDate ? formatForDateTimeLocal(data.startDate) : ''}">
            </div>
            <div class="col-6 col-md-3">
                <label class="form-label small">End Date & Time</label>
                <input type="datetime-local" class="form-control form-control-sm venue-end" required value="${data?.endDate ? formatForDateTimeLocal(data.endDate) : ''}">
            </div>
            <div class="col-12">
                <label class="form-label text-primary small">Time Slots (Comma separated)</label>
                <input type="text" class="form-control form-control-sm venue-timeslots" placeholder="e.g. 09:40 AM, 12:50 PM" required value="${data?.timeSlots ? data.timeSlots.join(', ') : ''}">
            </div>
        </div>
    `;

    venuesContainer.appendChild(div);

    // Bind OSM Search
    const searchBtn = div.querySelector('.search-osm-btn');
    const searchInput = div.querySelector('.venue-search-input');
    const resultsUl = div.querySelector('.osm-results');
    const cityInput = div.querySelector('.venue-city');
    const nameInput = div.querySelector('.venue-name');
    const latInput = div.querySelector('.venue-lat');
    const lonInput = div.querySelector('.venue-lon');

    searchBtn.addEventListener('click', async () => {
        const query = searchInput.value.trim();
        if(!query) return;
        searchBtn.innerHTML = '...';
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1`);
            const results = await res.json();
            resultsUl.innerHTML = '';
            if(results.length === 0) {
                resultsUl.innerHTML = '<li class="list-group-item bg-dark text-muted">No results found. Please enter City & Venue Name manually.</li>';
                resultsUl.style.display = 'block';
            } else {
                results.slice(0, 5).forEach(r => {
                    const li = document.createElement('li');
                    li.className = 'list-group-item list-group-item-action bg-dark text-white';
                    li.style.cursor = 'pointer';
                    li.innerText = r.display_name;
                    li.onclick = () => {
                        nameInput.value = r.name || r.display_name.split(',')[0];
                        cityInput.value = r.address?.city || r.address?.town || r.address?.village || r.address?.county || '';
                        latInput.value = r.lat;
                        lonInput.value = r.lon;
                        resultsUl.style.display = 'none';
                        searchInput.value = r.display_name;
                    };
                    resultsUl.appendChild(li);
                });
            }
            resultsUl.style.display = 'block';
        } catch(e) {
            console.error(e);
        }
        searchBtn.innerHTML = 'Search';
    });

    // close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if(!div.contains(e.target)) resultsUl.style.display = 'none';
    });
}

if(addVenueBtn) {
    addVenueBtn.addEventListener('click', () => createVenueBlock());
}

eventForm.addEventListener('submit', async (e) => {
    e.preventDefault(); 

    const eventId = eventIdInput.value;
    const isEditing = !!eventId; 

    // Gather dynamic locations
    const locations = [];
    document.querySelectorAll('.venue-block').forEach(div => {
        const startInput = div.querySelector('.venue-start').value;
        const endInput = div.querySelector('.venue-end').value;
        locations.push({
            venueName: div.querySelector('.venue-name').value,
            city: div.querySelector('.venue-city').value,
            lat: div.querySelector('.venue-lat').value ? Number(div.querySelector('.venue-lat').value) : null,
            lon: div.querySelector('.venue-lon').value ? Number(div.querySelector('.venue-lon').value) : null,
            capacity: parseInt(div.querySelector('.venue-capacity').value),
            price: Number(div.querySelector('.venue-price').value),
            startDate: startInput ? new Date(startInput).toISOString() : null,
            endDate: endInput ? new Date(endInput).toISOString() : null,
            timeSlots: div.querySelector('.venue-timeslots').value.split(',').map(s => s.trim())
        });
    });

    if(locations.length === 0) {
        alert("Please add at least one venue!");
        return;
    }

    const payload = {
        title: document.getElementById('event-title').value,
        ageLimit: parseInt(document.getElementById('event-age').value), 
        eventType: document.getElementById('event-type').value,
        category: document.getElementById('event-category').value, 
        locations: locations,
        description: document.getElementById('event-description').value,
        imageUrl: document.getElementById('event-image').value
    };

    const endpoint = isEditing ? `/api/admin/events/${eventId}` : '/api/admin/events';
    const method = isEditing ? 'PUT' : 'POST';

    try {
        const res = await fetch(endpoint, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        alert(data.message);
        if (data.success) {
            resetEventForm();
            loadEvents(); 
            loadAnalytics(); 
        }
    } catch (err) {
        alert("An error occurred while saving the event.");
    }
});

window.deleteEvent = async function(id) {
    if (!confirm("Are you sure you want to delete this event? This will also delete all associated tickets!")) return;

    try {
        const res = await fetch(`/api/admin/events/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            loadEvents(); 
            loadAnalytics(); 
        } else {
            alert(data.message);
        }
    } catch (err) {
        alert("Failed to delete event.");
    }
}

window.editEvent = function(eventData) {
    eventIdInput.value = eventData._id;
    document.getElementById('event-title').value = eventData.title;
    document.getElementById('event-age').value = eventData.ageLimit || 0;
    document.getElementById('event-type').value = eventData.eventType;
    document.getElementById('event-category').value = eventData.category || 'Movie'; 
    document.getElementById('event-description').value = eventData.description || '';
    document.getElementById('event-image').value = eventData.imageUrl || ''; 
    document.getElementById('event-poster-file').value = ''; 

    venuesContainer.innerHTML = '';
    if (eventData.locations && eventData.locations.length > 0) {
        eventData.locations.forEach(loc => createVenueBlock(loc));
    } else {
        createVenueBlock(); // Fallback
    }

    formTitle.innerHTML = '✏️ Edit Event';
    submitBtn.innerText = 'Save Changes';
    submitBtn.classList.replace('btn-success', 'btn-warning');
    cancelBtn.classList.remove('d-none');
    
    document.getElementById('event-type').disabled = false;

    eventForm.scrollIntoView({ behavior: 'smooth' });
}

function formatForDateTimeLocal(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
}

window.resetEventForm = function() {
    eventForm.reset();
    eventIdInput.value = '';
    document.getElementById('event-image').value = '';
    formTitle.innerHTML = '✨ Create New Event';
    submitBtn.innerText = 'Publish Event';
    submitBtn.classList.replace('btn-warning', 'btn-success');
    cancelBtn.classList.add('d-none');
    venuesContainer.innerHTML = '';
    createVenueBlock();
}

window.deleteUser = async function(id) {
    if (!confirm("Are you sure you want to completely remove this user?")) return;

    try {
        const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            loadUsers();
            loadAnalytics(); 
        } else {
            alert(data.message);
        }
    } catch (err) {
        alert("Failed to delete user.");
    }
}

const socket = typeof io !== 'undefined' ? io() : null;
if (socket) {
    socket.on('dashboardUpdate', () => {
        loadAnalytics();
        loadEvents();
        loadUsers();
    });
}
