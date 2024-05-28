import React, { Component } from 'react';
const Parser = require('expr-eval').Parser;

const parser = new Parser({
    operators: {
        add: true,
        concatenate: true,
        conditional: true,
        divide: true,
        factorial: true,
        multiply: true,
        power: true,
        remainder: true,
        subtract: true,
        logical: false,
        comparison: false,
        'in': false,
        assignment: true
    }
});

export class Calc extends Component {
    constructor() {
        super();
        this.state = {
            display: ''
        };
    }

    handleButtonClick = (value) => {
        if (value === '=') {
            this.calculateResult();
        } else if (value === 'C') {
            this.clearDisplay();
        } else {
            this.setState((prevState) => ({
                display: prevState.display + value
            }));
        }
    };

    calculateResult = () => {
        try {
            const result = parser.evaluate(this.state.display);
            this.setState({ display: String(result) });
        } catch (e) {
            this.setState({ display: 'Error' });
        }
    };

    clearDisplay = () => {
        this.setState({ display: '' });
    };

    renderButton = (value) => (
        <button onClick={() => this.handleButtonClick(value)} className="calculator-button">
            {value}
        </button>
    );

    render() {
        return (
            <div className="calculator">
                <div className="calculator-display">{this.state.display}</div>
                <div className="calculator-buttons">
                    <div className="calculator-row">
                        {this.renderButton('1')}
                        {this.renderButton('2')}
                        {this.renderButton('3')}
                        {this.renderButton('+')}
                    </div>
                    <div className="calculator-row">
                        {this.renderButton('4')}
                        {this.renderButton('5')}
                        {this.renderButton('6')}
                        {this.renderButton('-')}
                    </div>
                    <div className="calculator-row">
                        {this.renderButton('7')}
                        {this.renderButton('8')}
                        {this.renderButton('9')}
                        {this.renderButton('*')}
                    </div>
                    <div className="calculator-row">
                        {this.renderButton('0')}
                        {this.renderButton('.')}
                        {this.renderButton('=')}
                        {this.renderButton('/')}
                    </div>
                    <div className="calculator-row">
                        {this.renderButton('C')}
                    </div>
                </div>
            </div>
        );
    }
}

export default Calc;

export const displayTerminalCalc = (addFolder, openApp) => {
    return <Calc addFolder={addFolder} openApp={openApp} />;
};
