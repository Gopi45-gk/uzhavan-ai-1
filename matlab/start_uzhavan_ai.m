% START_UZHAVAN_AI Single-command launcher for Uzhavan AI in MATLAB.
%   Run this script in the MATLAB Command Window to launch the complete
%   Uzhavan AI frontend inside MATLAB Desktop without changing the UI or backend.
%
%   Syntax:
%       start_uzhavan_ai
%
%   Uzhavan AI — Google DeepMind & Advanced Agentic Coding Architecture

clc;
fprintf('================================================================================\n');
fprintf('🌾 UZHAVAN AI (உழவன் AI) — MATLAB DESKTOP LAUNCHER\n');
fprintf('================================================================================\n');

% Ensure matlab directory is on MATLAB search path
matlabFolder = fileparts(mfilename('fullpath'));
addpath(matlabFolder);

% Clean up any lingering background timers
oldTimers = timerfindall('Name', 'UzhavanWebServerTimer');
if ~isempty(oldTimers)
    try
        stop(oldTimers);
        delete(oldTimers);
    catch
    end
end

% Check MATLAB version compatibility
verInfo = ver('MATLAB');
verYear = sscanf(verInfo.Release, '(%*c%d%*c)');
if isempty(verYear) || verYear < 2019
    warning('Uzhavan AI recommends MATLAB R2019b or newer for full uihtml Chromium support.');
end

% Launch the application and assign handle in base workspace
try
    appHandle = uzhavan_ai_app();
    assignin('base', 'uzhavanApp', appHandle);
    
    fprintf('\n🎉 Uzhavan AI is now running inside your MATLAB Desktop window!\n');
    fprintf('💡 Useful MATLAB Commands:\n');
    fprintf('   - uzhavanApp.Figure           : Access figure window handle\n');
    fprintf('   - uzhavanApp.HTMLComponent    : Access embedded Chromium component\n');
    fprintf('   - close(uzhavanApp.Figure)    : Close the app\n');
    fprintf('================================================================================\n');
catch ME
    fprintf('\n❌ Error launching Uzhavan AI in MATLAB:\n%s\n', ME.message);
    fprintf('\nTroubleshooting:\n');
    fprintf('1. Ensure you ran "npm run build" in the project root.\n');
    fprintf('2. Ensure FastAPI backend is active on http://localhost:8000\n');
    fprintf('   Run in terminal: cd backend && uvicorn main:app --port 8000\n');
end
