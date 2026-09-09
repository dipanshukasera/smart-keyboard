const mongoose = require('mongoose');

const stickerPackSchema = new mongoose.Schema(
  {
    name: {type: String, required: true},
    stickerUrls: {type: [String], default: []},
    isDefault: {type: Boolean, default: false},
  },
  {timestamps: true},
);

module.exports = mongoose.model('StickerPack', stickerPackSchema);
