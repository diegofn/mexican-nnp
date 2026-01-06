// queryMexicanNnp.js
const { Client } = require('pg');

// Usa variables de entorno o pon aquí tu connection string
const connectionString = process.env.DATABASE_URL
  || 'postgresql://mexicannpp:8L0JviL5f7hiMuABFZ9Q1dVbAcKk8aED@dpg-d5e3icer433s73f5ubf0-a.oregon-postgres.render.com/mexicannpp?sslmode=require';

async function main() {
  const client = new Client({ connectionString });

  try {
    await client.connect();

    // Valor fijo 9632340000 como parámetro
    const numero = 9632340000;

    const query = `
      SELECT id,
             numeracion_inicial,
             numeracion_final,
             modalidad,
             raw,
             "createdAt",
             "updatedAt"
      FROM "MexicanNnp"
      WHERE $1 >= numeracion_inicial
        AND $1 < numeracion_final;
    `;

    // Medir tiempo de ejecución de la consulta
    const inicio = performance.now();
    const result = await client.query(query, [numero]);
    const fin = performance.now();
    
    const tiempoQuery = (fin - inicio).toFixed(2);

    console.log(`⏱️  Tiempo de query: ${tiempoQuery} ms`);
    console.log('Filas encontradas:', result.rowCount);
    console.log(result.rows);
  } catch (err) {
    console.error('Error al ejecutar la consulta:', err);
  } finally {
    await client.end();
  }
}

main();