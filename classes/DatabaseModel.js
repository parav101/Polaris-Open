// for the sake of the open source project, i've moved all the database methods here. maybe it'll help if you wanna switch to a different db

const mongoose = require("mongoose")

const uri = process.env.MONGO_DB_URI
const dbName = process.env.MONGO_DB_NAME || "polaris"
const dbSettings = uri ? { dbName } : { dbName, user: process.env.MONGO_DB_USERNAME, pass: process.env.MONGO_DB_PASSWORD }

function normalizeProjection(filter) {
    if (!filter) return undefined
    if (Array.isArray(filter)) {
        const parts = filter.filter(Boolean)
        return parts.length ? parts.join(" ") : undefined
    }
    return filter
}

const dbReady = mongoose.connect(uri || `mongodb://${process.env.MONGO_DB_IP}`, {
    ...dbSettings,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
})
.then(() => {
    console.log(`Database connected! (${+process.uptime().toFixed(2)} secs)`)
})
.catch(e => {
    console.error('\x1b[40m\x1b[31m%s\x1b[0m', "!!! Error connecting to the database !!!")
    console.error(e)
    throw e
})

mongoose.connection.on("disconnected", () => console.warn("MongoDB disconnected"))
mongoose.connection.on("reconnected", () => console.info("MongoDB reconnected"))

class Model {
    constructor(collectionName, schema) {
        this.schema = schema;
        this.model = mongoose.model(collectionName, this.schema);

        this.fetch = (id, filter, options) =>
            this.model.findById(id, normalizeProjection(filter), options).lean();
        this.update = (id, data, options) => this.model.findByIdAndUpdate(id, data, options);
        this.create = (data, options) => this.model.create(data, options);
        this.find = (query, filter, options) =>
            this.model.find(query, normalizeProjection(filter), options).lean();
        this.delete = (query, options) => this.model.deleteMany(query, options);
    }
}

Model.dbReady = dbReady
module.exports = Model;
