<div align="center">
  
  # <img src="public/favicon.svg" width="40" alt="Icon" /> VibePass
  
  **A High-Performance, Real-Time Event Ticketing Engine**

  <p>
    <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="NodeJS" /></a>
    <a href="https://expressjs.com/"><img src="https://img.shields.io/badge/Express.js-404D59?style=for-the-badge" alt="ExpressJS" /></a>
    <a href="https://www.mongodb.com/"><img src="https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" /></a>
    <a href="https://redis.io/"><img src="https://img.shields.io/badge/Redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" /></a>
    <a href="https://socket.io/"><img src="https://img.shields.io/badge/Socket.io-black?style=for-the-badge&logo=socket.io&badgeColor=010101" alt="Socket.io" /></a>
  </p>

  > 🎓 **Academic Project:** Developed as part of the Semester 4 Web Technology Course.

</div>

<br />

## 📖 About The Project

VibePass is a scalable, full-stack Single Page Application (SPA) designed to handle high-concurrency event bookings. Architected to eliminate race conditions, the platform features bi-directional live seat synchronization, in-memory caching for high-traffic resiliency, dynamic time-slot routing, and a secure, data-driven admin CMS.

Whether managing a massive stadium concert or a local cinema chain, VibePass ensures a seamless, crash-resilient experience for both administrators and end-users.

---

## ⚡ Core Features

- 🔴 **True Real-Time Concurrency** – Powered by Socket.io and Optimistic UI. When you click a seat, it highlights instantly while silently locking it via the backend. If another user locks a seat, the server broadcasts an ultra-fast, targeted DOM patch to all global clients without full network polling.
- ⏱️ **5-Minute Seat Locking & Expiration** – Users can temporarily lock up to 10 seats. A background process intelligently purges locks older than 5 minutes to prevent seat hoarding.
- 🛡️ **ACID-Compliant Protection** – Utilizes MongoDB atomic `$inc` operators and strict compound indexing (`eventId + seatId + bookingDate + timeSlot`) to prevent millisecond race conditions.
- 🚀 **Redis Caching** – High-traffic event feeds are served from memory to drastically reduce database load. Cache invalidation automatically fires upon seat booking or cancellation.
- 🇮🇳 **Live OpenStreetMap Integration** – Integrates Nominatim API and Browser Geolocation for instantaneous, precise city search suggestions and automatic dashboard filtering.
- 🎥 **Intelligent Cinema Routing** – Identical movie screenings across different venues are programmatically merged into an enterprise-grade nested selection flow (similar to BookMyShow).
- 💺 **Symmetrical Seat Matrix Engine** – A mathematically precise flexbox engine that detects short rows and perfectly centers them with invisible placeholders for a flawless auditorium layout.
- 📱 **Premium Glassmorphism & Responsive Design** – Features a dynamic glassmorphic bottom navigation dock, sleek translucent cards, and a fully adaptive seat matrix ensuring a flawless experience on mobile devices.
- 🎟️ **Dynamic Passes & PDFs** – Client-side QR generation (`qrcodejs`) and customized perforated stub PDFs (`jsPDF`) offset heavy backend document rendering.
- 🔢 **Animated Checkout Pricing** – The Order Summary features a custom JavaScript easing function that smoothly counts up/down dynamically as users add or remove seats, mimicking premium Native App experiences.
- 🧹 **Optimistic Seat Clearing** – A prominent "Clear All" action immediately purges the local UI selection state while silently firing off a robust array of parallel backend requests to instantly release the server-side locks.

---

## 💻 Tech Stack

| Domain | Technologies |
| :--- | :--- |
| **Frontend** | HTML5, CSS3 (Glassmorphism, CSS Variables), Vanilla JS, Bootstrap 5 |
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB Atlas (Mongoose ODM with `.lean()` optimization) |
| **Caching** | Redis (In-Memory Data Store) |
| **Real-Time**| Socket.io (WebSockets) |
| **Security** | `bcryptjs` (Hashing), `express-session` (MongoStore), `dotenv`, `express-mongo-sanitize` (NoSQL Injection Prevention) |

---

## 🚀 Getting Started

Follow these steps to set up the project locally.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [MongoDB Atlas](https://www.mongodb.com/atlas/database) URI
- *Optional:* A local/cloud Redis instance

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/MoharXD/ticketing-system---project.git
   cd ticketing-system---project
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   MONGODB_URI=your_mongodb_connection_string
   SESSION_SECRET=your_super_secret_key
   ADMIN_SECRET=admin123
   REDIS_URL=redis://127.0.0.1:6379  # Optional: Safely falls back to DB if missing
   ```

4. **Run the Application**
   ```bash
   # Development mode with hot-reloading
   npm run dev

   # Production mode
   npm start
   ```
   > The server will start on `http://localhost:3000`

---

## 🏗️ System Architecture Highlights

* **SPA-like Vanilla Routing:** Robust state management and event delegation (`e.target.closest()`) seamlessly transition views without the overhead of heavy virtual DOM frameworks.
* **Cascading Removals:** Deleting a user via the CMS initiates a recursive operation that hunts down their tickets, recalculates total revenue, and releases the seats back to the live public grid.
* **Aggressive Cache Busting:** Utilizes timestamp-appended endpoints (`?t=...`) for volatile API fetches and hardcoded versioning on static assets to forcibly bypass stale disk caches.
* **Process-Level Error Bounds:** Implements global `uncaughtException` and `unhandledRejection` guards to ensure transient cloud-database timeouts do not crash the Node.js event loop on strict deployment platforms (e.g., Render).

---

## 📂 Project Structure

```text
ticketing-system/
├── models/             # Mongoose Schemas (User, Event, Seat)
├── public/             
│   ├── css/            # Design System (style.css)
│   ├── js/             # Client-side Logic (app.js, admin.js)
│   ├── index.html      # Main SPA Interface
│   ├── admin-login.html# Admin Authentication Portal
│   └── admin.html      # Secure CMS Dashboard
├── .env                # Environment Configurations
├── server.js           # Express API & WebSocket Initialization
└── package.json        # Dependencies & Scripts
```

---

<div align="center">
  <b>Developed by Mohar Gorai</b><br>
  <i>B.Tech Information Technology | Vellore Institute of Technology (VIT)</i>
</div>
