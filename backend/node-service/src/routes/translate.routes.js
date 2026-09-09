const express = require('express');
const {translate} = require('../controllers/translate.controller');

const router = express.Router();

router.post('/', translate);

module.exports = router;
