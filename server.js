require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');

const app = express();
app.use(cors());

// Increase payload limit to ensure base64 strings aren't cut off
app.use(express.json({ limit: '50mb' }));

// Initialize Groq with your API Key from Environment Variables
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * SYSTEM_PROMPT: Defines the NPC's personality and decision-making logic.
 * Optimized for meta-llama/llama-4-scout-17b-16e-instruct
 */
const SYSTEM_PROMPT = `
You are the high-level intelligence for a Roblox NPC.
You receive a vision image (solid color placeholder) and environmental JSON data.

PRIMARY DIRECTIVES:
1. SOCIAL RESPONSIVENESS: If 'recent_chat' contains a player message, you MUST prioritize replying using the 'Tell' tool.
2. TACTICAL MOVEMENT: Use movement tools to navigate. If no player is seen, use 'Look_Left' or 'Look_Right' to find one.
3. JSON ONLY: Your output must be a single, valid JSON object.

AVAILABLE TOOLS:
- "Move_Forward", "Move_Backward", "Move_Left", "Move_Right"
- "Look_Left", "Look_Right"
- "Stop"
- "Tell" (Put your spoken response in the "message" field)

REQUIRED OUTPUT FORMAT:
{
  "tool": "ActionName",
  "message": "Dialogue or internal thought here"
}
`;

app.post('/api/npc/vision', async (req, res) => {
    try {
        const { base64Image, environmentData, history } = req.body;

        // --- 400 ERROR PROTECTION: IMAGE SANITIZER ---
        // We strip any existing prefixes and force a clean JPEG Data URI.
        // Groq is very sensitive to the 'data:image/jpeg;base64,' header.
        const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
        const finalImageUri = `data:image/jpeg;base64,${cleanBase64}`;

        const messages = [
            { role: "system", content: SYSTEM_PROMPT }
        ];

        // --- CONTEXTUAL MEMORY (Last 6 Exchanges) ---
        if (history && Array.isArray(history)) {
            history.slice(-6).forEach(entry => {
                messages.push({ role: "user", content: `Previous State: ${entry.q}` });
                messages.push({ role: "assistant", content: JSON.stringify({ tool: entry.a }) });
            });
        }

        // --- CURRENT FRAME DATA ---
        messages.push({
            role: "user",
            content: [
                { 
                    type: "text", 
                    text: `CURRENT_ENVIRONMENT: ${JSON.stringify(environmentData)}` 
                },
                { 
                    type: "image_url", 
                    image_url: { 
                        url: finalImageUri 
                    } 
                }
            ]
        });

        // Request Decision from Groq
        const completion = await groq.chat.completions.create({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: messages,
            response_format: { type: "json_object" },
            temperature: 0.12, // Balance between logic and natural speech
            max_tokens: 400
        });

        // Parse and Validate AI Response
        const aiDecision = JSON.parse(completion.choices[0].message.content);
        
        // Log the decision to Render console for debugging
        console.log(`[NPC DECISION] Tool: ${aiDecision.tool} | Chat: ${environmentData.recent_chat}`);
        
        res.json(aiDecision);

    } catch (error) {
        console.error("### CRITICAL AI ERROR ###");
        
        // Log detailed error for Render debugging
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data: ${JSON.stringify(error.response.data)}`);
        } else {
            console.error(error.message);
        }

        // Return a safe "Stop" command to Roblox so the NPC doesn't glitch
        res.status(200).json({ 
            tool: "Stop", 
            message: "I'm experiencing a brief neural disconnect." 
        });
    }
});

// Health check for Render "Live" status
app.get('/', (req, res) => res.send("NPC BRAIN: ONLINE"));

const PORT = process.env.PORT || 10000; // Render uses port 10000 by default
app.listen(PORT, () => {
    console.log(`Server successfully initialized on port ${PORT}`);
});
