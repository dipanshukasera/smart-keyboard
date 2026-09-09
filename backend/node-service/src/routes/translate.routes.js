const express = require('express');
const {translate, getLanguages} = require('../controllers/translate.controller');

const router = express.Router();

router.post('/', translate);
router.get('/languages', getLanguages);

module.exports = router;
