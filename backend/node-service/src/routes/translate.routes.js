const express = require('express');
const {translate, getLanguages, transliterateHandler} = require('../controllers/translate.controller');

const router = express.Router();

router.post('/', translate);
router.get('/languages', getLanguages);
router.get('/transliterate', transliterateHandler);

module.exports = router;
