# Society Amenity Booking System

A modern amenity booking system for a society with 250 residential units (unit numbers 100-6000).

## Features

- **15 Amenities Available**: Swimming Pool, Tennis Court, Gym, Community Room, BBQ Area, Playground, Basketball Court, Yoga Studio, Library, Garden, Carrom Room, Table Tennis, Billiards Room, Meeting Hall, Kids Club
- **250 Unit Capacity**: Supports 250 residential units with unit numbers ranging from 100-6000
- **Resident Authentication**: 
  - Registration with unit verification (100-6000)
  - Admin approval required for new residents
  - Session-based login (user cannot login twice simultaneously)
- **Booking System**:
  - Book any of 15 amenities
  - Maximum 10 guests per booking
  - Prevents duplicate amenity bookings at same time
  - Prevents same user from booking multiple amenities at same time
  - No past date bookings allowed
- **Admin Panel**: Approve/reject resident registrations
- **Mobile-Responsive Design**: Works on all devices

## Project Structure

```
community-website/
├── frontend/            # Frontend files
│   ├── html/            # HTML pages
│   │   ├── index.html   # Main booking page
│   │   ├── register.html # Registration page
│   │   ├── login.html   # Login page
│   │   └── admin.html   # Admin approval page
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
├── data/                # JSON Data storage
│   ├── users.json
│   ├── bookings.json
│   └── sessions.json
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
   - Admin: http://localhost:3000/admin.html

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

3. **Book Amenities**:
   - Select amenity from 15 options
   - Choose date and time slot
   - Specify number of guests (max 10)
   - Submit booking

### For Admin:

1. **Login**: Use admin credentials (default: `admin@society.com` / `admin123`)
2. **Access Admin Panel**: Go to `/admin.html` (or click Admin link in navbar)
3. **Review Registrations**: See all pending registrations
4. **Approve/Reject**: Click approve or reject for each registration
5. **Residents can login** after approval

## Key Features Explained

### Single Login Restriction
- Users cannot login twice simultaneously
- Session tracking prevents duplicate logins
- Must logout before logging in again

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

- Password hashing using SHA-256
- Session-based authentication
- Admin approval required for new users
- Input validation on all forms
- Admin-only access to admin panel and APIs

## Customization

### Add More Amenities:
Edit `frontend/html/index.html` and add to the amenities section and booking form dropdown.

### Change Unit Capacity:
Update validation in `backend/server/server-simple-sqlite.js` and `frontend/html/register.html` to change the unit number range (currently 100-6000).

### Modify Time Slots:
Edit the time slot options in `frontend/html/index.html`.

## Troubleshooting

### Port Already in Use:
If port 3000 is busy, change the PORT variable in `backend/server/server-simple-sqlite.js`.

### npm not recognized:
Install Node.js from https://nodejs.org/ and restart your terminal.

### Database not found:
Run `npm run init-db` to initialize the SQLite database.

## Technologies Used

- **Frontend**: HTML5, CSS3, JavaScript
- **Backend**: Node.js, Express
- **Database**: SQLite
- **Authentication**: Session-based with cookie management
- **Security**: Password hashing, input validation, admin access control

## License

ISC