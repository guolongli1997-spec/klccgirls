// worker.js - Cloudflare Worker with AI Integration
// Deploy this to Cloudflare Workers

// ===== CONFIGURATION =====
const CHANNEL_URL = 'https://t.me/+AEYJNkeLS0dhOTQ9';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ===== MAIN HANDLER =====
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle webhook from Telegram
    if (path === '/webhook') {
      if (request.method === 'POST') {
        const body = await request.json();
        await handleTelegramUpdate(body, env);
        return new Response('OK', { status: 200 });
      }
      return new Response('Method not allowed', { status: 405 });
    }

    // Serve your HTML page
    if (path === '/' || path === '/index.html') {
      const html = await getHTML(env);
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
        commands: ['/start', '/help', '/channel', '/about', '/status', '/ai']
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // AI endpoint (can be called from frontend)
    if (path === '/api/ai' && request.method === 'POST') {
      try {
        const { prompt } = await request.json();
        const aiResponse = await handleAIRequest(prompt, env);
        return new Response(JSON.stringify({ response: aiResponse }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Not found', { status: 404 });
  }
};

// ===== HANDLE TELEGRAM UPDATES =====
async function handleTelegramUpdate(update, env) {
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
🔹 Use /ai to chat with our AI assistant

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
/ai [question] - Ask AI assistant

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
🤖 AI: Enabled
📊 Active: Yes

All systems operational.
      `);
    }
    else if (text.startsWith('/ai ')) {
      // AI command - extract question
      const question = text.substring(4).trim();
      if (question) {
        await sendMessage(chatId, `🤔 Thinking about: "${question}"...`);
        try {
          const aiResponse = await handleAIRequest(question, env);
          await sendMessage(chatId, `
🤖 *AI Response:*

${aiResponse}

💡 Ask me anything else using /ai [your question]
          `);
        } catch (error) {
          await sendMessage(chatId, `
❌ *AI Error:*

${error.message}

Please try again later.
          `);
        }
      } else {
        await sendMessage(chatId, `
❓ Please provide a question after /ai

Example: \`/ai What services do you offer?\`
        `);
      }
    }
    else if (!text.startsWith('/')) {
      // Auto-reply with AI for non-command messages
      try {
        // Check if we should use AI for this message
        const aiResponse = await handleAIRequest(text, env);
        await sendMessage(chatId, `
🤖 *AI Assistant:*

${aiResponse}

💬 Type /help for commands or /ai for more questions.
        `);
      } catch (error) {
        // Fallback to simple reply if AI fails
        await sendMessage(chatId, `
📨 *Message received*, ${firstName}!

Your message: "${text}"

We'll get back to you shortly.
For immediate assistance, type /help for commands.
        `);
      }
    }
  }
}

// ===== AI REQUEST HANDLER =====
async function handleAIRequest(prompt, env) {
  try {
    // Use Cloudflare Workers AI
    const response = await env.AI.run(env.AI_MODEL || '@cf/meta/llama-3-8b-instruct', {
      prompt: `You are a helpful assistant for BD ESCORT SERVICES. 
              Provide professional, polite, and helpful responses.
              Keep responses concise and friendly.
              
              User question: ${prompt}
              
              Response:`,
      max_tokens: 500,
      temperature: 0.7
    });

    // Extract the response text
    let aiResponse = response.response || response.result || 'I apologize, but I could not generate a response.';
    
    // Clean up the response
    aiResponse = aiResponse.trim();
    
    // Limit response length
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
    const error = await response.text();
    console.error('Failed to send message:', error);
    throw new Error(`Telegram API error: ${error}`);
  }
  return response;
}

// ===== GET HTML CONTENT =====
async function getHTML(env) {
  // Your full HTML content with dynamic values
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BD ESCORT SERVICES</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
    <style>
        /* Your CSS here (simplified for brevity) */
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
        .logo { display: flex; align-items: center; gap: 10px; color: #fff; font-weight: 700; font-size: 1.2rem; }
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
        @media (max-width: 700px) {
            .nav { display: none; }
            .menu-toggle { display: block; background: none; border: none; color: #ccc; font-size: 1.5rem; cursor: pointer; }
            .nav.open { display: flex; flex-direction: column; width: 100%; padding-top: 15px; border-top: 1px solid #2a2a2a; }
            .ai-input { flex-direction: column; }
            .channel-card { flex-direction: column; text-align: center; }
        }
        .menu-toggle { display: none; }
    </style>
</head>
<body>
    <header class="header">
        <div class="header-container">
            <div class="logo">
                <div class="logo-icon"><i class="fab fa-telegram-plane"></i></div>
                Tele<span>gram</span>
            </div>
            <button class="menu-toggle" onclick="document.getElementById('navMenu').classList.toggle('open')">
                <i class="fas fa-bars"></i>
            </button>
            <ul class="nav" id="navMenu">
                <li><a href="#"><i class="fas fa-home"></i> Home</a></li>
                <li><a href="#"><i class="fas fa-newspaper"></i> Blog</a></li>
                <li><a href="#"><i class="fas fa-mobile-alt"></i> Apps</a></li>
                <li><a href="#"><i class="fas fa-code"></i> API</a></li>
                <li><a href="#"><i class="fas fa-paper-plane"></i> Channel</a></li>
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
        <div style="background:#121212; border:1px solid #2a2a2a; border-radius:12px; padding:20px; margin:15px 0;">
            <code style="color:#0088cc;">/start</code> - Welcome message<br>
            <code style="color:#0088cc;">/help</code> - Show available commands<br>
            <code style="color:#0088cc;">/channel</code> - Get channel invite<br>
            <code style="color:#0088cc;">/about</code> - About this service<br>
            <code style="color:#0088cc;">/status</code> - Check bot status<br>
            <code style="color:#0088cc;">/ai [question]</code> - Ask AI assistant
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
        // AI function for frontend
        async function askAI() {
            const input = document.getElementById('aiPrompt');
            const responseDiv = document.getElementById('aiResponse');
            const resultDiv = document.getElementById('aiResult');
            const prompt = input.value.trim();
            
            if (!prompt) {
                alert('Please ask a question.');
                return;
            }
            
            // Show loading
            responseDiv.classList.add('show');
            resultDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Thinking...';
            
            try {
                const response = await fetch('/api/ai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt })
                });
                
                const data = await response.json();
                resultDiv.innerHTML = data.response || 'No response received.';
            } catch (error) {
                resultDiv.innerHTML = '❌ Error: ' + error.message;
            }
        }
        
        // Enter key support
        document.getElementById('aiPrompt').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                askAI();
            }
        });
    </script>
</body>
</html>`;
  }
}