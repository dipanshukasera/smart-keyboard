const express = require('express');
const {requireAuth} = require('../middleware/auth');
const {listThemes, createTheme, deleteTheme} = require('../controllers/theme.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/', listThemes);
router.post('/', createTheme);
router.delete('/:id', deleteTheme);

module.exports = router;
