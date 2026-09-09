const Theme = require('../models/Theme');

async function listThemes(req, res) {
  const themes = await Theme.find({owner: req.user.sub});
  res.json({themes});
}

async function createTheme(req, res) {
  const {name, keyBackground, keyPressedBackground, keyText, panelBackground, accent, isDark} = req.body;
  if (!name || !keyBackground || !keyText || !panelBackground || !accent) {
    return res.status(400).json({error: 'Missing required theme fields'});
  }

  const theme = await Theme.create({
    owner: req.user.sub,
    name,
    keyBackground,
    keyPressedBackground: keyPressedBackground || keyBackground,
    keyText,
    panelBackground,
    accent,
    isDark: Boolean(isDark),
  });

  res.status(201).json({theme});
}

async function deleteTheme(req, res) {
  const {id} = req.params;
  const result = await Theme.deleteOne({_id: id, owner: req.user.sub});
  if (result.deletedCount === 0) {
    return res.status(404).json({error: 'Theme not found'});
  }
  res.status(204).send();
}

module.exports = {listThemes, createTheme, deleteTheme};
