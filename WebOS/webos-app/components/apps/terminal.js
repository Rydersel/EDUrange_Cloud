import React, { Component } from 'react';
import $ from 'jquery';

export class Terminal extends Component {
    constructor() {
        super();
        this.cursorInterval = null;
        this.terminalRowCount = 1;
        this.commandHistory = [];
        this.commandIndex = -1;
        this.state = {
            terminalRows: [],
        };
    }

    componentDidMount() {
        this.initializeTerminal();
    }

    componentDidUpdate() {
        clearInterval(this.cursorInterval);
        this.startCursorBlink(this.terminalRowCount - 2);
    }

    componentWillUnmount() {
        clearInterval(this.cursorInterval);
    }

    initializeTerminal = () => {
        clearInterval(this.cursorInterval);
        $('#terminal-body').empty();
        this.addTerminalRow();
    }

    addTerminalRow = () => {
        const { terminalRows } = this.state;
        terminalRows.push(this.renderTerminalRow(this.terminalRowCount));
        this.setState({ terminalRows });
        this.terminalRowCount += 2;
    }

    renderTerminalRow = (id) => {
        return (
            <React.Fragment key={id}>
                <div className="flex w-full h-5">
                    <div className="flex">

                        <div className="text-green-600 mx-px font-medium mr-2">$</div>
                    </div>
                    <div id="cmd" onClick={this.focusCursor} className="bg-transparent relative flex-1 overflow-hidden">
                        <span id={`show-${id}`} className="float-left whitespace-pre pb-1 opacity-100 font-normal tracking-wider"></span>
                        <div id={`cursor-${id}`} className="float-left mt-1 w-1.5 h-3.5 bg-white opacity-75"></div>
                        <input id={`terminal-input-${id}`} data-row-id={id} onKeyDown={this.handleKeyDown} onBlur={this.blurCursor} className="absolute top-0 left-0 w-full opacity-0 outline-none bg-transparent" spellCheck={false} autoFocus autoComplete="off" type="text" />
                    </div>
                </div>
                <div id={`row-result-${id}`} className="my-2 font-normal"></div>
            </React.Fragment>
        );
    }

    focusCursor = (e) => {
        clearInterval(this.cursorInterval);
        this.startCursorBlink($(e.target).data("row-id"));
    }

    blurCursor = (e) => {
        this.stopCursorBlink($(e.target).data("row-id"));
    }

    startCursorBlink = (id) => {
        clearInterval(this.cursorInterval);
        $(`input#terminal-input-${id}`).trigger("focus");

        $(`input#terminal-input-${id}`).on("input", function () {
            $(`#cmd span#show-${id}`).text($(this).val());
        });

        this.cursorInterval = window.setInterval(() => {
            const cursor = $(`#cursor-${id}`);
            cursor.css({ visibility: cursor.css('visibility') === 'visible' ? 'hidden' : 'visible' });
        }, 500);
    }

    stopCursorBlink = (id) => {
        clearInterval(this.cursorInterval);
        $(`#cursor-${id}`).css({ visibility: 'visible' });
    }

    removeCursor = (id) => {
        this.stopCursorBlink(id);
        $(`#cursor-${id}`).css({ display: 'none' });
    }

    clearInput = (id) => {
        $(`input#terminal-input-${id}`).trigger("blur");
    }

    handleKeyDown = (e) => {
        const rowId = $(e.target).data("row-id");
        const command = $(`input#terminal-input-${rowId}`).val().trim();

        if (e.key === "Enter") {
            if (command) {
                this.removeCursor(rowId);
                this.executeCommand(command, rowId);
            }
            this.commandHistory.push(command);
            this.commandIndex = this.commandHistory.length - 1;
            this.clearInput(rowId);
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            this.navigateCommandHistory(e.key, rowId);
        }
    }

    navigateCommandHistory = (key, rowId) => {
        if (key === "ArrowUp") {
            this.commandIndex = Math.max(this.commandIndex - 1, -1);
        } else if (key === "ArrowDown") {
            this.commandIndex = Math.min(this.commandIndex + 1, this.commandHistory.length);
        }

        const prevCommand = this.commandHistory[this.commandIndex] || "";
        $(`input#terminal-input-${rowId}`).val(prevCommand);
        $(`#show-${rowId}`).text(prevCommand);
    }

    closeTerminal = () => {
        $("#close-terminal").trigger('click');
    }

    sanitizeInput = (str) => { //Prevents XSS attacks (hopefully)
        if (!str) return '';

        const replacements = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '/': '&#x2F;',
        };

        return str.replace(/[&<>"'/]/g, (char) => replacements[char]);
    }

    executeCommand = async (command, rowId) => {
        console.log(command);

        if (command.trim()) {
            try {
                const response = await fetch('/api/execute-command', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ command }),
                });

                const result = await response.json();
                const output = response.ok ? result.output : `Error: ${response.status} ${response.statusText}`;
                document.getElementById(`row-result-${rowId}`).innerHTML = this.sanitizeInput(`\r\n${output}\r\n`);
            } catch (error) {
                document.getElementById(`row-result-${rowId}`).innerHTML = (`\r\nError: Unable to reach the server\r\n${error.message}\r\n`);
            }

            this.addTerminalRow();
        }
    }

    render() {
        return (
            <div className="h-full w-full bg-black opacity-100 text-white text-sm" id="terminal-body">
                {this.state.terminalRows}
            </div>
        );
    }
}

export default Terminal;

export const displayTerminal = () => {
    return <Terminal/>;
}
