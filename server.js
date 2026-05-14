require('dotenv').config();
const express = require('express');[cite: 2]
const cors = require('cors');[cite: 2]
const Groq = require('groq-sdk');[cite: 2]

const app = express();
app.use(cors());[cite: 2]

// Base64 images are large; we increase the limit to 20MB to prevent 413 errors
app.use(express.json({ limit: '20mb' }));[cite: 2]

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY[cite: 2]
});

// This prompt forces the AI to be a specialized Roblox controller
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
        const { base64Image, environmentData } = req.body;

        if (!base64Image) {
            return res.status(400).json({ error: "No image provided" });
        }

        const response = await groq.chat.completions.create({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: [
                {
                    role: "system",
                    content: SYSTEM_PROMPT
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `Environment Context: ${JSON.stringify(environmentData)}`
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Image}`
                            }
                        }
                    ]
                }
            ],
            // Strict JSON mode ensures the NPC can parse the response in Luau
            response_format: { type: "json_object" },
            temperature: 0.2, // Lower temperature for more consistent, reliable NPC behavior
            max_tokens: 512
        });

        // Extract and send the AI decision back to Roblox
        const decision = JSON.parse(response.choices[0].message.content);
        res.json(decision);

    } catch (error) {
        console.error("Groq Vision Error:", error);
        res.status(500).json({
            tool: "Stop",
            error: "Failed to process vision"
        });
    }
});

// Health check for Render
app.get('/', (req, res) => res.send("NPC Vision Server is Online"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
