import dns from 'node:dns';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';
import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';
import cors from 'cors';

// Load config relative to this file, regardless of the terminal's current folder.
dotenv.config({ path: fileURLToPath(new URL('./config.env', import.meta.url)), quiet: true });

// Use working DNS for Atlas SRV queries before either MongoDB client connects.
// Set DNS_SERVERS= in config.env to use system DNS instead. Windows settings are unchanged.
const dnsServers = (process.env.DNS_SERVERS ?? '1.1.1.1,8.8.8.8')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
if (dnsServers.length) dns.setServers(dnsServers);


// Static imports
// import authRoutes from './routes/authRoutes.js'
// import dashboardRoutes from './routes/dashboardRoutes.js'
// import scanningRoutes from './routes/scanningRoutes.js';
// import inventoryRoutes from './routes/inventoryRoutes.js'
// import freshnessRoutes from './routes/freshnessRoutes.js';
// import rescueRoutes from './routes/rescueRoutes.js'
// import analyticsRoutes from './routes/analyticsRoutes.js';


// Dynamic imports ensure config is loaded before auth and OCR read process.env.
const { default: authRoutes } = await import('./routes/authRoutes.js');
const { default: dashboardRoutes } = await import('./routes/dashboardRoutes.js');
const { default: scanningRoutes } = await import('./routes/scanningRoutes.js');
const { default: inventoryRoutes } = await import('./routes/inventoryRoutes.js');
const { default: freshnessRoutes } = await import('./routes/freshnessRoutes.js');
const { default: rescueRoutes } = await import('./routes/rescueRoutes.js');
const { default: analyticsRoutes } = await import('./routes/analyticsRoutes.js');
const { default: iconRoutes } = await import('./routes/iconRoutes.js');

const server = express();
// Parse URL-encoded data from POST requests
server.use(express.urlencoded({ extended: true }));
// JSON middleware
server.use(express.json());

server.use(cors({
    origin: 'http://localhost:5173',
    credentials: true,
}))

// Session
server.use(
    session({
        secret: process.env.SECRET,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            mongoUrl: process.env.DB,
            touchAfter: 3600,
        }),
        cookie: {
            maxAge: 24 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: 'lax',
        },
    })
);


// API Routes
server.use('/api/auth', authRoutes)
server.use('/api/dashboard', dashboardRoutes)
server.use('/api/scanning', scanningRoutes)
server.use('/api/inventory', inventoryRoutes)
server.use('/api/freshness', freshnessRoutes)
server.use('/api/rescue', rescueRoutes)
server.use('/api/analytics', analyticsRoutes)
server.use('/api/icons', iconRoutes)



// async function to connect to DB
async function connectDB() {
    try {
        await mongoose.connect(process.env.DB, { serverSelectionTimeoutMS: 5000 })
        console.log("MongoDB connected successfully")
    }
    catch (error) {
        console.log("MongoDB connection failed:", error.message)
        process.exit(1)
    }
}

function startServer() {
    const hostname = "localhost";
    const port = 3000;

    server.listen(port, hostname, () => {
        console.log(`Full Circle API running at http://${hostname}:${port}/`);
    });

}
// Try connecting DB first before starting web server
connectDB().then(startServer)
