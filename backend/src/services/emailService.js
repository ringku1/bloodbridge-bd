// services/emailService.js
//
// Thin wrapper around email sending via Gmail SMTP (nodemailer).
//
// In development (USE_MOCK_EMAIL=true in .env):
//   Prints the email to the server console — no real email sent.
//
// In production (USE_MOCK_EMAIL=false):
//   Sends via Gmail SMTP using an App Password.
//   Generate one at https://myaccount.google.com/apppasswords (2FA required).

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return transporter;
}

async function send(to, subject, html) {
  if (process.env.USE_MOCK_EMAIL === 'true') {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[EMAIL MOCK] To     :', to);
    console.log('[EMAIL MOCK] Subject:', subject);
    console.log('[EMAIL MOCK] Body   :', html.replace(/<[^>]+>/g, ' ').trim());
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return { mock: true };
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.error('[EMAIL] GMAIL_USER or GMAIL_APP_PASSWORD not set — cannot send email');
    return;
  }

  try {
    return await getTransporter().sendMail({
      from: `Blood Bridge <${process.env.GMAIL_USER}>`,
      to, subject, html,
    });
  } catch (err) {
    console.error('[EMAIL] Send failed:', err.message);
    throw err;
  }
}

async function sendOtp(to, code, purpose) {
  const label = {
    verify:          'verify your email',
    change_email:    'confirm your new email',
    change_password: 'change your password',
  }[purpose] || 'confirm this action';

  const html = `
    <p>Hi,</p>
    <p>Use this code to ${label}:</p>
    <p style="font-size:28px;font-weight:700;letter-spacing:4px;">${code}</p>
    <p>This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p>
    <p>— Blood Bridge</p>
  `;
  return send(to, `Your Blood Bridge code: ${code}`, html);
}

async function sendPasswordReset(to, link) {
  const html = `
    <p>Hi,</p>
    <p>Someone (hopefully you) asked to reset your Blood Bridge password.</p>
    <p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#DC2626;color:#fff;text-decoration:none;border-radius:6px;">Reset password</a></p>
    <p>Or copy this link: ${link}</p>
    <p>This link expires in 30 minutes. If you didn't request it, you can safely ignore this email — your password will stay the same.</p>
    <p>— Blood Bridge</p>
  `;
  return send(to, 'Reset your Blood Bridge password', html);
}

module.exports = { send, sendOtp, sendPasswordReset };
