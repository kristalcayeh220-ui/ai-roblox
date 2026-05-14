require('dotenv').config();
const express = require('express');[cite: 2]
const cors = require('cors');[cite: 2]
const Groq = require('groq-sdk');[cite: 2]

const app = express();
app.use(cors());[cite: 2]
// Essential for receiving 256x256 base64 images from Roblox
app.use(express.json({ limit: '20mb' }));[cite: 2]

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY[cite: 2]
});

// Your specific prompt requirements
const SYSTEM_PROMPT = `
You are a Roblox NPC Vision System. 
Analyze the image and environment data to choose the best next move.

RULES:
1. Only respond in valid JSON.
2. Use exactly one tool from the list.
3. Keep logic tactical (avoid obstacles, find players).

TOOLS:
"Move_Forward", "Move_Backward", "Move_Left", "Move_Right", "Look_Left", "Look_Right", "Stop", "Tell"

JSON FORMAT:
{
  "tool": "Move_Forward",
  "message": "Optional chat message here"
}
`;

app.post('/api/npc/vision', async (req, res) => {
    try {
        const { base64Image, environmentData, history } = req.body;

        if (!base64Image) {
            return res.status(400).json({ error: "No image provided" });
        }

        // Initialize messages with your system prompt
        const messages = [
            { role: "system", content: SYSTEM_PROMPT }
        ];

        // Add the last 10 Q&As from memory for context
        if (history && history.length > 0) {
            history.forEach(entry => {
                messages.push({ role: "user", content: `Last Request: ${entry.q}` });
                messages.push({ role: "assistant", content: JSON.stringify({ tool: entry.a }) });
            });
        }

        // Add the current visual frame and environment stats
        messages.push({
            role: "user",
            content: [
                {
                    type: "text",
                    text: `Environment Data: ${JSON.stringify(environmentData)}`
                },
                {
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${base64Image}`
                    }
                }
            ]
        });

        const response = await groq.chat.completions.create({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: messages,
            response_format: { type: "json_object" },
            temperature: 0.2, // Low temperature for tactical consistency
            max_tokens: 512
        });

        const decision = JSON.parse(response.choices[0].message.content);
        res.json(decision);

    } catch (error) {
        console.error("Vision Processing Error:", error);
        res.status(500).json({
            tool: "Stop",
            message: "System error occurred."
        });
    }
});

// Root route for Render health checks
app.get('/', (req, res) => res.send("NPC Vision Server Online"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
