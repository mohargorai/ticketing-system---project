const mongoose = require('mongoose');

const seatSchema = new mongoose.Schema({
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    seatId: { type: String, required: true }, 
    bookingDate: { type: String, required: true }, 
    timeSlot: { type: String, required: true },
    status: { type: String, enum: ['Available', 'Locked', 'Booked'], default: 'Available' },
    bookedBy: { type: String, default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lockedAt: { type: Date, default: null }
});

// 🚨 FIXED: Compound Index now allows the SAME seat on the SAME date to be booked at DIFFERENT times
seatSchema.index({ eventId: 1, locationId: 1, seatId: 1, bookingDate: 1, timeSlot: 1 }, { unique: true });

// 🚨 FIXED: Performance Indexes for rapid querying
seatSchema.index({ eventId: 1, locationId: 1, bookingDate: 1, timeSlot: 1 });
seatSchema.index({ userId: 1 });

module.exports = mongoose.model('Seat', seatSchema);
