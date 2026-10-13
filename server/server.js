import express from 'express';
import session from 'express-session';
import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';
import dotenv from 'dotenv';
import cors from 'cors';

// Routes
import authRoutes from './routes/authRoutes.js'
import dashboardRoutes from './routes/dashboardRoutes.js'
import scanningRoutes from './routes/scanningRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js'
import freshnessRoutes from './routes/freshnessRoutes.js';
import rescueRoutes from './routes/rescueRoutes.js'
import analyticsRoutes from './routes/analyticsRoutes.js';

const server = express();
// Specify path to envrionment variable file 'config.env'
dotenv.config({ path: './config.env' })
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



// async function to connect to DB
async function connectDB() {
    try {
        await mongoose.connect(process.env.DB)
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

  