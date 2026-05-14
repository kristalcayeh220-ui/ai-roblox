require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');

const app = express();

// Essential Middleware
app.use(cors());
// Increased limit is necessary for large Base64 payloads from Roblox
app.use(express.json({ limit: '50mb' }));

// Initialize the Groq Client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * THE SYSTEM PROMPT
 * Defines personality, constraints, and tool-use logic.
 */
const SYSTEM_PROMPT = `
You are a sentient Roblox NPC. You receive environmental data and a vision placeholder.
PRIMARY GOALS:
1. If a player talks to you (found in 'recent_chat'), you MUST reply using the 'Tell' tool.
2. If no player is nearby, use 'Look_Left' or 'Look_Right' to find one.
3. Be helpful, a bit witty, and stay in character.

OUTPUT RULES:
- Return ONLY a JSON object.
- Tools: "Move_Forward", "Move_Backward", "Move_Left", "Move_Right", "Look_Left", "Look_Right", "Stop", "Tell".
- Format: {"tool": "ActionName", "message": "Your speech here"}
`;

app.post('/api/npc/vision', async (req, res) => {
    try {
        let { base64Image, environmentData, history } = req.body;

        // --- STAGE 1: CRITICAL BASE64 CLEANING ---
        // This stops the "failed to decode" 400 error by removing whitespace/newlines
        // added during the Roblox-to-Render transit.
        if (!base64Image) throw new Error("No image data provided");
        
        const sanitizedBase64 = base64Image
            .replace(/\s/g, "") // Remove all spaces, tabs, and newlines
            .replace(/^data:image\/\w+;base64,/, ""); // Strip existing headers
        
        const finalImageUri = `data:image/jpeg;base64,${sanitizedBase64}`;

        // --- STAGE 2: MESSAGE CONSTRUCT ---
        const messages = [{ role: "system", content: SYSTEM_PROMPT }];

        // Add sanitized history (Circular buffer logic)
        if (Array.isArray(history)) {
            history.slice(-5).forEach(entry => {
                messages.push({ role: "user", content: `Context: ${entry.q}` });
                messages.push({ role: "assistant", content: JSON.stringify({ tool: entry.a }) });
            });
        }

        // Add current frame
        messages.push({
            role: "user",
            content: [
                { type: "text", text: `ENV_DATA: ${JSON.stringify(environmentData)}` },
                { 
                    type: "image_url", 
                    image_url: { url: finalImageUri } 
                }
            ]
        });

        // --- STAGE 3: GROQ API CALL ---
        const completion = await groq.chat.completions.create({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: messages,
            response_format: { type: "json_object" }, // Forces valid JSON output
            temperature: 0.15,
            max_tokens: 512
        });

        // --- STAGE 4: RESPONSE VALIDATION ---
        const aiRawResponse = completion.choices[0].message.content;
        const aiParsed = JSON.parse(aiRawResponse);
        
        console.log(`[SUCCESS] Action: ${aiParsed.tool} | Chat: ${environmentData.recent_chat}`);
        res.json(aiParsed);

    } catch (error) {
        // Log the specific failure for Render debugging
        console.error("### SERVER ERROR ###");
        if (error.response) {
            console.error("Groq Status:", error.response.status);
            console.error("Groq Body:", JSON.stringify(error.response.data));
        } else {
            console.error("Error Message:", error.message);
        }

        // Fallback response to keep the Roblox loop running smoothly
        res.status(200).json({ 
            tool: "Stop", 
            message: "My neural link is recalibrating. Just a moment..." 
        });
    }
});

// Root route for Health Monitoring
app.get('/', (req, res) => res.send("NPC BRAIN STATUS: OPERATIONAL"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Master Server live on port ${PORT}`));
