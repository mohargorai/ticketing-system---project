const mongoose = require('mongoose');
const Event = require('./models/Event');
const Seat = require('./models/Seat');

async function wipe() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");
    await Event.deleteMany({});
    console.log("Wiped all Events.");
    await Seat.deleteMany({});
    console.log("Wiped all Seats.");
    mongoose.disconnect();
    console.log("Done.");
}

wipe().catch(console.error);
