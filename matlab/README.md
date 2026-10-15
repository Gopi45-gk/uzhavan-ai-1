# Uzhavan AI (உழவன் AI) — MATLAB Integration Suite

Run the full Uzhavan AI frontend inside **MATLAB Desktop** using native MATLAB figures and components.

The UI/UX, styling, animations, screens, and FastAPI backend architecture remain **100% identical and unchanged**.

---

## 🌟 How It Works Under the Hood

Starting with MATLAB R2019b, MathWorks integrated the Chromium Embedded Framework (CEF) directly into MATLAB figures via the `uihtml` component.

```
┌─────────────────────────────────────────────────────────────┐
│                    MATLAB Desktop Window                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 🌾 Uzhavan AI Toolbar [● Backend Connected] [🔄] [🌐] │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │                                                       │  │
│  │   Embedded Chromium CEF Engine (`uihtml`)             │  │
│  │   • Full React 18 SPA Frontend                        │  │
│  │   • Voice Assistant (PhoneCall.tsx)                   │  │
│  │   • Multilingual Chat (Tamil, Telugu, Kannada, etc.)  │  │
│  │   • Disease Detection (Canvas Vision)                 │  │
│  │   • Weather Forecast & Agmarknet Mandi Prices         │  │
│  │                                                       │  │
│  └──────────────────────────┬────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              │ REST / WebSockets
                              ▼
               ┌──────────────────────────────┐
               │    FastAPI Backend Server    │
               │    (http://localhost:8000)   │
               │  • Piper ONNX Tamil Voice    │
               │  • NVIDIA NIM / Groq / Gemini│
               │  • 24-Crop Offline RAG       │
               └──────────────────────────────┘
```

1. **Native MATLAB Window**: `uzhavan_ai_app.m` creates a tailored `uifigure` styled to match the Uzhavan AI theme (`#f1f8f3` and `#2da95c`).
2. **Zero UI/UX Compromise**: Renders the complete, pixel-perfect frontend with all transitions, fonts, and icons.
3. **Internal Zero-Dependency Server**: If Vite is not running, MATLAB uses `SimpleWebServer.m` (a pure MATLAB class powered by standard Java sockets included in all MATLAB versions) to serve the compiled `dist/` directory at `http://127.0.0.1:4200/`.
4. **Backend Continuity**: Directly communicates with the existing backend at `http://localhost:8000`.

---

## 🚀 Quick Start (In MATLAB)

### 1. Open MATLAB
Open MATLAB and navigate to the project directory:
```matlab
cd '/path/to/uzhavan ai'
```

### 2. Launch with 1 Command
Run in the MATLAB Command Window:
```matlab
start_uzhavan_ai
```

That's it! The Uzhavan AI desktop window will open immediately.

---

## ⚙️ Advanced Launch Options

### Mobile Phone View (Default, 480px)
```matlab
uzhavan_ai_app();
```

### Expanded Desktop View (Wide Screen)
```matlab
uzhavan_ai_app('Mode', 'desktop');
```

### Connect to Custom Port
If you are running the Vite dev server on port 3000:
```matlab
uzhavan_ai_app('Port', 3000);
```

---

## 🎮 Programmatic Control in MATLAB

You can also control the application programmatically from MATLAB scripts using the `UzhavanAI` class:

```matlab
% Instantiate controller
ai = UzhavanAI();

% Check if the FastAPI backend is running
if ai.getBackendStatus()
    disp('Backend is online and ready!');
else
    disp('Please start the backend server on port 8000.');
end

% Launch the application
ai.launch('Mode', 'mobile');

% Send data from MATLAB to the web application
ai.sendData(struct('command', 'setLanguage', 'lang', 'ta'));

% Refresh the view
ai.reload();

% Close the application
ai.close();
```

---

## 📁 Files Included in `matlab/`

| File | Description |
| :--- | :--- |
| **`start_uzhavan_ai.m`** | Main 1-click launcher script for the MATLAB Command Window. |
| **`uzhavan_ai_app.m`** | Core MATLAB GUI application hosting the `uifigure` and `uihtml` browser. |
| **`SimpleWebServer.m`** | Pure MATLAB HTTP server serving static files without needing Node.js or Python. |
| **`UzhavanAI.m`** | Object-oriented MATLAB class controller for automated scripts and workflows. |

---

## 📋 System Requirements
- **MATLAB**: R2019b, R2020a, R2021a/b, R2022a/b, R2023a/b, R2024a/b or newer.
- **Toolboxes**: **None required!** Runs on base MATLAB.
- **Operating System**: Windows, Linux, or macOS.
