import mongoose from 'mongoose';

const OLD_URI = "mongodb://admin:LZZj6tyT1Cql3adM@ac-gfex0ly-shard-00-00.jybqiep.mongodb.net:27017,ac-gfex0ly-shard-00-01.jybqiep.mongodb.net:27017,ac-gfex0ly-shard-00-02.jybqiep.mongodb.net:27017/attendance_system?ssl=true&replicaSet=atlas-125t4v-shard-0&authSource=admin&retryWrites=true&w=majority";
const NEW_URI = "mongodb://manochitra:Manopuvin@ac-4jgajef-shard-00-00.d9zpuwi.mongodb.net:27017,ac-4jgajef-shard-00-01.d9zpuwi.mongodb.net:27017,ac-4jgajef-shard-00-02.d9zpuwi.mongodb.net:27017/attendance_system?ssl=true&authSource=admin&retryWrites=true&w=majority";

// Minimal schemas to fetch and insert all data (using strict: false to copy everything as is)
const createModels = (connection) => {
  return {
    Employee: connection.model('Employee', new mongoose.Schema({}, { strict: false })),
    Attendance: connection.model('Attendance', new mongoose.Schema({}, { strict: false })),
    SalaryHistory: connection.model('SalaryHistory', new mongoose.Schema({}, { strict: false })),
    SalaryArchive: connection.model('SalaryArchive', new mongoose.Schema({}, { strict: false })),
    GeofenceZone: connection.model('GeofenceZone', new mongoose.Schema({}, { strict: false }))
  };
};

async function migrateData() {
  let oldConnection;
  let newConnection;
  try {
    console.log('Connecting to OLD database...');
    oldConnection = await mongoose.createConnection(OLD_URI).asPromise();
    console.log('Connected to OLD database.');

    console.log('Connecting to NEW database...');
    newConnection = await mongoose.createConnection(NEW_URI).asPromise();
    console.log('Connected to NEW database.');

    const oldModels = createModels(oldConnection);
    const newModels = createModels(newConnection);

    const collections = Object.keys(oldModels);

    for (const collectionName of collections) {
      console.log(`\nMigrating collection: ${collectionName}...`);
      const oldModel = oldModels[collectionName];
      const newModel = newModels[collectionName];

      const data = await oldModel.find().lean();
      console.log(`Found ${data.length} records in old database.`);

      if (data.length > 0) {
        // Clear existing data in the new database for this collection to avoid duplicates during test runs
        await newModel.deleteMany({});
        
        await newModel.insertMany(data);
        console.log(`Successfully inserted ${data.length} records into new database.`);
      } else {
        console.log('No records to migrate.');
      }
    }

    console.log('\n--- Migration completed successfully! ---');
  } catch (err) {
    console.error('Error during migration:', err);
  } finally {
    if (oldConnection) await oldConnection.close();
    if (newConnection) await newConnection.close();
    process.exit(0);
  }
}

migrateData();
