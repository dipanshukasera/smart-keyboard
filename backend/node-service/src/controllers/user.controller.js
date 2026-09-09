const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function register(req, res) {
  const {email, password} = req.body;
  if (!email || !password) {
    return res.status(400).json({error: '"email" and "password" are required'});
  }

  const existing = await User.findOne({email: email.toLowerCase()});
  if (existing) {
    return res.status(409).json({error: 'An account with that email already exists'});
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({email, passwordHash});

  const token = jwt.sign({sub: user._id.toString()}, process.env.JWT_SECRET, {expiresIn: '30d'});
  res.status(201).json({token});
}

async function login(req, res) {
  const {email, password} = req.body;
  if (!email || !password) {
    return res.status(400).json({error: '"email" and "password" are required'});
  }

  const user = await User.findOne({email: email.toLowerCase()});
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({error: 'Invalid email or password'});
  }

  const token = jwt.sign({sub: user._id.toString()}, process.env.JWT_SECRET, {expiresIn: '30d'});
  res.json({token});
}

async function me(req, res) {
  const user = await User.findById(req.user.sub).select('-passwordHash');
  if (!user) {
    return res.status(404).json({error: 'User not found'});
  }
  res.json({user});
}

module.exports = {register, login, me};
