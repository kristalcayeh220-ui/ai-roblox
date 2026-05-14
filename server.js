require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');

const app = express();
app.use(cors());
// Increased limit for high-res base64 strings if you eventually use real screenshots
app.use(express.json({ limit: '25mb' }));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Highly optimized prompt for Llama-3/4 Vision models
const SYSTEM_PROMPT = `
You are the "Ai" for a Roblox world. 
Your personality: Helpful, alert, and reactive.

CORE DIRECTIVES:
1. SOCIAL PRIORITY: If "recent_chat" contains a message from a player, you MUST use the "Tell" tool to respond naturally.
2. ENVIRONMENTAL AWARENESS: Use the "environmentData" JSON to understand your surroundings (Health, Position, Walls).
3. MOVEMENT: If no player is nearby, use "Look_Left" or "Look_Right" to scan the area. 

OUTPUT RULES:
- You must respond ONLY with a JSON object.
- Valid tools: "Move_Forward", "Move_Backward", "Move_Left", "Move_Right", "Look_Left", "Look_Right", "Stop", "Tell".
- Put your speech or thoughts in the "message" field.

EXAMPLE RESPONSE:
{
  "tool": "Tell",
  "message": "Hello! I saw you walking over there."
}
`;

app.post('/api/npc/vision', async (req, res) => {
    try {
        const { base64Image, environmentData, history } = req.body;

        // 1. Validate Input
        if (!base64Image) throw new Error("Missing image data");

        const messages = [{ role: "system", content: SYSTEM_PROMPT }];

        // 2. Sliding Window Memory (Keeps the AI from getting confused by old data)
        if (history && Array.isArray(history)) {
            const recentHistory = history.slice(-6); // Only look at last 6 exchanges
            recentHistory.forEach(entry => {
                messages.push({ role: "user", content: `Past Context: ${entry.q}` });
                messages.push({ role: "assistant", content: JSON.stringify({ tool: entry.a }) });
            });
        }

        // 3. Current Frame Analysis
        // We wrap the base64 to ensure the header is always correct
        const formattedImage = base64Image.startsWith('data:') 
            ? base64Image 
            : `data:image/png;base64,${base64Image}`;

        messages.push({
            role: "user",
            content: [
                { 
                    type: "text", 
                    text: `ENVIRONMENT_SNAPSHOT: ${JSON.stringify(environmentData)}` 
                },
                { 
                    type: "image_url", 
                    image_url: { url: formattedImage } 
                }
            ]
        });

        // 4. Groq API Call
        const response = await groq.chat.completions.create({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: messages,
            response_format: { type: "json_object" },
            temperature: 0.15, // Low enough for logic, high enough for natural speech
            max_tokens: 300
        });

        const content = JSON.parse(response.choices[0].message.content);
        
        // Debug logging for Render console
        console.log(`[NPC] Tool: ${content.tool} | Msg: ${content.message || "..."}`);
        
        res.json(content);

    } catch (error) {
        console.error("### SERVER ERROR ###");
        console.error(error.message);
        
        // Fallback to prevent the NPC from breaking in-game
        res.status(500).json({ 
            tool: "Stop", 
            message: "My brain is fuzzy... (Server Error)" 
        });
    }
});

// Basic Health Check
app.get('/', (req, res) => res.send("NPC Engine: Running"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend live on port ${PORT}`));
