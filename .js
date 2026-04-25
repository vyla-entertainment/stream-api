import fs from 'fs';

fetch('http://127.0.0.1:8788/api/player?id=550')
    .then(res => res.text())
    .then(html => {
        fs.writeFileSync('output.html', html);
        console.log('Saved to output.html');
    })
    .catch(err => console.error(err));