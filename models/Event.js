const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
    venueName: { type: String, required: true },
    city: { type: String, required: true },
    lat: { type: Number },
    lon: { type: Number },
    capacity: { type: Number, required: true },
    price: { type: Number, required: true, default: 0 }, 
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    timeSlots: [{ type: String }],
});

const eventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, default: '' },
    ageLimit: { type: Number, default: 0 }, 
    eventType: { type: String, enum: ['Seated', 'General'], required: true },
    category: { type: String, enum: ['Movie', 'Concert', 'Sports', 'Theater'], default: 'Movie' },
    imageUrl: { type: String, default: '' }, 
    ticketsSold: { type: Number, default: 0 }, 
    locations: [locationSchema],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Event', eventSchema);
