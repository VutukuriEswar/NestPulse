# NestPulse — location-only MVP (Android + Windows)

Self-hosted family live-location. When a device is online it shares GPS;
family members see each other on a live map.

## Run the backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
copy .env.example .env       # then set JWT_SECRET_KEY
python server.py
```

API at `http://localhost:5000`. Storage is local JSON files in `backend/data/`
— no database setup. Endpoints are auth + families + devices + location only.

## Run the app

```bash
cd frontend
npm install
npm run start:mobile   # Android via Expo Go / dev build
npm start              # Windows: Expo + Electron tray app
```

Android needs location permissions (foreground + background).
Windows tray app keeps sharing every 15s even when hidden to tray.

Configure API URL with `EXPO_PUBLIC_API_URL`
(Android emulator default `http://10.0.2.2:5000`, web/Windows `http://localhost:5000`).

## First use

1. Register / log in.
2. In **Families**, create a family or join with an invite code.
3. Tap **Register this device** and give it a name — sharing starts
   immediately and retries whenever internet returns.
4. Open **Map** to see live family locations (green = online <5 min,
   otherwise last-seen time).
