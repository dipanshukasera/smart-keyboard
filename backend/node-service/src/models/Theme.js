const mongoose = require('mongoose');

const themeSchema = new mongoose.Schema(
  {
    owner: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    name: {type: String, required: true},
    keyBackground: {type: String, required: true},
    keyPressedBackground: {type: String, required: true},
    keyText: {type: String, required: true},
    panelBackground: {type: String, required: true},
    accent: {type: String, required: true},
    isDark: {type: Boolean, default: false},
  },
  {timestamps: true},
);

module.exports = mongoose.model('Theme', themeSchema);
