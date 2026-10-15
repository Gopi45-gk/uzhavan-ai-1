classdef SimpleWebServer < handle
    % SIMPLEWEBSERVER Lightweight, pure MATLAB HTTP server using Java sockets.
    %   Serves static web files (HTML, JS, CSS, images, etc.) from a specified
    %   directory without requiring Node.js, Python, or external toolboxes.
    %
    %   Usage:
    %       server = SimpleWebServer(fullfile(pwd, 'dist'), 4200);
    %       server.start();
    %       ...
    %       server.stop();

    properties (Access = public)
        RootDir (1, :) char
        Port (1, 1) double = 4200
        IsRunning (1, 1) logical = false
    end

    properties (Access = private)
        ServerSocket
        ServerThread
        TimerObj
    end

    methods
        function obj = SimpleWebServer(rootDir, port)
            if nargin >= 1 && ~isempty(rootDir)
                obj.RootDir = rootDir;
            else
                % Default to dist folder
                baseDir = fileparts(fileparts(mfilename('fullpath')));
                obj.RootDir = fullfile(baseDir, 'dist');
            end

            if nargin >= 2 && ~isempty(port)
                obj.Port = port;
            end
        end

        function start(obj)
            if obj.IsRunning
                fprintf('[SimpleWebServer] Server is already running on port %d.\n', obj.Port);
                return;
            end

            if ~isfolder(obj.RootDir)
                error('SimpleWebServer:MissingDir', ...
                    'Root directory does not exist: %s\nPlease build the frontend bundle first (npm run build).', obj.RootDir);
            end

            % Try opening server socket on requested port, or find available port
            maxTries = 10;
            currentPort = obj.Port;
            bound = false;

            for t = 1:maxTries
                try
                    obj.ServerSocket = java.net.ServerSocket(currentPort);
                    obj.ServerSocket.setSoTimeout(300); % 300ms timeout for non-blocking loop
                    obj.Port = currentPort;
                    bound = true;
                    break;
                catch
                    currentPort = currentPort + 1;
                end
            end

            if ~bound
                error('SimpleWebServer:BindFailed', 'Could not bind ServerSocket to any port near %d.', obj.Port);
            end

            obj.IsRunning = true;
            fprintf('🌾 [SimpleWebServer] Serving Uzhavan AI from: %s\n', obj.RootDir);
            fprintf('🚀 [SimpleWebServer] Server active at: http://127.0.0.1:%d/\n', obj.Port);

            % Use a high-frequency MATLAB Timer to poll and handle requests
            obj.TimerObj = timer(...
                'ExecutionMode', 'fixedRate', ...
                'Period', 0.05, ...
                'TimerFcn', @(~, ~) obj.handlePendingRequests(), ...
                'ErrorFcn', @(~, e) disp(e), ...
                'Name', 'UzhavanWebServerTimer');

            start(obj.TimerObj);
        end

        function handlePendingRequests(obj)
            if ~obj.IsRunning || isempty(obj.ServerSocket)
                return;
            end

            try
                % Check for incoming connection (non-blocking with timeout)
                clientSocket = obj.ServerSocket.accept();
                obj.serveClient(clientSocket);
            catch ex
                % java.net.SocketTimeoutException is expected when idle
                if ~contains(char(ex.message), 'SocketTimeoutException') && ...
                   ~contains(char(ex.identifier), 'SocketTimeoutException')
                    % Silent ignore for normal poll timeouts
                end
            end
        end

        function serveClient(obj, clientSocket)
            try
                inStream = clientSocket.getInputStream();
                outStream = clientSocket.getOutputStream();

                % Read HTTP Request line
                reader = java.io.BufferedReader(java.io.InputStreamReader(inStream));
                requestLine = char(reader.readLine());

                if isempty(requestLine)
                    clientSocket.close();
                    return;
                end

                tokens = split(strtrim(requestLine));
                if numel(tokens) < 2
                    clientSocket.close();
                    return;
                end

                method = tokens{1};
                reqPath = tokens{2};

                % Strip query parameters if any
                qIdx = find(reqPath == '?', 1);
                if ~isempty(qIdx)
                    reqPath = reqPath(1:qIdx-1);
                end

                % Normalize root request
                if strcmp(reqPath, '/') || isempty(reqPath)
                    reqPath = '/index.html';
                end

                % Sanitize relative path
                safeRelPath = strrep(reqPath, '../', '');
                if startsWith(safeRelPath, '/')
                    safeRelPath = safeRelPath(2:end);
                end

                filePath = fullfile(obj.RootDir, safeRelPath);

                % SPA fallback: if file does not exist, serve index.html
                if ~isfile(filePath)
                    filePath = fullfile(obj.RootDir, 'index.html');
                end

                if isfile(filePath)
                    mimeType = obj.getMimeType(filePath);
                    fileBytes = obj.readFileBytes(filePath);

                    % Send HTTP 200 OK header
                    header = sprintf([...
                        'HTTP/1.1 200 OK\r\n' ...
                        'Content-Type: %s\r\n' ...
                        'Content-Length: %d\r\n' ...
                        'Access-Control-Allow-Origin: *\r\n' ...
                        'Cache-Control: no-cache, no-store, must-revalidate\r\n' ...
                        'Connection: close\r\n\r\n'], ...
                        mimeType, numel(fileBytes));

                    outStream.write(uint8(header));
                    outStream.write(fileBytes);
                    outStream.flush();
                else
                    notFound = sprintf([...
                        'HTTP/1.1 404 Not Found\r\n' ...
                        'Content-Type: text/plain\r\n' ...
                        'Content-Length: 9\r\n' ...
                        'Connection: close\r\n\r\n' ...
                        'Not Found']);
                    outStream.write(uint8(notFound));
                    outStream.flush();
                end

                clientSocket.close();
            catch
                try
                    clientSocket.close();
                catch
                end
            end
        end

        function stop(obj)
            obj.IsRunning = false;

            if ~isempty(obj.TimerObj) && isvalid(obj.TimerObj)
                try
                    stop(obj.TimerObj);
                    delete(obj.TimerObj);
                catch
                end
                obj.TimerObj = [];
            end

            if ~isempty(obj.ServerSocket)
                try
                    obj.ServerSocket.close();
                catch
                end
                obj.ServerSocket = [];
            end

            fprintf('🛑 [SimpleWebServer] Server stopped.\n');
        end

        function delete(obj)
            obj.stop();
        end
    end

    methods (Access = private)
        function mime = getMimeType(~, filename)
            [~, ~, ext] = fileparts(filename);
            switch lower(ext)
                case '.html'
                    mime = 'text/html; charset=utf-8';
                case '.js'
                    mime = 'application/javascript; charset=utf-8';
                case '.mjs'
                    mime = 'application/javascript; charset=utf-8';
                case '.css'
                    mime = 'text/css; charset=utf-8';
                case '.json'
                    mime = 'application/json; charset=utf-8';
                case '.svg'
                    mime = 'image/svg+xml';
                case '.png'
                    mime = 'image/png';
                case '.jpg'
                case '.jpeg'
                    mime = 'image/jpeg';
                case '.gif'
                    mime = 'image/gif';
                case '.ico'
                    mime = 'image/x-icon';
                case '.wasm'
                    mime = 'application/wasm';
                case '.woff2'
                    mime = 'font/woff2';
                case '.woff'
                    mime = 'font/woff';
                case '.ttf'
                    mime = 'font/ttf';
                otherwise
                    mime = 'application/octet-stream';
            end
        end

        function bytes = readFileBytes(~, filePath)
            fid = fopen(filePath, 'rb');
            if fid < 0
                bytes = uint8([]);
                return;
            end
            bytes = fread(fid, Inf, '*uint8');
            fclose(fid);
        end
    end
end
