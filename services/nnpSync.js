const prisma = require('../generated/prisma/client');

async function syncNNPToDB(rows) {
    const data = rows.map(r => ({
        numeracion_inicial: r.NUMERACION_INICIAL || r['NUMERACION_INICIAL'] || '',
        numeracion_final: r.NUMERACION_FINAL || r['NUMERACION_FINAL'] || '',
        modalidad: r.MODALIDAD || r['MODALIDAD'] || null,
        raw: r
    }));

    //
    // Insertar en lotes para CSV grande (ejemplo de chunk de 1000)
    //
    const chunkSize = 1000;
    for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        await prisma.MexicanNnp.createMany({
        data: chunk,
        skipDuplicates: true
        });
    }
}

module.exports = { syncNNPToDB };