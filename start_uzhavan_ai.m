% START_UZHAVAN_AI Root launcher for Uzhavan AI in MATLAB.
%   This script ensures the matlab/ directory and project root are added
%   to the MATLAB path and launches the Uzhavan AI application.

projectFolder = fileparts(mfilename('fullpath'));
matlabFolder = fullfile(projectFolder, 'matlab');
addpath(matlabFolder);
addpath(projectFolder);
% Clean up any lingering background timers
oldTimers = timerfindall('Name', 'UzhavanWebServerTimer');
if ~isempty(oldTimers)
    try
        stop(oldTimers);
        delete(oldTimers);
    catch
    end
end

% Launch the application
uzhavanApp = uzhavan_ai_app();
assignin('base', 'uzhavanApp', uzhavanApp);
