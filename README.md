# VibePass - Enterprise Ticketing System

VibePass is a modern, high-performance web application designed for booking event tickets. It features true real-time concurrency control, responsive glassmorphism UI, and robust backend caching.

## 🚀 Key Features

### 1. True Real-Time Concurrency (Optimistic UI & WebSockets)
- **Zero-Latency Interactions:** Employs Optimistic UI updates. When you click a seat, it highlights instantly while silently locking it via the backend.
- **WebSocket Synchronization:** If another user locks a seat, the server broadcasts an ultra-fast, targeted patch. Your browser directly updates the specific seat's CSS without re-fetching the entire map.
- **Conflict Prevention:** Strict database-level uniqueness and race-condition handlers ensure a single seat cannot be snatched by two users simultaneously.

### 2. 5-Minute Seat Lock & Expiration
- Users can click up to **10 seats** to hold them exclusively.
- Locks are enforced by the server and broadcast to all connected clients.
- **Auto-Expiration:** A background worker intelligently purges locks older than 5 minutes, freeing up hoarded seats automatically.

### 3. High-Performance Architecture
- **Redis Caching:** The `/api/events` endpoint is heavily cached using Redis. Database queries are bypassed when loading the homepage, resulting in massive performance gains. Cache invalidation automatically fires upon seat booking or cancellation.
- **Smart DOM Patching:** Live seat updates avoid costly React-style full-tree renders or full HTTP refetches by surgically targeting `data-id` DOM elements.

### 4. Premium Aesthetic & UI/UX
- **Glassmorphism Design:** Uses sleek translucent cards, dynamic gradients, and modern micro-animations.
- **Responsive Layout:** The application is completely fluid. Mobile users get intuitive bottom-navbar navigation, and the complex seat-matrix gracefully enables horizontal swiping without breaking page bounds.

### 5. Smart Geolocation Integration
- One-click "Use Current Location" seamlessly leverages the Browser Geolocation API.
- Reversely geocodes coordinates via Nominatim API to instantly filter the dashboard to the user's city.

## 🛠️ Technology Stack
- **Frontend:** HTML5, Vanilla JavaScript, CSS3 (Custom Design System), Bootstrap 5 (Grids & Modals)
- **Backend:** Node.js, Express.js
- **Database:** MongoDB (Mongoose ORM)
- **Cache:** Redis
- **Real-Time:** Socket.io

## 📦 Local Installation

### Prerequisites
Make sure you have Node.js, MongoDB, and Redis installed and running on your system.

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/MoharXD/ticketing-system---project.git
   cd ticketing-system---project
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory:
   ```env
   PORT=3000
   MONGODB_URI=mongodb://127.0.0.1:27017/ticketingDB
   SESSION_SECRET=your_super_secret_key_here
   REDIS_URL=redis://127.0.0.1:6379
   ```

4. Start the application:
   ```bash
   node server.js
   ```
   *The server will start on `http://localhost:3000`.*

## 🧪 Admin Dashboard
To access the admin dashboard to create and manage events:
1. Sign up for a normal account.
2. In your MongoDB database, update your User document: set `isAdmin: true`.
3. An "Admin Panel" link will securely appear in your profile dropdown.

## 📄 License
This project is open-source and available under the MIT License.
