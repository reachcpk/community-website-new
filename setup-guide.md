# Quick Setup Guide

## Step 1: Install Node.js
If you don't have Node.js installed:
1. Go to https://nodejs.org/
2. Download and install the LTS version
3. Restart your terminal/command prompt

## Step 2: Install Dependencies
Open Command Prompt (not PowerShell) and run:
```bash
cd C:\Users\DELL 7420\community-website-new
npm install
```

## Step 3: Initialize SQLite Database (First Time)
```bash
npm run init-db
```

## Step 4: Start the Server
```bash
npm start
```

## Step 5: Access the Application
- Main page: http://localhost:3000
- Register: http://localhost:3000/register.html
- Login: http://localhost:3000/login.html
- Admin: http://localhost:3000/admin.html

## Test Workflow

### 1. Login as Admin
1. Go to http://localhost:3000/login.html
2. Enter:
   - Email: `admin@society.com`
   - Password: `admin123`
3. Click Login
4. The Admin link will appear in the navbar

### 2. Register a Test User
1. Go to http://localhost:3000/register.html
2. Fill in:
   - Name: Test User
   - Email: test@example.com
   - Phone: 1234567890
   - Unit Number: 100 (minimum allowed)
   - Unit Type: 2BHK
   - Resident Type: owner
   - Password: test123
3. Click Register

### 3. Approve the User (Admin)
1. Go to http://localhost:3000/admin.html
2. You'll see the pending registration
3. Click "Approve"

### 4. Login as Test User
1. Go to http://localhost:3000/login.html
2. Enter email: test@example.com
3. Enter password: test123
4. Click Login

### 5. Test Forgot Password
1. Logout or open an incognito window
2. Go to http://localhost:3000/login.html
3. Click **Forgot password?**
4. Enter the test user's details:
   - Email: test@example.com
   - Unit Number: 100
   - Phone: 1234567890
   - New Password: newpass123
   - Confirm Password: newpass123
5. Click **Reset Password**
6. Login with the new password

### 6. Book an Amenity
1. You'll be redirected to the main page
2. Scroll to "Book an Amenity" section
3. Select an amenity (e.g., Swimming Pool)
4. Choose a date (today or future)
5. Select a time slot
6. Set number of guests (1-10)
7. Click "Submit Booking"

### 6. Test Conflict Prevention
- Try to book the same amenity at the same time again → Should fail
- Try to book a different amenity at the same time → Should fail (same user)
- Try to login again from another browser → Should fail (session active)

## Key Features to Test

✅ **15 Amenities**: Check all 15 options in dropdown
✅ **Unit Range**: Try registering with unit numbers between 100-6000
✅ **Single Login**: Try logging in twice simultaneously
✅ **Same-User Conflict**: Try booking multiple amenities at same time
✅ **Amenity Conflict**: Try booking same amenity at same time from different users
✅ **Past Date Restriction**: Try booking for yesterday's date
✅ **Guest Limit**: Try entering more than 10 guests
✅ **Admin Access**: Admin link should be hidden from normal users
✅ **Forgot Password**: Reset password for an approved pre-registered user

## Troubleshooting

### "npm is not recognized"
Install Node.js from https://nodejs.org/ and restart Command Prompt.

### "Port already in use"
Another process is using port 3000. Either:
- Close the other process, or
- Change the PORT in `backend/server/server-simple-sqlite.js` (line 7)

### "Cannot find module 'sqlite3'"
Run `npm install` again to ensure all dependencies are installed.

### PowerShell issues
Use Command Prompt instead of PowerShell for npm commands.

### Database not found
Run `npm run init-db` to create the SQLite database.

## File Locations

All files are in: `C:\Users\DELL 7420\community-website-new\`

- Frontend: `frontend/` folder
- Backend: `backend/server/server-simple-sqlite.js`
- Database: `backend/database/society-booking.db`
- Data: `data/` folder
- Dependencies: `node_modules/` (created by npm install)