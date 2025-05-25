# CareConnect Server

Backend server for the CareConnect healthcare application - a comprehensive API service that powers the connection between patients and doctors through secure appointment management, real-time notifications, and healthcare data management.

**Client Repo** - https://github.com/sahildevil/careconnect

**Live Server** - https://careconnect-server.vercel.app

## 🚀 Features

### 🔐 Authentication & Authorization
- **User Registration**: Separate signup flows for patients and doctors
- **Profile Management**: Complete user profile handling with location services
- **Token Validation**: Secure route protection and session management

### 👨‍⚕️ Doctor Management
- **Doctor Registration**: Comprehensive signup with specialty and qualification verification
- **Profile Management**: Avatar upload, bio, consultation fees, and availability settings
- **Onboarding Flow**: Step-by-step setup process for new doctors
- **Visibility Control**: Manage doctor visibility to patients
- **Location Services**: GPS coordinates for distance calculations

### 🏥 Appointment System
- **Appointment Booking**: Full CRUD operations for appointment management
- **Status Management**: Confirm, reject, and update appointment statuses
- **Conflict Prevention**: Prevent double-booking with slot validation
- **Real-time Updates**: Instant status notifications to both parties
- **Calendar Integration**: Support for external calendar systems

### 🔔 Notification System
- **Push Notifications**: Firebase Cloud Messaging integration
- **Real-time Alerts**: Appointment confirmations, rejections, and reminders
- **Device Management**: Multi-device token registration and cleanup
- **Notification History**: Complete notification tracking and read status

## 🛠️ Technology Stack

### Backend
- **Node.js** - JavaScript runtime environment
- **Express.js** - Web application framework
- **Supabase** - PostgreSQL database with real-time capabilities

### Services
- **Firebase Cloud Messaging** - Push notifications
- **Supabase Storage** - File upload and storage
- **Node-cron** - Automated task scheduling (Future Scope)
- **Multer** - File upload handling

### Development
- **Nodemon** - Development auto-reload
- **dotenv** - Environment configuration
- **CORS** - Cross-origin resource sharing

## 📁 Project Structure

```
careconnect_server/
├── config/
│   └── supabase.js           # Database configuration
├── middleware/
│   └── errorHandler.js       # Global error handling
├── routes/
│   ├── auth.js              # Authentication endpoints
│   ├── doctors.js           # Doctor management
│   ├── appointments.js      # Appointment operations
│   └── notifications.js     # Notification system
├── services/
│   └── reminderService.js   # Automated reminder service
├── uploads/                 # File upload directory
├── .env                     # Environment variables
├── .gitignore              # Git ignore rules
├── index.js                # Server entry point
├── package.json            # Dependencies and scripts
├── vercel.json             # Deployment configuration
└── README.md               # Documentation
```

## 📊 Database Schema

### Key Tables

#### `patients`
```sql
- id (UUID, Primary Key)
- name (VARCHAR, NOT NULL)
- email (VARCHAR, UNIQUE, NOT NULL)
- phone_number (VARCHAR)
- latitude (DECIMAL)
- longitude (DECIMAL)
- created_at (TIMESTAMP)
```

#### `doctors`
```sql
- id (UUID, Primary Key)
- name (VARCHAR, NOT NULL)
- email (VARCHAR, UNIQUE, NOT NULL)
- specialty (VARCHAR, NOT NULL)
- qualification (VARCHAR, NOT NULL)
- experience (INTEGER)
- consultation_fee (INTEGER)
- bio (TEXT)
- avatar_url (VARCHAR)
- is_visible (BOOLEAN)
- onboarding_completed (BOOLEAN)
- latitude (DECIMAL)
- longitude (DECIMAL)
- created_at (TIMESTAMP)
```

#### `appointments`
```sql
- id (UUID, Primary Key)
- patient_id (UUID, Foreign Key)
- doctor_id (UUID, Foreign Key)
- appointment_date (DATE)
- appointment_time (TIME)
- status (VARCHAR: pending/confirmed/rejected/completed)
- notes (TEXT)
- reminder_sent (BOOLEAN)
- created_at (TIMESTAMP)
```

