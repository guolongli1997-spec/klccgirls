// worker.js - Cloudflare Worker for Telegram Bot
// Deploy this to Cloudflare Workers

// Your bot token from environment variables
const BOT_TOKEN = '8571106564:AAEPU8Scs24zR2tE36KeBZWG-UrBPCVOlt0';
const CHANNEL_URL = 'https://t.me/+AEYJNkeLS0dhOTQ9';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Handle incoming requests
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle webhook from Telegram
    if (path === '/webhook') {
      if (request.method === 'POST') {
        const body = await request.json();
        await handleTelegramUpdate(body);
        return new Response('OK', { status: 200 });
      }
      return new Response('Method not allowed', { status: 405 });
    }

    // Serve your HTML page
    if (path === '/' || path === '/index.html') {
      const html = await getHTML();
      return new Response(html, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // API endpoint for bot info
    if (path === '/api/bot-info') {
      return new Response(JSON.stringify({
        username: '@bdescortservices_bot',
        status: 'online',
        channel: CHANNEL_URL,
        commands: ['/start', '/help', '/channel', '/about', '/status']
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not found', { status: 404 });
  }
};

// Handle Telegram updates
async function handleTelegramUpdate(update) {
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const text = msg.text || '';
    const firstName = msg.from.first_name || 'User';

    // Handle commands
    if (text === '/start') {
      await sendMessage(chatId, `
👋 Hello ${firstName}!

Welcome to BD ESCORT SERVICES Bot.

🔹 Use /help to see available commands
🔹 Use /channel to get our channel link
🔹 Use /about to learn more

We're here to assist you!
      `);
    }
    else if (text === '/help') {
      await sendMessage(chatId, `
📋 *Available Commands:*

/start - Welcome message
/help - Show this help
/channel - Get channel invite
/about - About this service
/status - Check bot status

Need assistance? Just type your message!
      `);
    }
    else if (text === '/channel') {
      await sendMessage(chatId, `
📢 *Join Our Official Channel*

Click the link below to join:
${CHANNEL_URL}

Stay updated with our latest services!
      `);
    }
    else if (text === '/about') {
      await sendMessage(chatId, `
ℹ️ *About BD ESCORT SERVICES*

We provide premium escort services in Bangladesh.
Professional, discreet, and reliable.

🔹 24/7 customer support
🔹 Verified profiles
🔹 Safe and secure

Contact us anytime!
      `);
    }
    else if (text === '/status') {
      const now = new Date().toISOString();
      await sendMessage(chatId, `
✅ *Bot Status: Online*

🕐 Server time: ${now}
👤 Your ID: ${msg.from.id}
📊 Active: Yes

All systems operational.
      `);
    }
    else if (!text.startsWith('/')) {
      // Auto-reply to any non-command message
      await sendMessage(chatId, `
📨 *Message received*, ${firstName}!

Your message: "${text}"

We'll get back to you shortly.
For immediate assistance, type /help for commands.
      `);
    }
  }
}

// Send message via Telegram API
async function sendMessage(chatId, text) {
  const url = `${TELEGRAM_API}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    })
  });
  
  if (!response.ok) {
    console.error('Failed to send message:', await response.text());
  }
  return response;
}

// Get HTML content (your complete HTML page)
async function getHTML() {
  // This is your full HTML content from previous responses
  // I've included a simplified version below
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BD ESCORT SERVICES</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
    <style>
        /* Add your full CSS here from previous responses */
        body { font-family: system-ui; background: #0b0b0b; color: #e8e8e8; }
        /* ... include all your styles ... */
    </style>
</head>
<body>
    <!-- Your full HTML content here -->
    <h1>BD ESCORT SERVICES</h1>
    <p>Welcome to our official Telegram bot.</p>
    <a href="${CHANNEL_URL}" target="_blank">Join our Channel</a>
    <!-- ... include all your sections ... -->
</body>
</html>`;
}