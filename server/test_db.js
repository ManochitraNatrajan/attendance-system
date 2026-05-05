import mongoose from 'mongoose';
import 'dotenv/config';

async function testConnection() {
    console.log("Testing connection to:", process.env.MONGODB_URI?.substring(0, 30) + "...");
    try {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
        console.log("SUCCESS: Connected to MongoDB!");
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log("Found collections:", collections.map(c => c.name));
        await mongoose.disconnect();
    } catch (err) {
        console.error("FAILURE: Could not connect to MongoDB.");
        console.error("Error Detail:", err.message);
    }
}

testConnection();
