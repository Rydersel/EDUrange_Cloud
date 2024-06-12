import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import 'xterm/css/xterm.css';

const TerminalComponent = () => {
    const xtermRef = useRef(null);
    const [isConnected, setIsConnected] = useState(true);
    const commandBuffer = useRef('');

    useEffect(() => {
        const xterm = new Terminal();
        xtermRef.current = xterm;
        xterm.open(document.getElementById('terminal'));
        xterm.writeln('Connected to server\r\n');

        xterm.onData(async (data) => {
            const code = data.charCodeAt(0);

            if (code === 13) { // Enter key
                const command = commandBuffer.current;
                commandBuffer.current = '';

                // Display the command in the terminal
                xterm.write('\r\n');

                if (command.trim()) {
                    try {
                        const response = await fetch('http://localhost:5000/execute', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                "show_writable_only": true,
                            },
                            body: JSON.stringify({ command }),
                        });
                        const result = await response.json();
                        xterm.write(result.output);
                    } catch (error) {
                        xterm.write('\r\nError executing command\r\n');
                    }
                }
                xterm.write('\r\n$ ');
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

        // Initialize prompt
        xterm.write('$ ');

        return () => {
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
