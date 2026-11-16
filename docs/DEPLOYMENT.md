# MeetSpace — Cloud Production Deployment Guide

This guide details the deployment architecture, configuration requirements, security settings, and step-by-step procedures for deploying **MeetSpace** using modern cloud services:
- **Frontend**: [Vercel](https://vercel.com/) (React + Vite Single Page Application)
- **Backend**: [Render](https://render.com/) (Native Node.js Web Service)
- **Database**: [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (Managed Cloud Database)
- **Media Engine**: [LiveKit Cloud](https://livekit.io/cloud) (Managed WebRTC Selective Forwarding Unit)
- **Recordings Storage**: Cloud Object Storage (AWS S3 or Cloudflare R2)

---

## 1. Cloud Architecture Topology

```mermaid
flowchart TD
    Client["User Browser (WebRTC / Audio / Video / Screen)"]

    subgraph CDN["Edge & Frontend (Vercel)"]
        Client -->|HTTPS (Static Bundle)| Vercel["MeetSpace React Client (*.vercel.app)"]
    end

    subgraph CloudBackend["API & Signaling (Render)"]
        Client -->|REST API & /socket.io| RenderAPI["MeetSpace Express API (*.onrender.com)"]
        RenderAPI -->|Mongoose TLS| Atlas[("MongoDB Atlas Database")]
    end

    subgraph ManagedMedia["Media & WebRTC (LiveKit Cloud)"]
        Client -->|WebRTC RTP / UDP Audio & Video| LKCloud["LiveKit Cloud SFU (wss://*.livekit.cloud)"]
        RenderAPI -->|Token Generation & Egress REST API| LKCloud
        LKCloud -->|HMAC Lifecycle Webhooks| RenderAPI
    end

    subgraph ObjectStorage["Recording Media Storage"]
        LKCloud -->|Direct MP4 Composite Upload| S3Storage[("Cloudflare R2 / AWS S3")]
        RenderAPI -->|Stream / Download Playback| S3Storage
    end
```

---

## 2. Platform Requirements & Configuration

### A. Frontend: Vercel

| Setting | Value | Notes |
| :--- | :--- | :--- |
| **Framework Preset** | `Vite` | Auto-detected |
| **Root Directory** | `MeetSpace` | Must be pointed to the frontend subfolder |
| **Build Command** | `npm run build` | Bundles with Vite chunk splitting |
| **Output Directory** | `dist` | Generated static bundle |
| **Install Command** | `npm install` | Clean production dependency install |

#### Frontend Environment Variables (Vercel Dashboard)
- `VITE_API_BASE_URL`: URL to your Render backend API (e.g. `https://<service-name>.onrender.com/api`).
- `VITE_SOCKET_URL`: URL to your Render backend origin (e.g. `https://<service-name>.onrender.com`).
- `VITE_STUN_SERVER_URL`: `stun:stun.l.google.com:19302`

---

### B. Backend: Render

| Setting | Value | Notes |
| :--- | :--- | :--- |
| **Service Type** | **Web Service** | Do *not* select Static Site or Background Worker |
| **Runtime** | `Node` | Native Node.js execution (no Docker required) |
| **Root Directory** | `backend` | Must be pointed to the backend subfolder |
| **Build Command** | `npm install` (or `npm ci --omit=dev`) | Installs backend dependencies |
| **Start Command** | `npm start` | Runs `node src/server.js` |
| **Health Check Path**| `/api/health` | Render verifies this endpoint during deployment |

#### Backend Environment Variables (Render Dashboard)
- `NODE_ENV`: `production`
- `PORT`: (Auto-assigned by Render, defaults to 10000)
- `FRONTEND_URL`: Canonical Vercel domain without trailing slash (e.g. `https://<your-project>.vercel.app`).
- `MONGODB_URI`: Secure MongoDB Atlas connection URI with TLS enabled.
- `JWT_ACCESS_SECRET`: Cryptographically random 64-character string (at least 32 characters).
- `JWT_REFRESH_SECRET`: Cryptographically random 64-character string (distinct from access secret).
- `JWT_ACCESS_EXPIRES_IN`: `15m`
- `JWT_REFRESH_EXPIRES_IN`: `7d`
- `LIVEKIT_URL`: LiveKit Cloud WebSocket URL (`wss://<project-subdomain>.livekit.cloud`).
- `LIVEKIT_API_KEY`: API Key from LiveKit Cloud dashboard.
- `LIVEKIT_API_SECRET`: API Secret from LiveKit Cloud dashboard.
- `MOCK_EGRESS`: `false` (mock egress is rejected at startup in production mode).
- `EGRESS_STORAGE_TYPE`: `s3` (for cloud storage) or `local`.
- `EGRESS_S3_KEY`: S3 / R2 Access Key ID.
- `EGRESS_S3_SECRET`: S3 / R2 Secret Access Key.
- `EGRESS_S3_BUCKET`: Recording bucket name.
- `EGRESS_S3_REGION`: Storage region (e.g., `us-east-1` or `auto` for Cloudflare R2).
- `EGRESS_S3_ENDPOINT`: (Optional) Custom S3 endpoint for Cloudflare R2 or MinIO.

---

### C. Database: MongoDB Atlas
- **Tier**: M0 Free Sandbox (or M10+ dedicated cluster for high production traffic).
- **Network Access**: Add `0.0.0.0/0` ("Allow Access from Anywhere") because Render Web Services use dynamic outbound IP addresses.
- **Connection URI Format**:
  ```text
  mongodb+srv://<username>:<password>@<cluster>.mongodb.net/meetspace_prod?retryWrites=true&w=majority
  ```

---

### D. Media Engine: LiveKit Cloud
- **Project Setup**: Create a free project at [livekit.io/cloud](https://livekit.io/cloud).
- **Edge Routing & TURN**: LiveKit Cloud automatically provisions global edge nodes, TURN servers, UDP port 7882, and TCP fallback port 7881. No firewall or NAT configuration is required.
- **Webhooks**: Register your Render backend webhook URL in the LiveKit Cloud dashboard:
  ```text
  https://<service-name>.onrender.com/api/livekit/webhooks
  ```

---

## 3. Step-by-Step Deployment Walkthrough

### Step 1: MongoDB Atlas Setup
1. Log in to [MongoDB Atlas](https://cloud.mongodb.com/) and create a cluster.
2. In **Database Access**, create a user with `readWrite` permissions.
3. In **Network Access**, add `0.0.0.0/0`.
4. Copy your SRV connection string for use in Step 3.

### Step 2: LiveKit Cloud Setup
1. Log in to [LiveKit Cloud](https://cloud.livekit.io/) and create a new project.
2. In Project Settings, copy:
   - WebSocket URL (`wss://...livekit.cloud`)
   - API Key
   - API Secret

### Step 3: Render Backend Deployment
1. Log in to [Render](https://dashboard.render.com/) and click **New + -> Web Service**.
2. Connect your GitHub repository (`gunasekhar7093/MeetSpace`).
3. Configure the service settings:
   - **Name**: `meetspace-backend`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. In the **Environment Variables** section, add all backend variables listed in Section 2B.
5. In **Advanced Settings**, set **Health Check Path** to `/api/health`.
6. Click **Create Web Service** and wait for the initial build to complete. Note your assigned URL (`https://<service-name>.onrender.com`).

### Step 4: Configure LiveKit Webhooks
1. Return to the LiveKit Cloud dashboard -> **Settings -> Webhooks**.
2. Add a new webhook destination:
   ```text
   https://<service-name>.onrender.com/api/livekit/webhooks
   ```
3. Save the webhook configuration.

### Step 5: Vercel Frontend Deployment
1. Log in to [Vercel](https://vercel.com/) and click **Add New... -> Project**.
2. Import the `gunasekhar7093/MeetSpace` repository.
3. In Project Settings:
   - **Root Directory**: Set to `MeetSpace`.
   - **Framework Preset**: `Vite`.
4. In **Environment Variables**, add:
   - `VITE_API_BASE_URL`: `https://<service-name>.onrender.com/api`
   - `VITE_SOCKET_URL`: `https://<service-name>.onrender.com`
   - `VITE_STUN_SERVER_URL`: `stun:stun.l.google.com:19302`
5. Click **Deploy**. Note your assigned frontend URL (`https://<project-name>.vercel.app`).

### Step 6: CORS & Cookie Synchronization
1. Return to the Render dashboard -> `meetspace-backend` -> **Environment**.
2. Update `FRONTEND_URL` to your exact Vercel production URL:
   ```text
   FRONTEND_URL=https://<project-name>.vercel.app
   ```
3. Save changes. Render will automatically redeploy the service with the updated CORS origin policy.

---

## 4. Health Probes & Monitoring

MeetSpace provides built-in endpoints for service uptime monitoring:
- **Comprehensive Health Check**: `GET /api/health`
  - Returns service status, uptime, and database connection state.
- **Process Liveness Probe**: `GET /api/health/live`
  - Returns HTTP 200 as long as the Express process is active.
- **Database Readiness Probe**: `GET /api/health/ready`
  - Returns HTTP 200 when MongoDB is connected; returns HTTP 503 if disconnected.
