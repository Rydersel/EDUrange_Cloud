'use client'

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import 'xterm/css/xterm.css';

// Dynamically import xterm and addons
const Terminal = dynamic(
  async () => {
    const { Terminal } = await import('xterm');
    return Terminal;
  },
  { ssr: false } // This makes sure xterm is only imported on the client-side
);

const TerminalComponent = () => {
  const xtermRef = useRef(null);
  const [isConnected, setIsConnected] = useState(true);
  const commandBuffer = useRef('');

  useEffect(() => {
    const initializeTerminal = async () => {
      if (typeof window !== 'undefined') {  // This causes a hydration error but don't have a better solution right now
        const { Terminal } = await import('xterm');
        const { FitAddon } = await import('@xterm/addon-fit');
        const { ClipboardAddon } = await import('@xterm/addon-clipboard');
        const { WebLinksAddon } = await import('@xterm/addon-web-links');

        const xterm = new Terminal({
          cursorBlink: true,
          theme: { background: 'rgba(14,14,14,0.5)' }
        });
        const fitAddon = new FitAddon();
        const clipboardAddon = new ClipboardAddon();
        const webLinksAddon = new WebLinksAddon();
        xterm.loadAddon(fitAddon);
        xterm.loadAddon(clipboardAddon);
        xterm.loadAddon(webLinksAddon);

        xtermRef.current = xterm;
        xterm.open(document.getElementById('terminal'));
        fitAddon.fit();

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
                const response = await fetch('/api/execute-command', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ command }),
                });

                if (!response.ok) {
                  const errorMessage = `Error: ${response.status} ${response.statusText}`;
                  xterm.write(`\r\n${errorMessage}\r\n`);
                } else {
                  const result = await response.json();
                  xterm.write(result.output);
                }
              } catch (error) {
                xterm.write(`\r\nError: Unable to reach the server\r\n${error.message}\r\n`);
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
      }
    };

    initializeTerminal();

    return () => {
      if (xtermRef.current) {
        xtermRef.current.dispose();
      }
    };
  }, [isConnected]);

  return (
    <div id="terminal"></div>
  );
};

export default TerminalComponent;

export const displayTerminal = () => {
  return <TerminalComponent />;
};
