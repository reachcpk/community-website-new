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
    setupBookingForm();
    setupLogout();
    
    // Setup admin page if on admin page
    if (window.location.pathname.includes('admin.html')) {
        loadRegistrations();
    }
    
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

// Update admin link visibility in navbar
function updateAdminLink() {
    const adminLink = document.querySelector('a[href="admin.html"]');
    if (adminLink) {
        if (currentUser && (currentUser.residentType === 'admin' || currentUser.resident_type === 'admin' || currentUser.email === 'admin@society.com')) {
            adminLink.style.display = 'inline';
        } else {
            adminLink.style.display = 'none';
        }
    }
}

// Protect admin page - redirect non-admin users
function protectAdminPage() {
    if (window.location.pathname.includes('admin.html')) {
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