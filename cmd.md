# Uzhavan AI / AgriVelan Terminal Commands & Troubleshooting

## 1. Install Project Dependencies & Start Frontend
Run `npm install` first to install `vite` and `tsc`:

```bash
cd "/home/gopikrishna/Documents/uzhavan bazzzar"
npm install
npm run dev
```
> App URL: **`http://localhost:5173`**

---

## 2. Backend Server (FastAPI)
If you get `Address already in use` on port 8000, kill the existing process first:

```bash
# Free up port 8000 if already in use
fuser -k 8000/tcp

# Start Backend
cd "/home/gopikrishna/Documents/uzhavan ai/backend"
uvicorn main:app --reload --port 8000
```
> API Docs URL: **`http://localhost:8000/docs`**

---

## Key Command Differences
- **`npm install`**: Installs `node_modules` dependencies for a JavaScript project (Use this!).
- **`install npm`**: Linux coreutils file copy command (Do not use!).
