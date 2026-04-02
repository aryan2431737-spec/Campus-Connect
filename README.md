# Campus Lost and Found System

This project is a full-stack lost-and-found web application for college users. It lets students create accounts, report lost items, report found items, detect possible matches automatically, notify the affected user, and open a real-time chat between the lost-item user and the found-item user.

The frontend is served directly by the Node.js backend, so running one server starts both the API and the web application.

## One-Click Live Deploy

Use Render Blueprint (included in this repo):

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/aryan2431737-spec/Campus-Connect)

After clicking Deploy, Render reads `render.yaml`, creates the service, provisions a persistent disk, generates `JWT_SECRET`, and deploys automatically.

## Project Flow

1. A user registers or logs in with email or student ID and password.
2. After login, the user opens the dashboard and can report a lost or found item.
3. When a lost item is submitted, the item is stored in the local SQLite database and shown in the user's dashboard.
4. When a found item is submitted, the backend checks existing lost items for possible matches.
5. Matching uses item attributes such as:
- title and description keywords
- category
- location
- uploaded image hash
6. If a match is found:
- the matched lost-item user receives a notification
- a chat session is created automatically
- both users can open the Messages section and chat in real time
7. Users can also update profile photos, browse their own reports, and track match status from the dashboard.

## Main Features

- User registration and login
- JWT-based protected API routes
- Login with email or student ID
- Lost item reporting
- Found item reporting
- Automatic lost/found matching
- Match notifications
- Real-time chat with Socket.IO
- Profile photo upload
- Item image upload
- Dashboard with reports, matches, chats, and notifications
- Local SQL storage with no external database server required

## Tech Stack Used

### Backend

- Node.js
- Express.js
- Socket.IO
- SQLite using Node's built-in `node:sqlite`
- JSON Web Tokens (`jsonwebtoken`)
- `bcrypt` for password hashing
- `multer` for image uploads
- `cors`
- `dotenv`

### Frontend

- HTML5
- CSS3
- Vanilla JavaScript
- Feather Icons

### Storage

- SQLite database file: `backend/data/lostandfound.sqlite`
- Uploaded avatars: `backend/uploads/avatars`
- Uploaded item images: `backend/uploads/items`

## Important Modules

- `backend/server.js`
  Runs the Express server, serves the frontend, mounts the API routes, and handles Socket.IO chat events.

- `backend/data/store.js`
  Contains the SQLite database setup and all main data access logic for users, items, chats, notifications, and reports.

- `backend/routes/auth.js`
  Handles registration, login, and token-based current-user lookup.

- `backend/routes/items.js`
  Handles lost item reports, found item reports, uploads, item listing, automatic matching, notification creation, and chat creation for matched users.

- `backend/routes/chat.js`
  Starts chat sessions, opens existing chats, validates participants, and loads chat data.

- `backend/routes/dashboard.js`
  Builds the dashboard response containing user items, match summary, chat summary, notifications, and stats.

- `backend/routes/profile.js`
  Loads profile information and updates profile details or avatar.

- `backend/utils/matchUtils.js`
  Contains the matching and scoring logic used to compare lost and found items.

## Matching Logic

The project uses a score-based matching approach:

- Exact uploaded image hash match gives the highest score
- Same category increases the score
- Same location increases the score
- Shared title, description, and location keywords increase the score

Only candidates with a positive score are returned as potential matches, and the strongest matches are shown first.

## API Overview

### Authentication

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Profile

- `GET /api/profile`
- `PUT /api/profile/edit`

### Items

- `GET /api/items`
- `GET /api/items/:id`
- `POST /api/items/lost`
- `POST /api/items/found`
- `POST /api/items/upload`
- `PUT /api/items/:id`
- `DELETE /api/items/:id`

### Chat

- `POST /api/chat/start`
- `GET /api/chat/:matchId`
- `GET /api/chat/user/:userId`

### Dashboard and Notifications

- `GET /api/dashboard`
- `GET /api/notifications`
- `PUT /api/notifications/read`
- `GET /api/reports`
- `GET /api/health`

## Folder Structure

```text
lost and found website/
|-- backend/
|   |-- config/
|   |-- data/
|   |-- frontend/
|   |-- middleware/
|   |-- routes/
|   |-- uploads/
|   |-- utils/
|   |-- .env.example
|   |-- package.json
|   `-- server.js
`-- README.md
```

## Setup and Run

1. Open terminal in the `backend` folder.
2. Install dependencies:

```bash
npm install
```

3. Copy `.env.example` to `.env` and set values:

```env
SQLITE_PATH=./data/lostandfound.sqlite
PORT=5000
JWT_SECRET=your_super_secret_jwt_key
UPLOADS_DIR=./uploads
```

4. Start the server:

```bash
npm start
```

5. Open the app in your browser:

```text
http://localhost:5000/
```

Useful pages:

- `/`
- `/auth.html`
- `/dashboard.html`
- `/main%20app.html`
- `/api/health`

## Notes

- This version uses SQLite instead of MongoDB.
- The frontend and backend are served from the same local server.
- Real-time chat requires a valid JWT token because the Socket.IO connection is authenticated.
- Image uploads are limited to 5 MB and allow JPG, PNG, WEBP, and GIF files.
