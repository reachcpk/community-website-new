// Global state
let currentUser = null;
let bookings = [];

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is logged in
    checkLoginStatus();
    
    // Setup form handlers
    setupRegistrationForm();
    setupLoginForm();
    setupForgotPasswordForm();
    setupBookingForm();
    setupLogout();
    
    // Setup admin page if on admin page
    if (window.location.pathname.includes('admin.html')) {
        loadRegistrations();
    }

    // Setup amenity maintenance page
    if (window.location.pathname.includes('amenity-maintenance.html')) {
        setupAmenityForm();
        loadAmenitiesAdmin();
    }

    // Load amenities for public pages (grid + booking dropdown)
    loadAmenities();

    // Setup date restriction for booking
    setupDateRestriction();
});

// Check login status
function checkLoginStatus() {
    const userCookie = getCookie('society_user');
    if (userCookie) {
        try {
            const user = JSON.parse(userCookie);
            currentUser = normalizeUser(user);
            if (document.getElementById('loggedInUser')) {
                document.getElementById('loggedInUser').textContent = currentUser.name;
            }
        } catch (e) {
            console.error('Error parsing user cookie:', e);
            deleteCookie('society_user');
        }
    }
    
    // Allow access to home page without login, but show login prompt for booking
    if (!currentUser && document.getElementById('loggedInUser')) {
        document.getElementById('loggedInUser').textContent = 'Please login to book';
    }
    
    // Show/hide admin link based on user role
    updateAdminLink();
    
    // Protect admin page
    protectAdminPage();
}

// Setup registration form
function setupRegistrationForm() {
    const registerForm = document.getElementById('registerForm');
    if (!registerForm) return;
    
    registerForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(registerForm);
        const data = Object.fromEntries(formData);
        
        // Validate passwords match
        if (data.password !== data.confirmPassword) {
            alert('Passwords do not match!');
            return;
        }
        
        // Validate unit number range
        if (data.unitNumber < 100 || data.unitNumber > 6000) {
            alert('Unit number must be between 100 and 6000');
            return;
        }
        
        // Check if email already exists
        try {
            const checkResponse = await fetch('/api/check-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: data.email })
            });
            
            const checkResult = await checkResponse.json();
            if (checkResult.exists) {
                alert('Email already registered!');
                return;
            }
            
            // Check if unit number already exists
            const unitResponse = await fetch('/api/check-unit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unitNumber: data.unitNumber })
            });
            
            const unitResult = await unitResponse.json();
            if (unitResult.exists) {
                alert('Unit number already registered!');
                return;
            }
            
            // Register user
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (result.success) {
                alert('Registration successful! Please wait for admin approval.');
                window.location.href = 'login.html';
            } else {
                alert('Registration failed: ' + result.message);
            }
        } catch (error) {
            console.error('Registration error:', error);
            alert('Registration failed. Please try again.');
        }
    });
}

// Setup login form
function setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;
    
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(loginForm);
        const data = Object.fromEntries(formData);
        
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Normalize user data (convert snake_case to camelCase)
                const user = normalizeUser(result.user);
                
                // Set cookie for session
                setCookie('society_user', JSON.stringify(user), 7);
                currentUser = user;
                
                alert('Login successful!');
                window.location.href = 'index.html';
            } else {
                alert('Login failed: ' + result.message);
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('Login failed. Please try again.');
        }
    });
}

// Setup forgot password form
function setupForgotPasswordForm() {
    const forgotForm = document.getElementById('forgotPasswordForm');
    if (!forgotForm) return;
    
    forgotForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(forgotForm);
        const data = Object.fromEntries(formData);
        
        // Validate passwords match
        if (data.newPassword !== data.confirmPassword) {
            alert('New password and confirm password do not match');
            return;
        }
        
        // Validate password length
        if (data.newPassword.length < 6) {
            alert('Password must be at least 6 characters');
            return;
        }
        
        try {
            const response = await fetch('/api/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (result.success) {
                alert(result.message);
                window.location.href = 'login.html';
            } else {
                alert('Password reset failed: ' + result.message);
            }
        } catch (error) {
            console.error('Forgot password error:', error);
            alert('Password reset failed. Please try again.');
        }
    });
}

