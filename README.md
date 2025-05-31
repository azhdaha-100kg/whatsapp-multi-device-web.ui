# Multi-Device WhatsApp Web UI (Dockerized)

A web application to interact with multiple WhatsApp accounts simultaneously, built with a Node.js backend (using `whatsapp-web.js`) and a Vue.js frontend. This version is configured for easy deployment using Docker, where the backend serves the frontend application.

<div align="center" style="display: flex; justify-content: center; gap: 20px; align-items: center; flex-wrap: wrap;">
  <img src="https://raw.githubusercontent.com/azhdaha-100kg/wwebjs-webui/main/Login.png" alt="Login Screen" width="400" style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px; margin: 5px;" />
  <img src="https://raw.githubusercontent.com/azhdaha-100kg/wwebjs-webui/main/Dashboard.png" alt="Dashboard Screen" width="400" style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px; margin: 5px;" />
</div>

---

## Table of Contents

- [Features Overview](#features-overview)
- [Core Technologies](#core-technologies)
- [Prerequisites](#prerequisites)
- [Quick Start with Docker](#quick-start-with-docker)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Configure Environment Variables](#2-configure-environment-variables)
  - [3. Build and Run with Docker Compose](#3-build-and-run-with-docker-compose)
  - [4. Accessing the Application](#4-accessing-the-application)
- [Managing Users](#managing-users)
- [Persistent Data](#persistent-data)
- [Troubleshooting Docker Setup](#troubleshooting-docker-setup)
- [Further Enhancements (Optional)](#further-enhancements-optional)

---

## Features Overview

- **User Authentication**: Secure login with username/password, JWT-based session management.
- **Protected Routes**: Dashboard and features accessible only after login.
- **Multi-Device Session Management**: Add, List, Select, QR Auth, Remove WhatsApp sessions.
- **Real-time Updates via Socket.IO** (Authenticated connections).
- **User Actions per Session**:
    - Send Text Messages (with WhatsApp number validation).
    - Send Images/Videos (via file upload or direct URL).
    - Send Locations.
    - Get Contact Information.
    - Set User Status (About/Bio).
    - Bulk Send Messages.
    - **New:** Bulk Check WhatsApp Numbers (with real-time log updates and stop functionality).
- **Theming**: Light and Dark mode.
- **Responsive UI**: Tailwind CSS.
- **Frontend Routing**: Vue Router.
- **State Management**: Pinia.

---

## Core Technologies

- **Backend**: Node.js, Express, `whatsapp-web.js`, Socket.IO, `jsonwebtoken`, `bcryptjs`, `dotenv`
- **Frontend**: Vue 3 (Composition API), Vite, Pinia, Vue Router, Tailwind CSS
- **Containerization**: Docker, Docker Compose
- **Language**: JavaScript

---

## Prerequisites

- **Git**: For cloning the repository.
- **Docker**: Install Docker Desktop (for Windows/Mac) or Docker Engine (for Linux).
- **Docker Compose**: Usually included with Docker Desktop. For Linux, you might need to install it separately if it's not part of your Docker Engine installation.

---

## Quick Start with Docker

This setup uses Docker to run the application. The backend will serve the frontend, simplifying deployment.

### 1. Clone the Repository

```bash
git clone https://github.com/azhdaha-100kg/wwebjs-webui.git
cd wwebjs-webui
```
If you are working on the `docker_setup` branch or another specific branch, make sure to check it out:

```bash
git checkout docker_setup
```

### 2. Configure Environment Variables

The application uses an `.env` file in the project root to manage essential configurations for the Docker container.

Create the `.env` file:
- Copy the example file (if you have one named `.env.example`) or create a new file named `.env` in the root of the `wwebjs-webui` project.

```bash
cp .env.example .env
```
*(If you don't have `.env.example`, create `.env` manually with the content below).*

Edit the `.env` file with your settings:

```env
# .env

# Application Configuration
NODE_ENV=production
PORT=3000 # Port INSIDE the container. APP_HOST_PORT (below) maps to this.

# Security: REPLACE THESE WITH YOUR OWN STRONG, UNIQUE VALUES
JWT_SECRET=your_very_strong_and_unique_jwt_secret_key_here_at_least_32_characters
ADMIN_PASSWORD=a_very_secure_admin_password_for_the_admin_user
USER1_PASSWORD=a_very_secure_password_for_user1
USER2_PASSWORD=a_very_secure_password_for_user2
# Add more USERX_PASSWORD variables as needed, and update server.js user array

# CORS_ORIGIN: The URL your browser uses to access this application.
# If APP_HOST_PORT (below) is 3000, then CORS_ORIGIN is http://localhost:3000
# If accessing via IP: CORS_ORIGIN=http://YOUR_SERVER_IP:3000
# For multiple origins, use a comma-separated list: http://localhost:3000,http://192.168.1.10:3000
CORS_ORIGIN=http://localhost:3000

# Host Port Mapping (Optional - if you want to change the default 3000 on your host machine)
# This is the port you will use in your browser to access the app.
APP_HOST_PORT=3000
```

**Important:**
- Replace placeholder values for `JWT_SECRET` and passwords with your actual strong secrets.
- Adjust `CORS_ORIGIN` based on how you will access the application from your browser (e.g., `http://localhost:3000` if running Docker locally and using port 3000, or `http://YOUR_SERVER_IP:3000` if accessing via IP).
- Ensure this `.env` file is listed in your `.gitignore` file to prevent committing secrets. Commit an `.env.example` file instead, with placeholder values.

### 3. Build and Run with Docker Compose

Navigate to the root directory of the project (where `docker-compose.yml` is located) in your terminal.

To build the images and start the application:

```bash
docker-compose up --build
```

- The `--build` flag ensures Docker rebuilds the image if there are changes to the Dockerfile or application code.
- The first build might take some time as it downloads Node.js images, system dependencies, and Chromium for Puppeteer.

To run in detached mode (in the background):

```bash
docker-compose up --build -d
```

### 4. Accessing the Application

Once the containers are running:

- Open your web browser.
- Navigate to the URL defined by your `CORS_ORIGIN` and `APP_HOST_PORT` in the `.env` file.
  - Example: [http://localhost:3000](http://localhost:3000) (if `APP_HOST_PORT` is 3000 and you are on the same machine as Docker).
  - Example: [http://YOUR_SERVER_IP:3000](http://YOUR_SERVER_IP:3000) (if accessing a remote Docker host).
- You should see the login page. Use the credentials (e.g., `admin` and the `ADMIN_PASSWORD` you set) to log in.

---

## Managing Users

User management is currently handled by editing the users array directly in `backend/server.js` and setting corresponding `USERX_PASSWORD` environment variables in your `.env` file.

Edit `backend/server.js`: Locate the users array and add or modify user objects. Remember to hash passwords if you were doing it manually, though the current setup hashes passwords from the environment variables at startup.

```js
// Example user entry in backend/server.js
// const users = [
//     { id: 1, username: 'admin', passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'adminpassword', 10) },
//     { id: 2, username: 'User1', passwordHash: bcrypt.hashSync(process.env.USER1_PASSWORD || 'user1password', 10) },
//     // Add new users here
// ];
```

- **Update `.env`**: Add new `USERX_PASSWORD` variables for any new users.
- **Rebuild and Restart Docker Container**:

```bash
docker-compose up --build --force-recreate
```

Or, if you only changed `.env` and `server.js` doesn't require a full rebuild beyond dependency installation:

```bash
docker-compose restart app
```
*(A full rebuild is safer if unsure).*

---

## Persistent Data

WhatsApp session data (authentication tokens, QR codes, etc.) is stored in a Docker named volume called `.wwebjs_auth_data`. This ensures your WhatsApp sessions persist even if you stop and restart the Docker container.

- To view Docker volumes: `docker volume ls`
- To remove the volume (e.g., to start fresh with all sessions):

```bash
docker-compose down -v
```
**Warning:** This will delete all current WhatsApp session data.

---

## Troubleshooting Docker Setup

- **"Could not find expected browser (chrome) locally" error during runtime:**
  - Ensure your root Dockerfile is up-to-date with the version that installs chromium via `apt-get` and sets `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` and `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`.
  - Perform a clean build: `docker-compose up --build --no-cache`.

- **CORS Errors in Browser Console:**
  - Double-check the `CORS_ORIGIN` value in your `.env` file. It must exactly match the URL your browser uses to access the application (including http:// and the port).
  - Restart the Docker container after changing `.env`.

- **Other Errors:**
  - Check container logs: `docker-compose logs -f app`
  - Ensure all necessary files are being copied correctly in the Dockerfile.

---

## Further Enhancements (Optional)

- Database for User Management instead of hardcoding in `server.js`.
- More granular logging.
- Integration with a reverse proxy like Nginx or Traefik for easier SSL (HTTPS) setup and custom domain mapping if deploying publicly.

---

**Key changes from your previous README:**

- **Focus on Docker:** The primary setup and deployment method described is now Docker-based.
- **Simplified Prerequisites:** Only Git and Docker/Docker Compose are listed. Node.js/npm are needed for local development *if not using Docker*, but for a Docker-first approach, users only need Docker.
- **Combined Setup:** Explains that the backend serves the frontend within the Docker setup.
- **Environment Variables:** Emphasizes the use of the root `.env` file for configuration.
- **Updated Feature List:** Includes the new "Bulk Check WhatsApp Numbers" feature.
- **Removed Nginx/PM2 Deployment Section:** The Docker Compose setup replaces the manual Nginx/PM2 deployment for a simpler, containerized approach. If you want to keep the Nginx/PM2 instructions for non-Docker users, you can add them back in a separate section or an "Advanced Deployment" section.

---

This new README should give users a much clearer and simpler path to getting your application running using Docker. Remember to create an `.env.example` file (with placeholder values for secrets) and add your actual `.env` file to `.gitignore`.
