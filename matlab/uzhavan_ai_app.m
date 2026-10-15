function app = uzhavan_ai_app(varargin)
    % UZHAVAN_AI_APP Launches the complete Uzhavan AI frontend inside MATLAB Desktop.
    %   Runs the exact Uzhavan AI application (Voice Assistant, Multilingual Chat,
    %   Disease Detection, Mandi Prices, Weather, Advisory) within a native MATLAB
    %   uifigure using the Chromium-powered uihtml component.
    %
    %   Usage:
    %       uzhavan_ai_app()              % Auto-detects server and opens in mobile mode
    %       uzhavan_ai_app('Mode', 'desktop')  % Opens in expanded desktop mode
    %       uzhavan_ai_app('Port', 3000)   % Custom frontend port (default: 3000 or 4200)
    %
    %   Requirements:
    %       MATLAB R2019b or later (supports uihtml). Tested on R2020a - R2024b+.

    % Parse optional parameters
    p = inputParser;
    addParameter(p, 'Mode', 'mobile', @(x) ischar(x) || isstring(x));
    addParameter(p, 'Port', 0, @isnumeric);
    parse(p, varargin{:});

    viewMode = lower(char(p.Results.Mode));
    customPort = p.Results.Port;

    % Resolve workspace directories
    matlabDir = fileparts(mfilename('fullpath'));
    projectRoot = fileparts(matlabDir);
    distDir = fullfile(projectRoot, 'dist');

    fprintf('================================================================================\n');
    fprintf('🌾 Starting Uzhavan AI (உழவன் AI) Desktop Application in MATLAB\n');
    fprintf('================================================================================\n');

    % Step 1: Detect Backend Status (http://localhost:8000)
    backendActive = checkHttpUrl('http://localhost:8000/api/weather/v2/forecast', 1.5) || ...
                    checkHttpUrl('http://localhost:8000/docs', 1.5);
    port8000Conflict = false;
    if ~backendActive && checkHttpUrl('http://localhost:8000/', 1.0)
        port8000Conflict = true;
    end

    if backendActive
        fprintf('✅ [Backend Check] FastAPI backend is active and responsive on http://localhost:8000\n');
    elseif port8000Conflict
        fprintf('⚠️  [Port 8000 Conflict] Port 8000 is occupied by Ubuntu printer service (gutenprint-printer-app).\n');
        fprintf('   This causes CORS errors because requests hit the printer service instead of FastAPI.\n');
        fprintf('   👉 Fix: Run this in a terminal to free port 8000 and start FastAPI:\n');
        fprintf('      sudo snap stop gutenprint-printer-app\n');
        fprintf('      cd "%s/backend" && python3 -m uvicorn main:app --port 8000\n', projectRoot);
    else
        fprintf('⚠️  [Backend Check] Backend not detected on http://localhost:8000.\n');
        fprintf('   To start backend: cd "%s/backend" && python3 -m uvicorn main:app --port 8000\n', projectRoot);
    end

    % Clean up any old timers from previous runs
    oldTimers = timerfindall('Name', 'UzhavanWebServerTimer');
    if ~isempty(oldTimers)
        try
            stop(oldTimers);
            delete(oldTimers);
        catch
        end
    end

    % Step 2: Ensure compiled dist frontend exists and is on MATLAB path
    if ~isfile(fullfile(distDir, 'index.html'))
        fprintf('📦 [Build Notice] Compiled distribution not found. Building with npm run build...\n');
        system(sprintf('cd "%s" && npm run build', projectRoot));
    end

    if ~isfile(fullfile(distDir, 'index.html'))
        error('UzhavanAI:NoFrontend', ...
            'Could not locate or build Uzhavan AI frontend bundle in %s', distDir);
    end

    % Add dist directory to MATLAB search path so uihtml resolves index.html and assets
    addpath(distDir);
    htmlFilePath = fullfile(distDir, 'index.html');
    fprintf('📱 [Frontend Ready] Embedded uihtml loading: %s\n', htmlFilePath);

    % Step 3: Create MATLAB Figure Window
    screenSize = get(0, 'ScreenSize');
    screenWidth = screenSize(3);
    screenHeight = screenSize(4);

    if strcmp(viewMode, 'desktop')
        winWidth = min(1200, screenWidth - 100);
        winHeight = min(850, screenHeight - 120);
    else
        % Default: Premium Mobile Frame (480px width) centered on screen
        winWidth = 490;
        winHeight = min(920, screenHeight - 80);
    end

    posX = round((screenWidth - winWidth) / 2);
    posY = round((screenHeight - winHeight) / 2);

    fig = uifigure(...
        'Name', 'Uzhavan AI (உழவன் AI) — Smart Farmer Assistant', ...
        'Position', [posX, posY, winWidth, winHeight], ...
        'Color', [0.945, 0.973, 0.953], ... % Matching Uzhavan AI theme #f1f8f3
        'AutoResizeChildren', 'off');

    % Step 4: Top Control & Diagnostic Toolbar (44px height)
    toolbarHeight = 44;
    toolPanel = uipanel(fig, ...
        'Position', [0, winHeight - toolbarHeight, winWidth, toolbarHeight], ...
        'BackgroundColor', [0.176, 0.663, 0.361], ... % Uzhavan Green #2da95c
        'BorderType', 'none');

    % Header Label
    uilabel(toolPanel, ...
        'Position', [12, 10, 180, 24], ...
        'Text', '🌾 Uzhavan AI', ...
        'FontName', 'Segoe UI', ...
        'FontSize', 15, ...
        'FontWeight', 'bold', ...
        'FontColor', [1, 1, 1]);

    % Backend Status Indicator
    if backendActive
        statusText = '● Backend: Connected';
        statusColor = [0.85, 1.0, 0.85];
    elseif port8000Conflict
        statusText = '⚠️ Port 8000: Printer Conflict';
        statusColor = [1.0, 0.85, 0.6];
    else
        statusText = '○ Backend: Offline (Port 8000)';
        statusColor = [1.0, 0.9, 0.7];
    end
    statusLabel = uilabel(toolPanel, ...
        'Position', [195, 12, 190, 20], ...
        'Text', statusText, ...
        'FontSize', 11, ...
        'FontColor', statusColor);

    % Reload Button
    reloadBtn = uibutton(toolPanel, 'push', ...
        'Position', [winWidth - 190, 8, 80, 28], ...
        'Text', '🔄 Reload', ...
        'BackgroundColor', [1, 1, 1], ...
        'FontColor', [0.1, 0.4, 0.2], ...
        'FontSize', 11, ...
        'FontWeight', 'bold');

    % External Browser Button
    browserBtn = uibutton(toolPanel, 'push', ...
        'Position', [winWidth - 100, 8, 90, 28], ...
        'Text', '🌐 Browser', ...
        'BackgroundColor', [1, 1, 1], ...
        'FontColor', [0.1, 0.4, 0.2], ...
        'FontSize', 11, ...
        'FontWeight', 'bold');

    % Step 5: Embedded uihtml Web Component
    htmlComp = uihtml(fig, ...
        'Position', [0, 0, winWidth, winHeight - toolbarHeight], ...
        'HTMLSource', htmlFilePath);

    % Configure browser target (prefer live dev server if active, otherwise file)
    browserTarget = htmlFilePath;
    if checkHttpUrl('http://localhost:3000/', 0.5)
        browserTarget = 'http://localhost:3000/';
    end

    % Configure callbacks
    reloadBtn.ButtonPushedFcn = @(~, ~) reloadApp(htmlComp, htmlFilePath);
    browserBtn.ButtonPushedFcn = @(~, ~) web(browserTarget, '-browser');

    % Handle window resize to keep layout responsive
    fig.SizeChangedFcn = @(~, ~) resizeComponents(fig, toolPanel, htmlComp, reloadBtn, browserBtn, toolbarHeight);

    % Handle clean shutdown when window closes
    fig.CloseRequestFcn = @(~, ~) closeApp(fig);

    % Bidirectional MATLAB Event Listener from frontend
    htmlComp.HTMLEventReceivedFcn = @(~, event) onFrontendEvent(event, fig);

    % Return structured handle
    app = struct(...
        'Figure', fig, ...
        'HTMLComponent', htmlComp, ...
        'HTMLFile', htmlFilePath, ...
        'StatusLabel', statusLabel);

    fprintf('✨ [Uzhavan AI App] Rendered inside MATLAB window successfully.\n');
    fprintf('================================================================================\n');
end

function reloadApp(htmlComp, filePath)
    fprintf('🔄 [Uzhavan AI] Reloading frontend...\n');
    htmlComp.HTMLSource = '';
    drawnow;
    htmlComp.HTMLSource = filePath;
end

function closeApp(fig)
    % Clean up any background timers if present
    oldTimers = timerfindall('Name', 'UzhavanWebServerTimer');
    if ~isempty(oldTimers)
        try
            stop(oldTimers);
            delete(oldTimers);
        catch
        end
    end
    delete(fig);
    fprintf('👋 [Uzhavan AI] App closed.\n');
end

function resizeComponents(fig, toolPanel, htmlComp, reloadBtn, browserBtn, tbHeight)
    pos = fig.Position;
    w = pos(3);
    h = pos(4);
    toolPanel.Position = [0, h - tbHeight, w, tbHeight];
    htmlComp.Position = [0, 0, w, h - tbHeight];
    reloadBtn.Position = [max(10, w - 190), 8, 80, 28];
    browserBtn.Position = [max(95, w - 100), 8, 90, 28];
end

function onFrontendEvent(event, fig)
    eventName = char(event.HTMLEventName);
    eventData = event.HTMLEventData;
    fprintf('📩 [MATLAB Received Event from Uzhavan AI]: %s\n', eventName);
    if ~isempty(eventData)
        disp(eventData);
    end
    % Store in figure UserData for access in MATLAB workspace
    fig.UserData = struct('LastEvent', eventName, 'LastData', eventData, 'Timestamp', now);
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