// Setup booking form
function setupBookingForm() {
    const bookingForm = document.getElementById('bookingForm');
    if (!bookingForm) return;
    
    // Disable form if not logged in
    if (!currentUser) {
        const formElements = bookingForm.querySelectorAll('input, select, textarea, button');
        formElements.forEach(el => el.disabled = true);
        
        const loginPrompt = document.createElement('div');
        loginPrompt.innerHTML = `
            <div style="text-align: center; padding: 2rem; background: #f8f9fa; border-radius: 10px; margin-bottom: 1rem;">
                <h3 style="color: #667eea; margin-bottom: 1rem;">Login Required</h3>
                <p style="margin-bottom: 1rem;">Please login to book amenities</p>
                <a href="login.html" class="submit-button" style="display: inline-block; text-decoration: none;">Login to Book</a>
            </div>
        `;
        bookingForm.parentNode.insertBefore(loginPrompt, bookingForm);
        bookingForm.style.display = 'none';
        return;
    }
    
    bookingForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(bookingForm);
        const data = Object.fromEntries(formData);
        
        // Add user info (support both camelCase and snake_case from database)
        data.name = currentUser.name;
        data.email = currentUser.email;
        data.phone = currentUser.phone;
        data.unitNumber = currentUser.unitNumber || currentUser.unit_number;
        
        // Validate guest count
        if (data.guests > 10) {
            alert('Maximum 10 guests allowed');
            return;
        }
        
        // Validate date (no past dates)
        const selectedDate = new Date(data.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (selectedDate < today) {
            alert('Cannot book for past dates');
            return;
        }
        
        try {
            const response = await fetch('/api/book', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Show confirmation
                bookingForm.classList.add('hidden');
                const confirmation = document.getElementById('confirmation');
                confirmation.classList.remove('hidden');
                
                document.getElementById('confirmation-details').innerHTML = `
                    <strong>Amenity:</strong> ${data.amenity}<br>
                    <strong>Date:</strong> ${data.date}<br>
                    <strong>Time:</strong> ${data.time}<br>
                    <strong>Guests:</strong> ${data.guests}
                `;
            } else {
                alert('Booking failed: ' + result.message);
            }
        } catch (error) {
            console.error('Booking error:', error);
            alert('Booking failed. Please try again.');
        }
    });
    
    // New booking button
    const newBookingBtn = document.getElementById('newBooking');
    if (newBookingBtn) {
        newBookingBtn.addEventListener('click', function() {
            bookingForm.reset();
            bookingForm.classList.remove('hidden');
            document.getElementById('confirmation').classList.add('hidden');
        });
    }
}

// Setup logout
function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) return;
    
    logoutBtn.addEventListener('click', async function(e) {
        e.preventDefault();
        
        if (currentUser) {
            try {
                await fetch('/api/logout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: currentUser.email })
                });
            } catch (error) {
                console.error('Logout error:', error);
            }
        }
        
        deleteCookie('society_user');
        currentUser = null;
        window.location.href = 'login.html';
    });
}

// Setup date restriction
function setupDateRestriction() {
    const dateInput = document.getElementById('date');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.setAttribute('min', today);
    }
}

