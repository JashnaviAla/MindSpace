const mongoose = require('mongoose');
require('dotenv').config();

const localURI = 'mongodb://127.0.0.1:27017/mindspace';
const atlasURI = process.env.MONGODB_URI;

const migrateData = async () => {
  try {
    console.log('Connecting to Local MongoDB...');
    const localConn = await mongoose.createConnection(localURI).asPromise();
    console.log('✅ Local Connected');

    console.log('Connecting to Atlas Cloud...');
    const atlasConn = await mongoose.createConnection(atlasURI).asPromise();
    console.log('✅ Atlas Connected');

    const collections = ['users', 'moods', 'diaries'];

    for (const colName of collections) {
      console.log(`\nMigrating collection: ${colName}...`);
      const localCol = localConn.collection(colName);
      const atlasCol = atlasConn.collection(colName);

      const docs = await localCol.find({}).toArray();
      console.log(`Found ${docs.length} documents locally.`);

      if (docs.length === 0) continue;

      let count = 0;
      for (const doc of docs) {
        // Skip default admin to avoid duplicate key error if already seeded
        if (colName === 'users' && doc.username === 'admin') {
          console.log('- Skipping default admin user');
          continue;
        }

        try {
          await atlasCol.updateOne(
            { _id: doc._id },
            { $set: doc },
            { upsert: true }
          );
          count++;
        } catch (err) {
          console.error(`- Error migrating document ${doc._id}: ${err.message}`);
        }
      }
      console.log(`✅ Successfully migrated ${count} documents to ${colName}`);
    }

    console.log('\nMigration Complete! 🎉');
    
    await localConn.close();
    await atlasConn.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration Failed:', err.message);
    process.exit(1);
  }
};

migrateData();
