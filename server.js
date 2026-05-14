require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for base64 images

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// The System Prompt forces the AI to output ONLY valid JSON using the allowed tools
const SYSTEM_PROMPT = `
You are an intelligent NPC in a Roblox game.
Analyze the provided environment data and decide on your next action.
You must ONLY respond with valid JSON.
Choose exactly ONE tool from this list:
"Move_Forward", "Move_Backward", "Move_Left", "Move_Right", "Look_Left", "Look_Right", "Stop", "Tell"

If you choose "Tell", include a "message" field in your JSON.

Example Response:
{
  "tool": "Move_Forward"
}
`;

// ==========================================
// ENDPOINT 1: FAST TEXT LOOP (Every ~1 sec)
// ==========================================
app.post('/api/npc/think', async (req, res) => {
    try {
        const environmentData = req.body;
        
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `Current Environment: ${JSON.stringify(environmentData)}` }
            ],
            model: "llama-3.1-8b-instant",
            response_format: { type: "json_object" }, // Forces strict JSON return
            temperature: 0.3, // Keep low for consistent logic
        });

        const aiResponse = JSON.parse(completion.choices[0].message.content);
        res.json(aiResponse);

    } catch (error) {
        console.error("Text Loop Error:", error);
        res.status(500).json({ tool: "Stop", error: "AI Failed" });
    }
});

// ==========================================
// ENDPOINT 2: SLOW VISION LOOP (Every ~5 sec)
// ==========================================
app.post('/api/npc/vision', async (req, res) => {
    try {
        const { base64Image, environmentData } = req.body;

        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { 
                    role: "user", 
                    content: [
                        { type: "text", text: `Environment Data: ${JSON.stringify(environmentData)}. Analyze the image and decide what to do.` },
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                    ]
                }
            ],
            // Using the specific model you requested
            model: "meta-llama/llama-4-scout-17b-16e-instruct", 
            response_format: { type: "json_object" },
            temperature: 0.4,
        });

        const aiResponse = JSON.parse(completion.choices[0].message.content);
        res.json(aiResponse);

    } catch (error) {
        console.error("Vision Loop Error:", error);
        res.status(500).json({ tool: "Stop", error: "Vision Failed" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`NPC Backend running on port ${PORT}`);
});