const mongoose = require('mongoose');

const ChatMetaSchema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // always admin
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },  // always user
  isFrozen: { type: Boolean, default: false },
  freezeAmount: { type: Number, default: null },
  frozenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // should be admin
  updatedAt: { type: Date, default: Date.now }
});

ChatMetaSchema.index({ admin: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('ChatMeta', ChatMetaSchema); 