// Load registrations for admin
async function loadRegistrations() {
    try {
        const response = await fetch('/api/registrations', {
            credentials: 'same-origin'
        });
        const registrations = await response.json();
        
        const loading = document.getElementById('loading');
        const noRegistrations = document.getElementById('noRegistrations');
        const tbody = document.getElementById('registrationsBody');
        
        loading.classList.add('hidden');
        
        if (registrations.length === 0) {
            noRegistrations.classList.remove('hidden');
            return;
        }
        
        tbody.innerHTML = registrations.map(reg => `
            <tr>
                <td>${reg.name}</td>
                <td>${reg.email}</td>
                <td>${reg.phone}</td>
                <td>${reg.unitNumber}</td>
                <td>${reg.unitType}</td>
                <td>${reg.residentType}</td>
                <td><span class="status-badge status-${reg.status}">${reg.status}</span></td>
                <td>
                    ${reg.status === 'pending' ? `
                        <button class="approve-button" onclick="approveUser('${reg.email}')">Approve</button>
                        <button class="approve-button" style="background: #dc3545;" onclick="rejectUser('${reg.email}')">Reject</button>
                    ` : '-'}
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading registrations:', error);
        document.getElementById('loading').textContent = 'Error loading registrations';
    }
}

// Approve user
async function approveUser(email) {
    try {
        const response = await fetch('/api/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ email })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('User approved successfully');
            loadRegistrations();
        } else {
            alert('Approval failed: ' + result.message);
        }
    } catch (error) {
        console.error('Approval error:', error);
        alert('Approval failed. Please try again.');
    }
}

// Reject user
async function rejectUser(email) {
    if (!confirm('Are you sure you want to reject this registration?')) return;
    
    try {
        const response = await fetch('/api/reject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ email })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('User rejected successfully');
            loadRegistrations();
        } else {
            alert('Rejection failed: ' + result.message);
        }
    } catch (error) {
        console.error('Rejection error:', error);
        alert('Rejection failed. Please try again.');
    }
}

// Load amenities into the public grid and booking dropdown
async function loadAmenities() {
    const grid = document.getElementById('amenitiesGrid');
    const select = document.getElementById('amenity');
    if (!grid && !select) return;

    try {
        const response = await fetch('/api/amenities');
        const amenities = await response.json();

        if (grid) {
            const noAmenities = document.getElementById('noAmenities');
            if (Array.isArray(amenities) && amenities.length > 0) {
                grid.innerHTML = amenities.map(a => `
                    <div class="amenity-card">
                        <h3>${escapeHtml(a.name)}</h3>
                        <p>${escapeHtml(a.description || '')}</p>
                    </div>
                `).join('');
            } else if (noAmenities) {
                noAmenities.classList.remove('hidden');
            }
        }

        if (select) {
            select.innerHTML = '<option value="">Choose an amenity</option>' +
                (Array.isArray(amenities) ? amenities : [])
                    .map(a => `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`)
                    .join('');
        }
    } catch (error) {
        console.error('Error loading amenities:', error);
    }
}

// Setup amenity creation form (admin maintenance page)
function setupAmenityForm() {
    const amenityForm = document.getElementById('amenityForm');
    if (!amenityForm) return;

    amenityForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const data = Object.fromEntries(new FormData(amenityForm));

        try {
            const response = await fetch('/api/amenities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.success) {
                amenityForm.reset();
                loadAmenitiesAdmin();
            } else {
                alert('Failed to add amenity: ' + result.message);
            }
        } catch (error) {
            console.error('Add amenity error:', error);
            alert('Failed to add amenity. Please try again.');
        }
    });
}

// Load amenities for the admin maintenance table
async function loadAmenitiesAdmin() {
    try {
        const response = await fetch('/api/amenities', {
            credentials: 'same-origin'
        });
        const amenities = await response.json();

        const loading = document.getElementById('amenitiesLoading');
        const noAmenities = document.getElementById('noAmenitiesMsg');
        const tbody = document.getElementById('amenitiesBody');

        loading.classList.add('hidden');

        if (!Array.isArray(amenities) || amenities.length === 0) {
            tbody.innerHTML = '';
            noAmenities.classList.remove('hidden');
            return;
        }

        noAmenities.classList.add('hidden');
        tbody.innerHTML = amenities.map(a => `
            <tr>
                <td>${escapeHtml(a.name)}</td>
                <td>${escapeHtml(a.description || '-')}</td>
                <td>${a.created_at ? a.created_at.split(' ')[0] : '-'}</td>
                <td>
                    <button class="approve-button" style="background: #dc3545;" onclick="deleteAmenity('${a.id}')">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading amenities:', error);
        document.getElementById('amenitiesLoading').textContent = 'Error loading amenities';
    }
}

// Delete amenity (admin)
async function deleteAmenity(id) {
    if (!confirm('Are you sure you want to delete this amenity?')) return;

    try {
        const response = await fetch('/api/amenities/' + encodeURIComponent(id), {
            method: 'DELETE',
            credentials: 'same-origin'
        });

        const result = await response.json();

        if (result.success) {
            loadAmenitiesAdmin();
        } else {
            alert('Delete failed: ' + result.message);
        }
    } catch (error) {
        console.error('Delete amenity error:', error);
        alert('Delete failed. Please try again.');
    }
}

// Escape HTML to prevent injection when rendering dynamic content
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// Update admin link visibility in navbar
function updateAdminLink() {
    const isAdmin = currentUser && (currentUser.residentType === 'admin' || currentUser.resident_type === 'admin' || currentUser.email === 'admin@society.com');
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isAdmin ? '' : 'none';
    });
}

// Protect admin pages - redirect non-admin users
function protectAdminPage() {
    const adminPages = ['admin.html', 'amenity-maintenance.html'];
    if (adminPages.some(p => window.location.pathname.includes(p))) {
        if (!currentUser) {
            alert('Please login as admin to access this page.');
            window.location.href = 'login.html';
            return;
        }

        const isAdmin = currentUser.residentType === 'admin' ||
                       currentUser.resident_type === 'admin' ||
                       currentUser.email === 'admin@society.com';

        if (!isAdmin) {
            alert('You do not have permission to access the admin page.');
            window.location.href = 'index.html';
        }
    }
}

// Normalize user data (handle both snake_case and camelCase)
function normalizeUser(user) {
    if (!user) return user;
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        unitNumber: user.unitNumber || user.unit_number,
        unitType: user.unitType || user.unit_type,
        residentType: user.residentType || user.resident_type,
        status: user.status,
        createdAt: user.createdAt || user.created_at
    };
}

// Cookie utilities
function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/';
}

function getCookie(name) {
    return document.cookie.split('; ').reduce((r, v) => {
        const parts = v.split('=');
        return parts[0] === name ? decodeURIComponent(parts[1]) : r;
    }, '');
}

function deleteCookie(name) {
    setCookie(name, '', -1);
}