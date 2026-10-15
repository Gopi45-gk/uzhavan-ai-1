% START_UZHAVAN_AI Root launcher for Uzhavan AI in MATLAB.
%   This script ensures the matlab/ directory and project root are added
%   to the MATLAB path and launches the Uzhavan AI application.

projectFolder = fileparts(mfilename('fullpath'));
matlabFolder = fullfile(projectFolder, 'matlab');
addpath(matlabFolder);
addpath(projectFolder);

% Launch the application
uzhavanApp = uzhavan_ai_app();
assignin('base', 'uzhavanApp', uzhavanApp);
