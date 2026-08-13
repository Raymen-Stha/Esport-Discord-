# SCUR - University Esports & Campus Discord Management System

A full-stack Discord automation suite and administrative web portal built to centralise university campus verification, esports tournament operations, support ticketing, and automated content moderation.
Developed as an academic portfolio project to demonstrate asynchronous JavaScript architecture, RESTful web integration, state management, and real-time Discord API event handling.

---

## 🛠️ Tech Stack & Key Technologies

* **Backend / Runtime:** Node.js, Express.js
* **API Integration:** Discord.js (v14), REST APIs
* **Frontend:** HTML5, CSS3, Vanilla JavaScript
* **Computer Vision / OCR:** Tesseract.js (`eng.traineddata`)
* **State & Data Persistence:** File-based JSON data stores with automated backup routines
* **Authentication:** SMTP-based OTP Email Verification

---

## 💡 Key Engineering & System Highlights

### 🎓 Automated Identity & Role Management
* **OTP Verification Engine:** Built a custom email verification flow (`verify.js`) issuing timed One-Time Passwords (OTPs) to authenticate university email domains.
* **Dynamic Role Mapping:** Automatically assigns campus and student roles based on configuration mappings (`campus_config.json`, `student_campuses.json`).
* **Automated Data Maintenance:** Implemented cleanup scripts (`aluminicleanup.js`) to revoke permissions and transition student roles upon graduation.

### 🏆 Event-Driven Esports Tournament System
* **Stateful Match Operations:** Engineered a custom data management engine (`Tournament/data/`) handling rosters, match schedules, reminders, and tournament brackets.
* **Interactive UI Workflows:** Utilized Discord component listeners (`discordButtons.js`, `discordSelectMenus.js`) for seamless team registration and match reporting inside Discord.
* **Automated Cron Scheduling:** Designed `scheduler.js` and `reminderHandler.js` to automatically dispatch match reminders and tournament summary reports.

### 🌐 Full-Stack Administrative Web Portal
* **RESTful Control Panel:** Developed Express REST API endpoints (`api.js`) connecting the live Discord bot instance to an administrative web interface (`webportal/`).
* **Real-time Monitoring:** Enables real-time visualization of live tournaments, score updates, active voice channels, system health statistics, and audit logs (`stats.js`, `logs.js`).

### 🛡️ Computer Vision & Content Safety
* **OCR Image Scanning:** Integrated Tesseract OCR (`image.js`) to extract and analyze text embedded in uploaded image attachments, preventing unauthorized content sharing.
* **Automated Moderation Filters:** Built modular profanity filters (`bad.js`) and link restrictions (`link.js`).

### 🔊 Dynamic Voice & Support Ticketing
* **Voice Channel Lifecycle:** Event listeners (`jointocreate.js`) dynamically generate temporary voice channels when users join a queue lobby, auto-deleting them when empty (`deletevoice.js`).
* **Support Ticket Engine:** Supports user ticket generation, staff administrative controls, and automated transcript compilation (`transcript.js`).

---

## 📁 Repository Architecture

```text
SCUR/
├── src/
│   ├── announcement/           # Broadcast & embed creation engines
│   │   └── sendannouncement.js
│   ├── moderation/             # Safety systems & OCR image scanning
│   │   ├── bad.js              # Word filter & anti-spam logic
│   │   ├── image.js            # Tesseract OCR text extraction
│   │   ├── link.js             # URL & invite restriction
│   │   └── rrole.js            # Reaction/Button role assignment
│   ├── roles/                  # Role configurations & campus mappers
│   ├── ticketing/              # Ticket handlers & transcript generation
│   ├── Tournament/             # Tournament management engine & API
│   │   ├── data/               # Persistent JSON storage & backups
│   │   ├── templetes/          # Custom embed templates
│   │   ├── api.js              # REST endpoints for web portal
│   │   ├── matchHandler.js     # Match logic & bracket updates
│   │   └── scheduler.js        # Automated match reminders
│   ├── verification/           # Student OTP verification system
│   │   ├── aluminicleanup.js   # Alumni role rotation maintenance
│   │   └── verify.js           # Email verification core logic
│   ├── voice/                  # Dynamic Voice Channel (JTC) engine
│   └── webportal/              # Full-stack admin frontend (HTML/CSS/JS)
├── .env                        # Environment configuration
├── eng.traineddata             # Tesseract OCR language package
├── main.js                     # Application entry point
├── package.json
└── package-lock.json
