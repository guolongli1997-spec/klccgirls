// worker.js - Cloudflare Worker with AI Integration
// Deploy this to Cloudflare Workers

// ===== CONFIGURATION =====
// These will be overridden by env vars from wrangler.jsonc
const DEFAULT_CHANNEL_URL = 'https://t.me/+AEYJNkeLS0dhOTQ9';
const DEFAULT_AI_MODEL = '@cf/meta/llama-3-8b-instruct';

// ===== MAIN HANDLER =====
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Get config from env
    const CHANNEL_URL = env.CHANNEL_URL || DEFAULT_CHANNEL_URL;
    const AI_MODEL = env.AI_MODEL || DEFAULT_AI_MODEL;
    const BOT_TOKEN = env.BOT_TOKEN;

    // Validate BOT_TOKEN
    if (!BOT_TOKEN) {
      console.error('❌ BOT_TOKEN is not set in environment variables');
      return new Response('Bot token not configured', { status: 500 });
    }

    const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Handle webhook from Telegram
    if (path === '/webhook') {
      if (request.method === 'POST') {
        try {
          const body = await request.json();
          await handleTelegramUpdate(body, env, { BOT_TOKEN, CHANNEL_URL, AI_MODEL });
          return new Response('OK', { status: 200, headers: corsHeaders });
        } catch (error) {
          console.error('Webhook error:', error);
          return new Response('Error processing webhook', { status: 500 });
        }
      }
      return new Response('Method not allowed', { status: 405 });
    }

    // Serve your HTML page
    if (path === '/' || path === '/index.html') {
      const html = await getHTML(env, { CHANNEL_URL });
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
        ai_enabled: true,
        ai_model: AI_MODEL,
        commands: ['/start', '/help', '/channel', '/about', '/status', '/ai']
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // AI endpoint (can be called from frontend)
    if (path === '/api/ai' && request.method === 'POST') {
      try {
        const { prompt } = await request.json();
        const aiResponse = await handleAIRequest(prompt, env, { AI_MODEL });
        return new Response(JSON.stringify({ 
          success: true,
          response: aiResponse 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ 
          success: false,
          error: error.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Upload to R2 endpoint
    if (path === '/api/upload' && request.method === 'POST') {
      try {
        const formData = await request.formData();
        const file = formData.get('file');
        const filename = formData.get('filename') || Date.now().toString();
        
        if (!file) {
          return new Response(JSON.stringify({ error: 'No file provided' }), {
            status: 400,
            headers: corsHeaders
          });
        }

        await env.BUCKET.put(filename, file, {
          httpMetadata: { contentType: file.type || 'application/octet-stream' }
        });

        const fileUrl = `https://telegram-bot-assets.r2.cloudflarestorage.com/${filename}`;

        return new Response(JSON.stringify({ 
          success: true, 
          url: fileUrl,
          filename: filename 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: corsHeaders
        });
      }
    }

    return new Response('Not found', { status: 404 });
  }
};

// ===== HANDLE TELEGRAM UPDATES =====
async function handleTelegramUpdate(update, env, config) {
  if (!update.message) return;
  
  const msg = update.message;
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const firstName = msg.from.first_name || 'User';
  const { CHANNEL_URL } = config;

  // Command handlers
  const commands = {
    '/start': () => `
👋 Hello ${firstName}!

Welcome to BD ESCORT SERVICES Bot.

🔹 Use /help to see available commands
🔹 Use /channel to get our channel link
🔹 Use /about to learn more
🔹 Use /ai [question] to chat with our AI assistant

We're here to assist you!`,

    '/help': () => `
📋 *Available Commands:*

/start - Welcome message
/help - Show this help
/channel - Get channel invite
/about - About this service
/status - Check bot status
/ai [question] - Ask AI assistant

Need assistance? Just type your message!`,

    '/channel': () => `
📢 *Join Our Official Channel*

Click the link below to join:
${CHANNEL_URL}

Stay updated with our latest services!`,

    '/about': () => `
ℹ️ *About BD ESCORT SERVICES*

We provide premium escort services in Bangladesh.
Professional, discreet, and reliable.

🔹 24/7 customer support
🔹 Verified profiles
🔹 Safe and secure

Contact us anytime!`,

    '/status': () => {
      const now = new Date().toISOString();
      return `
✅ *Bot Status: Online*

🕐 Server time: ${now}
👤 Your ID: ${msg.from.id}
🤖 AI: Enabled
📊 Active: Yes

All systems operational.`;
    }
  };

  // Check for commands
  if (commands[text]) {
    await sendMessage(chatId, commands[text](), config.BOT_TOKEN);
    return;
  }

  // AI command: /ai [question]
  if (text.startsWith('/ai ')) {
    const question = text.substring(4).trim();
    if (question) {
      await sendMessage(chatId, `🤔 Thinking about: "${question}"...`, config.BOT_TOKEN);
      try {
        const aiResponse = await handleAIRequest(question, env, config);
        await sendMessage(chatId, `
🤖 *AI Response:*

${aiResponse}

💡 Ask me anything else using /ai [your question]`, config.BOT_TOKEN);
      } catch (error) {
        await sendMessage(chatId, `
❌ *AI Error:*

${error.message}

Please try again later.`, config.BOT_TOKEN);
      }
    } else {
      await sendMessage(chatId, `
❓ Please provide a question after /ai

Example: \`/ai What services do you offer?\``, config.BOT_TOKEN);
    }
    return;
  }

  // Auto-reply with AI for non-command messages
  if (!text.startsWith('/')) {
    try {
      const aiResponse = await handleAIRequest(text, env, config);
      await sendMessage(chatId, `
🤖 *AI Assistant:*

${aiResponse}

💬 Type /help for commands or /ai for more questions.`, config.BOT_TOKEN);
    } catch (error) {
      // Fallback to simple reply if AI fails
      await sendMessage(chatId, `
📨 *Message received*, ${firstName}!

Your message: "${text}"

We'll get back to you shortly.
For immediate assistance, type /help for commands.`, config.BOT_TOKEN);
    }
  }
}

// ===== AI REQUEST HANDLER =====
async function handleAIRequest(prompt, env, config) {
  try {
    const AI_MODEL = config.AI_MODEL || '@cf/meta/llama-3-8b-instruct';
    
    const response = await env.AI.run(AI_MODEL, {
      prompt: `You are a helpful assistant for BD ESCORT SERVICES. 
              Provide professional, polite, and helpful responses.
              Keep responses concise and friendly (max 200 words).
              
              User question: ${prompt}
              
              Response:`,
      max_tokens: 500,
      temperature: 0.7
    });

    let aiResponse = response.response || response.result || 'I apologize, but I could not generate a response.';
    aiResponse = aiResponse.trim();
    
    if (aiResponse.length > 1000) {
      aiResponse = aiResponse.substring(0, 997) + '...';
    }
    
    return aiResponse;
  } catch (error) {
    console.error('AI Error:', error);
    throw new Error('AI service temporarily unavailable. Please try again later.');
  }
}

// ===== SEND MESSAGE VIA TELEGRAM API =====
async function sendMessage(chatId, text, botToken) {
  if (!botToken) {
    console.error('❌ BOT_TOKEN not provided for sendMessage');
    return;
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
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
    const error = await response.text();
    console.error('Failed to send message:', error);
    throw new Error(`Telegram API error: ${error}`);
  }
  return response;
}

// ===== GET HTML CONTENT =====
async function getHTML(env, config) {
  const CHANNEL_URL = config.CHANNEL_URL || 'https://t.me/+AEYJNkeLS0dhOTQ9';
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes">
  <title>BD ESCORT SERVICES</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0b0b0b; 
      color: #e8e8e8; 
      line-height: 1.6;
      min-height: 100vh;
    }
    .container { max-width: 780px; margin: 0 auto; padding: 30px 20px; }
    .header { 
      background: rgba(11,11,11,0.85); 
      backdrop-filter: blur(6px);
      border-bottom: 1px solid #2a2a2a;
      padding: 12px 20px;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .header-container {
      max-width: 1300px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .logo { display: flex; align-items: center; gap: 10px; color: #fff; font-weight: 700; font-size: 1.2rem; text-decoration: none; }
    .logo-icon { 
      width: 34px; height: 34px; 
      background: #0088cc; 
      border-radius: 50%; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      color: white; 
    }
    .logo span { color: #0088cc; }
    .nav { display: flex; gap: 28px; list-style: none; }
    .nav a { color: #ccc; text-decoration: none; transition: color 0.2s; }
    .nav a:hover { color: #0088cc; }
    h1 { font-size: 2.2rem; font-weight: 700; margin-bottom: 20px; color: #fff; }
    .channel-card {
      background: linear-gradient(145deg, #121212, #1a1a1a);
      border: 1px solid #2a2a2a;
      border-radius: 20px;
      padding: 30px 35px;
      margin: 30px 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 20px;
    }
    .btn-channel {
      background: #0088cc;
      color: white;
      padding: 12px 30px;
      border-radius: 30px;
      text-decoration: none;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      transition: all 0.2s;
    }
    .btn-channel:hover { background: #0077b3; transform: translateY(-2px); }
    .ai-section {
      background: #121212;
      border: 1px solid #2a2a2a;
      border-radius: 20px;
      padding: 30px;
      margin: 30px 0;
    }
    .ai-input {
      display: flex;
      gap: 10px;
      margin-top: 15px;
    }
    .ai-input input {
      flex: 1;
      padding: 12px 18px;
      border-radius: 30px;
      border: 1px solid #2a2a2a;
      background: #1a1a1a;
      color: #e8e8e8;
      outline: none;
      font-size: 1rem;
    }
    .ai-input input:focus { border-color: #0088cc; }
    .ai-input button {
      padding: 12px 28px;
      border-radius: 30px;
      border: none;
      background: #0088cc;
      color: white;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .ai-input button:hover { background: #0077b3; }
    .ai-response {
      margin-top: 20px;
      padding: 20px;
      background: #1a1a1a;
      border-radius: 12px;
      border-left: 4px solid #0088cc;
      display: none;
    }
    .ai-response.show { display: block; }
    .commands-box {
      background: #121212;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      padding: 20px;
      margin: 15px 0;
    }
    .commands-box code { color: #0088cc; }
    .footer {
      border-top: 1px solid #2a2a2a;
      margin-top: 50px;
      padding: 40px 20px;
      background: #0d0d0d;
    }
    .footer-grid {
      max-width: 1300px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 40px;
    }
    .footer-col h4 { color: #fff; margin-bottom: 16px; }
    .footer-col p, .footer-col a { color: #aaa; line-height: 1.8; text-decoration: none; display: block; }
    .footer-col a:hover { color: #0088cc; }
    .social-links { display: flex; gap: 14px; margin-top: 12px; flex-wrap: wrap; }
    .social-links a {
      width: 38px; height: 38px;
      border-radius: 50%;
      background: #1a1a1a;
      color: #ccc;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      border: 1px solid #2a2a2a;
    }
    .social-links a:hover { background: #0088cc; color: #fff; transform: translateY(-3px); }
    .footer-bottom { max-width: 1300px; margin: 30px auto 0; padding-top: 20px; border-top: 1px solid #2a2a2a; text-align: center; color: #666; font-size: 0.85rem; }
    .menu-toggle { display: none; background: none; border: none; color: #ccc; font-size: 1.5rem; cursor: pointer; }
    
    @media (max-width: 700px) {
      .nav { display: none; }
      .menu-toggle { display: block; }
      .nav.open { display: flex; flex-direction: column; width: 100%; padding-top: 15px; border-top: 1px solid #2a2a2a; }
      .ai-input { flex-direction: column; }
      .channel-card { flex-direction: column; text-align: center; }
      h1 { font-size: 1.6rem; }
      .container { padding: 20px 16px; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-container">
      <a href="/" class="logo">
        <div class="logo-icon"><i class="fab fa-telegram-plane"></i></div>
        Tele<span>gram</span>
      </a>
      <button class="menu-toggle" onclick="document.getElementById('navMenu').classList.toggle('open')">
        <i class="fas fa-bars"></i>
      </button>
      <ul class="nav" id="navMenu">
        <li><a href="/"><i class="fas fa-home"></i> Home</a></li>
        <li><a href="#"><i class="fas fa-newspaper"></i> Blog</a></li>
        <li><a href="#"><i class="fas fa-mobile-alt"></i> Apps</a></li>
        <li><a href="#"><i class="fas fa-code"></i> API</a></li>
        <li><a href="${CHANNEL_URL}" target="_blank"><i class="fas fa-paper-plane"></i> Channel</a></li>
      </ul>
    </div>
  </header>

  <div class="container">
    <h1>BD ESCORT SERVICES</h1>
    <p>Welcome to the official BD ESCORT SERVICES Telegram Bot. We provide premium escort services in Bangladesh.</p>

    <!-- Channel Section -->
    <div class="channel-card">
      <div>
        <h3 style="color:#fff;">📢 Join Our Channel</h3>
        <p style="color:#aaa;">@bdescortservices_bot • Official Channel</p>
      </div>
      <a href="${CHANNEL_URL}" target="_blank" class="btn-channel">
        <i class="fab fa-telegram-plane"></i> Join Channel
      </a>
    </div>

    <!-- AI Assistant Section -->
    <div class="ai-section">
      <h3 style="color:#fff;"><i class="fas fa-robot" style="color:#0088cc;"></i> AI Assistant</h3>
      <p style="color:#aaa;">Ask anything about our services or just chat with our AI.</p>
      <div class="ai-input">
        <input type="text" id="aiPrompt" placeholder="Ask me anything..." />
        <button onclick="askAI()"><i class="fas fa-paper-plane"></i> Ask AI</button>
      </div>
      <div class="ai-response" id="aiResponse">
        <div id="aiResult"></div>
      </div>
    </div>

    <!-- Bot Commands -->
    <h2 style="color:#fff; margin-top:40px;">🤖 Bot Commands</h2>
    <div class="commands-box">
      <code>/start</code> - Welcome message<br>
      <code>/help</code> - Show available commands<br>
      <code>/channel</code> - Get channel invite<br>
      <code>/about</code> - About this service<br>
      <code>/status</code> - Check bot status<br>
      <code>/ai [question]</code> - Ask AI assistant
    </div>
  </div>

  <footer class="footer">
    <div class="footer-grid">
      <div class="footer-col">
        <h4><i class="fas fa-building" style="color:#0088cc;"></i> Company</h4>
        <p>BD ESCORT SERVICES</p>
        <p>Dhaka, Bangladesh</p>
        <p>&copy; 2026</p>
      </div>
      <div class="footer-col">
        <h4><i class="fas fa-link" style="color:#0088cc;"></i> Quick Links</h4>
        <a href="#"><i class="fas fa-chevron-right" style="font-size:0.6rem;"></i> About Us</a>
        <a href="#"><i class="fas fa-chevron-right" style="font-size:0.6rem;"></i> Services</a>
        <a href="#"><i class="fas fa-chevron-right" style="font-size:0.6rem;"></i> Contact</a>
      </div>
      <div class="footer-col">
        <h4><i class="fas fa-phone" style="color:#0088cc;"></i> Contact</h4>
        <p><i class="fas fa-envelope" style="width:20px;"></i> info@bdescort.com</p>
        <p><i class="fas fa-phone-alt" style="width:20px;"></i> +880 1711-123456</p>
        <p><i class="fas fa-map-marker-alt" style="width:20px;"></i> Dhaka, Bangladesh</p>
      </div>
      <div class="footer-col">
        <h4><i class="fas fa-share-alt" style="color:#0088cc;"></i> Social</h4>
        <div class="social-links">
          <a href="#"><i class="fab fa-facebook-f"></i></a>
          <a href="#"><i class="fab fa-instagram"></i></a>
          <a href="#"><i class="fab fa-telegram-plane"></i></a>
          <a href="#"><i class="fab fa-whatsapp"></i></a>
        </div>
        <p style="margin-top:14px;"><i class="fas fa-hashtag" style="color:#0088cc;"></i> #BDESCORT</p>
      </div>
    </div>
    <div class="footer-bottom">
      <p>Built with <i class="fas fa-heart" style="color:#d32f2f;"></i> for the Telegram community. All rights reserved.</p>
    </div>
  </footer>

  <script>
    async function askAI() {
      const input = document.getElementById('aiPrompt');
      const responseDiv = document.getElementById('aiResponse');
      const resultDiv = document.getElementById('aiResult');
      const prompt = input.value.trim();
      
      if (!prompt) {
        alert('Please ask a question.');
        return;
      }
      
      responseDiv.classList.add('show');
      resultDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Thinking...';
      
      try {
        const response = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt })
        });
        
        const data = await response.json();
        resultDiv.innerHTML = data.success ? data.response : '❌ Error: ' + data.error;
      } catch (error) {
        resultDiv.innerHTML = '❌ Error: ' + error.message;
      }
    }
    
    document.getElementById('aiPrompt').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        askAI();
      }
    });
  </script>
</body>
</html>`;
}