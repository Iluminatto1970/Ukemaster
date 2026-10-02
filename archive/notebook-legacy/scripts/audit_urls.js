const fs = require('fs');
const path = require('path');

const audit = () => {
    const urls = [
        { path: '/', type: 'low_value' },
        { path: '/cifras/lista-geral', type: 'low_value' },
        { path: '/artigos/como-ler-cifras', type: 'high_value' },
        { path: '/artigos/historia-ukulele', type: 'high_value' }
    ];

    const report = {
        generatedAt: new Date().toISOString(),
        totalUrls: urls.length,
        urls
    };

    try {
        fs.writeFileSync(path.join(__dirname, 'urls_report.json'), JSON.stringify(report, null, 2));
        console.log('urls_report.json gerado com sucesso.');
    } catch (err) {
        console.error('Erro ao gerar relatório:', err);
    }
};

audit();