## 🔗 API Endpoints

### Authentication
- `POST /api/auth/register` - Patient registration
- `POST /api/auth/doctor-signup` - Doctor registration
- `POST /api/auth/login` - User login (patient/doctor)
- `POST /api/auth/reset-password` - Password reset
- `POST /api/auth/logout` - User logout
- `POST /api/auth/validate-token` - Token validation
- `PUT /api/auth/update-location` - Update user location

### Doctors
- `GET /api/doctors` - Get all visible doctors
- `GET /api/doctors/:id` - Get specific doctor details
- `POST /api/doctors/complete-onboarding` - Complete doctor setup
- `PUT /api/doctors/profile` - Update doctor profile
- `POST /api/doctors/upload-profile-picture` - Upload doctor avatar
- `GET /api/doctors/onboarding-status/:id` - Check onboarding status

### Appointments
- `POST /api/appointments` - Book new appointment
- `GET /api/appointments/user/:userId` - Get user appointments
- `GET /api/appointments/doctor/:doctorId` - Get doctor appointments
- `GET /api/appointments/:id` - Get appointment details
- `PUT /api/appointments/:id/status` - Update appointment status
- `PUT /api/appointments/:id/approve` - Approve/reject appointment
- `GET /api/appointments/available-slots/:doctorId` - Get available time slots
- `POST /api/appointments/:id/send-reminder` - Send manual reminder

### Notifications
- `GET /api/notifications` - Get user notifications
- `POST /api/notifications/register-device` - Register FCM device token
- `DELETE /api/notifications/unregister-device` - Remove FCM token
- `PUT /api/notifications/:id/read` - Mark notification as read
- `PUT /api/notifications/mark-all-read` - Mark all notifications as read

## 🔄 Automated Services

### Reminder Service
The automated reminder service runs using Node-cron:

```javascript
// Runs every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  await sendAppointmentReminders();
});
```

**Features:**
- Checks for appointments needing 1-hour advance reminders
- Sends push notifications with appointment details
- Includes clinic location and directions
- Prevents duplicate reminders

## 🛡️ Security Features

- **Input Validation**: Comprehensive request validation
- **SQL Injection Prevention**: Parameterized queries via Supabase
- **CORS Configuration**: Proper cross-origin request handling
- **Error Sanitization**: Secure error messages for production
- **Token Management**: Automatic device token cleanup

## 📝 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | ✅ |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | ✅ |
| `FIREBASE_PROJECT_ID` | Firebase project ID | ✅ |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key | ✅ |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email | ✅ |
| `PORT` | Server port number | ❌ (default: 3000) |
| `NODE_ENV` | Environment mode | ❌ (default: development) |

## 🧪 Testing

### API Testing with Postman

1. **Import Collection**: Use the provided Postman collection
2. **Set Environment**: Configure base URL and authentication tokens
3. **Run Tests**: Execute automated test scenarios

### Manual Testing

```bash
# Test authentication
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Test doctor listing
curl -X GET http://localhost:3000/api/doctors \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📊 Monitoring & Health Checks

### Health Endpoint
```bash
GET /health
```

Response:
```json
{
  "status": "OK",
  "message": "CareConnect Server is running",
  "timestamp": "2024-01-XX...",
  "uptime": "2h 30m 15s"
}
```

### Logging
- Request/Response logging
- Error tracking with stack traces
- Performance monitoring
- Database query logging


## 🎯 Future Scope

- [ ] WebSocket integration for real-time updates
- [ ] Advanced notification scheduling
- [ ] API rate limiting implementation
- [ ] Comprehensive logging and monitoring
- [ ] Performance optimization and caching
- [ ] API documentation
- [ ] Unit and integration test coverage
- [ ] Database migration system

## 👥 Authors

- [@sahildevil](https://github.com/sahildevil) - Backend Development
- [@Neelancy1504](https://github.com/Neelancy1504) - API Design & Testing
---

**CareConnect Server** - Powering healthcare connections through robust, secure, and scalable backend services. 🏥💙