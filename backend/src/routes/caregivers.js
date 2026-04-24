// routes/caregivers.js
//
// Emergency caregiver management.
//
// Caregivers are notified by SMS at escalation Level 2 (T+30min, no donor found).
//
// Endpoints:
//   GET    /api/caregivers         — list my caregivers (ordered by priority)
//   POST   /api/caregivers         — add a caregiver (max 5)
//   DELETE /api/caregivers/:id     — remove a caregiver

const express        = require('express');
const Joi            = require('joi');
const prisma         = require('../config/prisma');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const caregiverSchema = Joi.object({
  name:     Joi.string().trim().min(2).max(100).required(),
  phone:    Joi.string().pattern(/^\+880[1-9]\d{8}$/).required().messages({
    'string.pattern.base': 'Phone must be a valid Bangladeshi number: +880XXXXXXXXXX',
  }),
  priority: Joi.number().integer().min(1).max(10).default(1),
});

// ─── GET /api/caregivers ──────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const caregivers = await prisma.caregiver.findMany({
      where:   { userId: req.user.id },
      orderBy: { priority: 'asc' },
    });
    res.json({ caregivers });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/caregivers ─────────────────────────────────────────────────────
// Body: { name, phone, priority? }
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = caregiverSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const count = await prisma.caregiver.count({ where: { userId: req.user.id } });
    if (count >= 5) {
      return res.status(400).json({ error: 'Maximum 5 caregivers allowed per account' });
    }

    const caregiver = await prisma.caregiver.create({
      data: {
        userId:   req.user.id,
        name:     value.name,
        phone:    value.phone,
        priority: value.priority,
      },
    });

    res.status(201).json({ caregiver });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/caregivers/:id ───────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const caregiver = await prisma.caregiver.findUnique({
      where: { id: req.params.id },
    });

    if (!caregiver) {
      return res.status(404).json({ error: 'Caregiver not found' });
    }

    if (caregiver.userId !== req.user.id) {
      return res.status(403).json({ error: 'You can only remove your own caregivers' });
    }

    await prisma.caregiver.delete({ where: { id: req.params.id } });
    res.json({ message: 'Caregiver removed' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
