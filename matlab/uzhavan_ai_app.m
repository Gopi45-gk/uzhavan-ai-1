function app = uzhavan_ai_app(varargin)
    % UZHAVAN_AI_APP Launches the complete Uzhavan AI application inside MATLAB Desktop.
    %   Runs the exact Uzhavan AI application (Voice Assistant, Multilingual Chat,
    %   Disease Detection, Mandi Prices, Weather, Advisory) within MATLAB's native
    %   Chromium WebWindow with 100% full fidelity and live backend connectivity.
    %
    %   Usage:
    %       uzhavan_ai_app()                   % Opens in mobile view (480x920)
    %       uzhavan_ai_app('Mode', 'desktop')  % Opens in wide desktop view (1100x850)
    %       uzhavan_ai_app('Port', 3000)       % Connect to custom frontend port

    % Parse optional parameters
    p = inputParser;
    addParameter(p, 'Mode', 'mobile', @(x) ischar(x) || isstring(x));
    addParameter(p, 'Port', 3000, @isnumeric);
    parse(p, varargin{:});

    viewMode = lower(char(p.Results.Mode));
    frontendPort = p.Results.Port;

    % Resolve paths
    matlabDir = fileparts(mfilename('fullpath'));
    projectRoot = fileparts(matlabDir);

    fprintf('================================================================================\n');
    fprintf('🌾 Starting Uzhavan AI (உழவன் AI) Desktop Application in MATLAB\n');
    fprintf('================================================================================\n');

    % Step 1: Ensure Backend is active on port 8000
    % Step 1: Ensure Backend is active (Port 8005 or 8000)
    backendActive = checkHttpUrl('http://localhost:8005/docs', 1.0) || ...
                    checkHttpUrl('http://localhost:8000/docs', 1.0);
    if ~backendActive
        fprintf('🚀 [Backend] Starting FastAPI backend on http://localhost:8005...\n');
        system(sprintf('cd "%s/backend" && python3 -m uvicorn main:app --port 8005 --host 0.0.0.0 >/dev/null 2>&1 &', projectRoot));
        pause(1.5);
        backendActive = checkHttpUrl('http://localhost:8005/docs', 2.0);
    end

    if backendActive
        fprintf('✅ [Backend Check] FastAPI backend active and responsive\n');
    else
        fprintf('⚠️  [Backend Check] Backend initializing on port 8005...\n');
    end

    % Step 2: Ensure Frontend server is active on port 3000
    frontendUrl = sprintf('http://localhost:%d', frontendPort);
    frontendActive = checkHttpUrl([frontendUrl, '/'], 1.0);
    if ~frontendActive
        fprintf('🚀 [Frontend] Starting Vite server on %s...\n', frontendUrl);
        system(sprintf('cd "%s" && npx vite --port %d --host 0.0.0.0 >/dev/null 2>&1 &', projectRoot, frontendPort));
        pause(2.5);
        frontendActive = checkHttpUrl([frontendUrl, '/'], 3.0);
    end

    if frontendActive
        fprintf('✅ [Frontend Check] Uzhavan AI frontend active on %s\n', frontendUrl);
    else
        fprintf('⚠️  [Frontend Notice] Server starting on %s...\n', frontendUrl);
    end

    % Step 3: Determine Window Geometry
    screenSize = get(0, 'ScreenSize');
    screenWidth = screenSize(3);
    screenHeight = screenSize(4);

    if strcmp(viewMode, 'desktop')
        winWidth = min(1180, screenWidth - 100);
        winHeight = min(880, screenHeight - 100);
    else
        % Mobile view: 480px width, matching Uzhavan AI app-container
        winWidth = 490;
        winHeight = min(920, screenHeight - 80);
    end

    posX = max(50, round((screenWidth - winWidth) / 2));
    posY = max(50, round((screenHeight - winHeight) / 2));

    % Step 4: Launch Native MATLAB Chromium WebWindow
    win = [];
    try
        win = matlab.internal.webwindow(frontendUrl);
        win.Title = 'Uzhavan AI (உழவன் AI) — Smart Farmer Assistant';
        win.Position = [posX, posY, winWidth, winHeight];
        win.setMinSize([360, 580]);
        win.show();
        win.bringToFront();

        app = struct(...
            'Window', win, ...
            'Url', frontendUrl, ...
            'BackendActive', backendActive, ...
            'Close', @() win.close(), ...
            'Reload', @() win.executeJS('window.location.reload()'), ...
            'ExecuteJS', @(js) win.executeJS(js));

        fprintf('✨ [Uzhavan AI App] Rendered in native MATLAB Chromium window successfully!\n');
        fprintf('💡 Type "app.Close()" or "close(uzhavanApp.Window)" to close the window.\n');
        fprintf('================================================================================\n');
    catch ex
        fprintf('⚠️ Falling back to MATLAB web browser: %s\n', ex.message);
        web(frontendUrl, '-new');
        app = struct('Url', frontendUrl, 'BackendActive', backendActive);
    end
end

function ok = checkHttpUrl(urlStr, timeoutSec)
    ok = false;
    try
        url = java.net.URL(urlStr);
        conn = url.openConnection();
        conn.setConnectTimeout(round(timeoutSec * 1000));
        conn.setReadTimeout(round(timeoutSec * 1000));
        code = conn.getResponseCode();
        ok = (code >= 200 && code < 400);
    catch
        ok = false;
    end
end
