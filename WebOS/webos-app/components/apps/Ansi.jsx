import React from 'react';
import ansiHTML from 'ansi-html';

const Ansi = ({ children }) => {
    const html = ansiHTML(children);

    return <pre dangerouslySetInnerHTML={{ __html: html }} />;
};

export default Ansi;
