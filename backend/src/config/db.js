import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();
const pool = mysql.createPool({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'agritrace', password: process.env.DB_PASSWORD || 'agritrace_secret', database: process.env.DB_NAME || 'agriculture_supply_chain', waitForConnections: true, connectionLimit: 10, dateStrings: true });
export default pool;
