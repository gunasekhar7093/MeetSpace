# MeetSpace — Video Conferencing Platform

MeetSpace is a full-stack video conferencing application inspired by Google Meet, featuring LiveKit SFU media streaming, Socket.IO real-time signaling, meeting management, screen sharing, and meeting recording.

---

## 🛠️ Tech Stack & Architecture

- **Frontend**: React (v18), Vite, React Router v6, Axios, Lucide Icons, LiveKit Client SDK (`livekit-client`).
- **Backend**: Node.js, Express, MongoDB (Mongoose), JWT Auth (Access + HttpOnly Rotating Refresh Tokens), Socket.IO.
- **Media Engine**: LiveKit SFU (Selective Forwarding Unit) on port `7880`.
- **Recording**: LiveKit Egress with server-side composite recording, HTTP 206 range streaming, and MP4 downloads.

---

## 📋 Prerequisites

Ensure you have the following installed on your machine:
1. **Node.js** (v18 or higher) — [Download Node.js](https://nodejs.org/)
2. **MongoDB** (v6+ or MongoDB Atlas) — Local service running on `mongodb://127.0.0.1:27017` or Atlas connection string.
3. **LiveKit Server** — Binary included at `backend/bin/livekit-server.exe` (or install via `winget install livekit`).

---

## 🚀 How to Run MeetSpace (Step-by-Step)

MeetSpace requires 4 lightweight processes running during local development:

### Step 1: Start MongoDB
If MongoDB is installed as a Windows Service, it is likely already running. To run it manually:
```powershell
& "C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe" --dbpath "backend\data\db" --port 27017
```
*(Or use your MongoDB Compass / Atlas connection string in `backend/.env`)*

---

### Step 2: Start LiveKit SFU Media Server
Open a terminal and run the included LiveKit server executable in development mode:
```powershell
cd backend
npm run livekit
```
> The LiveKit server will start listening at `ws://127.0.0.1:7880` with default key `devkey` and secret `secret`.

---

### Step 3: Start the Backend API & Socket Server
Open a second terminal:
```powershell
cd backend
npm install
npm run dev
```
> The backend server will start at **`http://localhost:5000`** with database connection and Socket.IO active.

---

### Step 4: Start the Frontend Client
Open a third terminal:
```powershell
cd MeetSpace
npm install
npm run dev
```
> The Vite dev server will start at **`http://localhost:5173`**. Open this URL in your web browser!

---

## 🔑 Environment Configuration

Both the frontend and backend come preconfigured with `.env` files for local development:

### Backend (`backend/.env`)
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/meetspace_dev
JWT_ACCESS_SECRET=meetspace-dev-access-jwt-secret-phase4-2026
JWT_REFRESH_SECRET=meetspace-dev-refresh-jwt-secret-phase4-2026
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:5173
LIVEKIT_URL=ws://127.0.0.1:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
MOCK_EGRESS=true
RECORDINGS_DIR=./recordings
EGRESS_STORAGE_TYPE=local
```

### Frontend (`MeetSpace/.env`)
```env
VITE_API_BASE_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
VITE_STUN_SERVER_URL=stun:stun.l.google.com:19302
```

---

## 🧪 Testing & Verification

- **Run all 100 backend automated tests across 7 test suites**:
  ```powershell
  npm --prefix backend test
  ```
- **Run frontend linting**:
  ```powershell
  npm --prefix MeetSpace run lint
  ```
- **Run production frontend build**:
  ```powershell
  npm --prefix MeetSpace run build
  ```

