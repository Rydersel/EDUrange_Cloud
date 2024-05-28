import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import { Terminal } from 'xterm';
import 'xterm/css/xterm.css';

const TerminalComponent = () => {
    const xtermRef = useRef(null);
    const socketRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const commandBuffer = useRef('');

    useEffect(() => {
        const xterm = new Terminal();
        xtermRef.current = xterm;
        xterm.open(document.getElementById('terminal'));

        socketRef.current = io('http://localhost:5000');

        socketRef.current.on('connect', () => {
            setIsConnected(true);
            xterm.writeln('Connected to server\r\n');
        });

        socketRef.current.on('response', (data) => {
            xterm.write('\r\n' + data);
        });

        xterm.onData((data) => {
            const code = data.charCodeAt(0);

            if (code === 13) { // Enter key
                socketRef.current.emit('command', commandBuffer.current);
                commandBuffer.current = '';
            } else if (code === 127) { // Backspace
                if (commandBuffer.current.length > 0) {
                    commandBuffer.current = commandBuffer.current.slice(0, -1);
                    xterm.write('\b \b'); // Move cursor back, overwrite with space, move cursor back again
                }
            } else {
                commandBuffer.current += data;
                xterm.write(data);
            }
        });

        return () => {
            socketRef.current.disconnect();
            xterm.dispose();
        };
    }, [isConnected]);

    return (
        <div id="terminal" style={{ height: '100%', width: '100%' }}></div>
    );
};

export default TerminalComponent;

export const displayTerminal = () => {
    return <TerminalComponent />;
};
