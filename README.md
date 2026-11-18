# Society Amenity Booking System

A modern amenity booking system for a society with 250 residential units (unit numbers 100-6000).

## Features

- **Admin-Managed Amenities**: No built-in amenities — the admin creates them via the Amenity Maintenance screen (`/amenity-maintenance.html`), and they appear on the home page and booking form automatically
- **250 Unit Capacity**: Supports 250 residential units with unit numbers ranging from 100-6000
- **Resident Authentication**: 
  - Registration with unit verification (100-6000)
  - Admin approval required for new residents
  - Session-based login (one active session per user; a new login ends the previous one)
- **Booking System**:
  - Book any admin-created amenity
  - Maximum 10 guests per booking
  - Prevents duplicate amenity bookings at same time
  - Prevents same user from booking multiple amenities at same time
  - No past date bookings allowed
- **Admin Panel**: Approve/reject resident registrations
- **Forgot Password**: Pre-registered residents can reset password using email, unit number, and phone verification
- **Mobile-Responsive Design**: Works on all devices

## Project Structure

```
community-website/
├── frontend/            # Frontend files
│   ├── html/            # HTML pages
│   │   ├── index.html            # Main booking page
│   │   ├── register.html         # Registration page
│   │   ├── login.html            # Login page
│   │   ├── forgot-password.html  # Password reset for pre-registered users
│   │   ├── admin.html            # Admin approval page
│   │   └── amenity-maintenance.html  # Admin amenity management
│   ├── css/             # Styling
│   │   └── styles.css
│   └── js/              # Frontend logic
│       └── script.js
├── backend/             # Backend files
│   ├── server/          # Server implementation
│   │   └── server-simple-sqlite.js  # Express server using SQLite
│   ├── database/        # Database scripts
│   │   ├── init-sqlite.js           # SQLite database initialization
│   │   └── society-booking.db       # SQLite database file
│   └── config/          # Configuration files
├── .gitignore           # Git ignore rules
├── README.md            # This file
├── setup-guide.md       # Setup instructions
└── package.json         # Dependencies
```

## Installation

1. **Install Node.js** (if not already installed):
   - Download from https://nodejs.org/
   - Install the LTS version

2. **Install dependencies**:
   ```bash
   cd community-website
   npm install
   ```

## Usage

1. **Start the server**:
   ```bash
   npm start
   ```

2. **Access the application**:
   - Main application: http://localhost:3000
   - Registration: http://localhost:3000/register.html
   - Login: http://localhost:3000/login.html
   - Forgot Password: http://localhost:3000/forgot-password.html
   - Admin: http://localhost:3000/admin.html
   - Amenity Maintenance (admin): http://localhost:3000/amenity-maintenance.html

## Workflow

### For Residents:

1. **Register**: 
   - Go to `/register.html`
   - Fill in personal details and unit number (100-6000)
   - Wait for admin approval

2. **Login**:
   - Go to `/login.html`
   - Enter email and password
   - If approved, you'll be logged in

3. **Forgot Password**:
   - Click **Forgot password?** on the login page
   - Enter your email, unit number, and phone
   - Set a new password
   - Only works for approved/pre-registered residents

4. **Book Amenities**:
   - Select an amenity
   - Choose date and time slot
   - Specify number of guests (max 10)
   - Submit booking

### For Admin:

1. **Login**: Use the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set in `.env` before running `npm run init-db` (re-run `npm run init-db` to reset the admin password)
2. **Access Admin Panel**: Go to `/admin.html` (or click Admin link in navbar)
3. **Review Registrations**: See all pending registrations
4. **Approve/Reject**: Click approve or reject for each registration
5. **Residents can login** after approval

## Key Features Explained

### Single Login Restriction
- Each user has at most one active session
- Logging in again (e.g. on another device) automatically logs out the previous session
- Sessions expire after 7 days

### Same-User Conflict Prevention
- A user cannot book multiple amenities at the same date/time
- System checks both email and phone to identify user
- Prevents scheduling conflicts

### Amenity Conflict Prevention
- Same amenity cannot be booked by different users at same time
- First-come, first-served basis
- Clear error messages for conflicts

### Unit Validation
- Unit numbers must be between 100-6000
- Each unit can only be registered once
- Prevents duplicate registrations

### Admin Access Control
- Admin link is hidden from normal users
- Admin page is protected from non-admin access
- Admin APIs require admin authentication

## Security Features

- Salted password hashing using scrypt (legacy SHA-256 hashes are upgraded on next login)
- Server-side sessions in an HttpOnly, SameSite=Strict cookie
- Bookings are always made as the logged-in user (identity comes from the session)
- Rate limiting on login and forgot-password
- Admin accounts cannot be reset through the public forgot-password form
- Admin approval required for new users
- Input validation on all forms
- Admin-only access to admin panel and APIs

## Customization

### Add/Remove Amenities:
Login as admin and open the **Maintenance** link in the navbar (or go to `/amenity-maintenance.html`). Amenities are stored in the SQLite `amenities` table and rendered dynamically.

### Change Unit Capacity:
Update validation in `backend/server/server-simple-sqlite.js` and `frontend/html/register.html` to change the unit number range (currently 100-6000).

### Modify Time Slots:
Edit the time slot options in `frontend/html/index.html`.

## Troubleshooting

### Port Already in Use:
If port 3000 is busy, set `PORT` in your `.env` file.

### npm not recognized:
Install Node.js from https://nodejs.org/ and restart your terminal.

### Database not found:
The server creates the tables automatically on start. Run `npm run init-db` to create the admin account.

### Admin login fails:
If your admin password contains `#`, wrap it in quotes in `.env` (e.g. `ADMIN_PASSWORD="pa#ss"`), then re-run `npm run init-db`.

## Tests

```bash
npm test
```

## Technologies Used

- **Frontend**: HTML5, CSS3, JavaScript
- **Backend**: Node.js, Express
- **Database**: SQLite
- **Authentication**: Session-based with cookie management
- **Security**: Password hashing, input validation, admin access control

## License

ISC