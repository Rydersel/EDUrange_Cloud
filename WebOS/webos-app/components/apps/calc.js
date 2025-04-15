import React, { useState, useCallback } from 'react';
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

const Calc = () => {
    const [display, setDisplay] = useState('');

    const handleButtonClick = useCallback((value) => {
        if (value === '=') {
            calculateResult();
        } else if (value === 'C') {
            clearDisplay();
        } else {
            setDisplay(prevDisplay => prevDisplay + value);
        }
    }, []);

    const calculateResult = useCallback(() => {
        try {
            const result = parser.evaluate(display);
            setDisplay(String(result));
        } catch (e) {
            setDisplay('Error');
        }
    }, [display]);

    const clearDisplay = useCallback(() => {
        setDisplay('');
    }, []);

    const renderButton = useCallback((value) => (
        <button onClick={() => handleButtonClick(value)} className="calculator-button">
            {value}
        </button>
    ), [handleButtonClick]);

    return (
        <div className="calculator">
            <div className="calculator-display">{display}</div>
            <div className="calculator-buttons">
                <div className="calculator-row">
                    {renderButton('1')}
                    {renderButton('2')}
                    {renderButton('3')}
                    {renderButton('+')}
                </div>
                <div className="calculator-row">
                    {renderButton('4')}
                    {renderButton('5')}
                    {renderButton('6')}
                    {renderButton('-')}
                </div>
                <div className="calculator-row">
                    {renderButton('7')}
                    {renderButton('8')}
                    {renderButton('9')}
                    {renderButton('*')}
                </div>
                <div className="calculator-row">
                    {renderButton('0')}
                    {renderButton('.')}
                    {renderButton('=')}
                    {renderButton('/')}
                </div>
                <div className="calculator-row">
                    {renderButton('C')}
                </div>
            </div>
        </div>
    );
};

export default Calc;

export const displayTerminalCalc = (addFolder, openApp) => {
    return <Calc addFolder={addFolder} openApp={openApp} />;
};
