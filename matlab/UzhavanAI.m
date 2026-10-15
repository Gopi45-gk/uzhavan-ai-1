classdef UzhavanAI < handle
    % UZHAVANAI MATLAB Controller & Bridge for Uzhavan AI Smart Farming Platform.
    %   Provides an object-oriented interface to launch, control, and communicate
    %   with the Uzhavan AI frontend and FastAPI backend directly from MATLAB.
    %
    %   Example:
    %       ai = UzhavanAI();
    %       ai.launch();
    %       status = ai.getBackendStatus();
    %       ai.sendNotification('Welcome to Uzhavan AI inside MATLAB!');

    properties (Access = public)
        AppHandle
        BackendUrl (1, :) char = 'http://localhost:8000'
        FrontendUrl (1, :) char = ''
    end

    methods
        function obj = UzhavanAI(backendUrl)
            if nargin >= 1 && ~isempty(backendUrl)
                obj.BackendUrl = backendUrl;
            end
        end

        function launch(obj, varargin)
            % LAUNCH Starts the Uzhavan AI UI inside MATLAB.
            obj.AppHandle = uzhavan_ai_app(varargin{:});
            if ~isempty(obj.AppHandle) && isfield(obj.AppHandle, 'FrontendUrl')
                obj.FrontendUrl = obj.AppHandle.FrontendUrl;
            end
        end

        function isAlive = getBackendStatus(obj)
            % GETBACKENDSTATUS Tests whether the FastAPI backend is responsive.
            isAlive = false;
            try
                url = java.net.URL([obj.BackendUrl, '/api/weather/v2/forecast']);
                conn = url.openConnection();
                conn.setConnectTimeout(1500);
                conn.setReadTimeout(1500);
                code = conn.getResponseCode();
                isAlive = (code >= 200 && code < 400);
            catch
                try
                    url = java.net.URL([obj.BackendUrl, '/docs']);
                    conn = url.openConnection();
                    conn.setConnectTimeout(1500);
                    conn.setReadTimeout(1500);
                    code = conn.getResponseCode();
                    isAlive = (code >= 200 && code < 400);
                catch
                    isAlive = false;
                end
            end
        end

        function sendData(obj, dataStruct)
            % SENDDATA Sends structured data into the running frontend.
            if isempty(obj.AppHandle) || ~isvalid(obj.AppHandle.HTMLComponent)
                warning('UzhavanAI:NotRunning', 'App is not currently running.');
                return;
            end
            try
                obj.AppHandle.HTMLComponent.Data = dataStruct;
            catch ex
                warning('UzhavanAI:SendFailed', 'Failed to send data to frontend: %s', ex.message);
            end
        end

        function reload(obj)
            % RELOAD Refreshes the embedded frontend view.
            if ~isempty(obj.AppHandle) && isfield(obj.AppHandle, 'HTMLComponent')
                src = obj.AppHandle.HTMLComponent.HTMLSource;
                obj.AppHandle.HTMLComponent.HTMLSource = '';
                drawnow;
                obj.AppHandle.HTMLComponent.HTMLSource = src;
            end
        end

        function close(obj)
            % CLOSE Terminates the UI window and servers.
            if ~isempty(obj.AppHandle) && isfield(obj.AppHandle, 'Figure') && isvalid(obj.AppHandle.Figure)
                close(obj.AppHandle.Figure);
            end
            obj.AppHandle = [];
        end

        function delete(obj)
            obj.close();
        end
    end
end
